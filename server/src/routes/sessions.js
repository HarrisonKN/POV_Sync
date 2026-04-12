import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth } from '../lib/supabaseAuth.js';
import { generateLinkCode, detectPlatform } from '../../../shared/helpers.js';
import * as syncManager from '../services/syncManager.js';
import { broadcastToSession, setControlDelegation } from '../websocket/index.js';

const router = Router();

// ── Param validators ──────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  next();
});

// POST /api/sessions — Create a new session
router.post('/', requireAuth, async (req, res) => {
  try {
    const hostId = req.supabaseUser?.id;

    const rawEntries = Array.isArray(req.body.streams)
      ? req.body.streams
      : [{ youtubeUrl: req.body.youtubeUrl, displayName: req.body.displayName }];

    if (!hostId || rawEntries.length === 0) {
      return res.status(400).json({ error: 'At least one stream URL is required' });
    }

    const incomingStreams = rawEntries
      .map((entry, index) => {
        const youtubeUrl = String(entry?.youtubeUrl ?? entry?.streamUrl ?? '').trim();
        const displayName = String(entry?.displayName ?? '').trim().slice(0, 40);
        const label = displayName || `POV ${index + 1}`;
        const platform = detectPlatform(youtubeUrl);
        return { youtubeUrl, displayName: label, platform };
      })
      .filter((entry) => entry.youtubeUrl.length > 0);

    if (incomingStreams.length === 0) {
      return res.status(400).json({ error: 'At least one stream URL is required' });
    }

    for (const entry of incomingStreams) {
      if (!entry.platform) {
        return res.status(400).json({ error: 'Invalid stream URL. Provide a YouTube or Twitch link.' });
      }
    }

    if (incomingStreams.length > 5) {
      return res.status(400).json({ error: 'Session is full (max 5 streams for MVP)' });
    }

    const primaryStream = incomingStreams[0];

    console.log(`[API] POST /api/sessions — host=${hostId.slice(0, 8)}`);

    const participantLink = generateLinkCode(10);
    const spectatorLink = generateLinkCode(10);

    // Use authenticated client so RLS passes (auth.uid() = host_id)
    const db = req.supabase;

    // Create the session
    console.log('[API] Inserting session...');
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .insert({
        host_id: hostId,
        participant_link: participantLink,
        spectator_link: spectatorLink,
        status: 'live',
      })
      .select()
      .single();

    if (sessionError) {
      console.error('[API] Session insert error:', sessionError);
      throw sessionError;
    }
    console.log('[API] Session created:', session.id);

    // Create the host's stream (first stream = anchor)
    console.log('[API] Inserting anchor stream...');
    const { data: stream, error: streamError } = await db
      .from('streams')
      .insert({
        session_id: session.id,
        user_id: hostId,
        display_name: primaryStream.displayName,
        youtube_url: primaryStream.youtubeUrl,
        platform: primaryStream.platform,
        offset_seconds: 0,
        is_anchor: true,
      })
      .select()
      .single();

    if (streamError) {
      console.error('[API] Stream insert error:', streamError);
      throw streamError;
    }
    console.log('[API] Stream created:', stream.id);

    // Update session to point to anchor stream
    console.log('[API] Updating session anchor...');
    const { error: updateError } = await db
      .from('sessions')
      .update({ anchor_stream_id: stream.id })
      .eq('id', session.id);

    if (updateError) {
      console.error('[API] Session update error:', updateError);
      throw updateError;
    }
    console.log('[API] Session creation complete!');

    // Register stream with sync manager (lightweight — no audio pipeline)
    syncManager.startSession(session.id, (msg) => broadcastToSession(session.id, msg));
    syncManager.addStream(session.id, stream.id, primaryStream.youtubeUrl, true);

    const extraStreams = [];
    for (const entry of incomingStreams.slice(1)) {
      const { data: extraStream, error: extraStreamError } = await db
        .from('streams')
        .insert({
          session_id: session.id,
          user_id: hostId,
          display_name: entry.displayName,
          youtube_url: entry.youtubeUrl,
          platform: entry.platform,
          offset_seconds: 0,
          is_anchor: false,
        })
        .select()
        .single();

      if (extraStreamError) {
        console.error('[API] Extra stream insert error:', extraStreamError);
        throw extraStreamError;
      }

      extraStreams.push(extraStream);
      syncManager.addStream(session.id, extraStream.id, entry.youtubeUrl, false);
    }

    res.json({
      session: { ...session, anchor_stream_id: stream.id },
      stream,
      streams: [stream, ...extraStreams],
      participantLink,
      spectatorLink,
    });
  } catch (err) {
    console.error('[API] Error creating session:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/join/:code — Get session by participant link code
router.get('/join/:code', async (req, res) => {
  try {
    const { code } = req.params;
    console.log('[API] GET /join/:code —', code);

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('id, host_id, participant_link, spectator_link, status, anchor_stream_id, created_at, ended_at, vod_ready_at, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, platform, offset_seconds, is_anchor, is_active, joined_at, left_at)')
      .eq('participant_link', code)
      .single();

    console.log('[API] Join query result — data:', !!session, 'error:', error?.message ?? 'none', 'code:', error?.code ?? 'none');

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session });
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/sessions/watch/:code — Get session by spectator link code
router.get('/watch/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('id, host_id, participant_link, spectator_link, status, anchor_stream_id, created_at, ended_at, vod_ready_at, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, platform, offset_seconds, is_anchor, is_active, joined_at, left_at)')
      .eq('spectator_link', code)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ session });
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// POST /api/sessions/:id/streams — Add a stream to a session (participant joining)
router.post('/:id/streams', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.supabaseUser?.id;

    const rawEntries = Array.isArray(req.body.streams)
      ? req.body.streams
      : [{ youtubeUrl: req.body.youtubeUrl, displayName: req.body.displayName }];

    if (!userId || rawEntries.length === 0) {
      return res.status(400).json({ error: 'At least one stream URL is required' });
    }

    const incomingStreams = rawEntries
      .map((entry, index) => {
        const youtubeUrl = String(entry?.youtubeUrl ?? entry?.streamUrl ?? '').trim();
        const displayName = String(entry?.displayName ?? '').trim().slice(0, 40);
        const label = displayName || `POV ${index + 1}`;
        const platform = detectPlatform(youtubeUrl);

        return { youtubeUrl, displayName: label, platform };
      })
      .filter((entry) => entry.youtubeUrl.length > 0);

    if (incomingStreams.length === 0) {
      return res.status(400).json({ error: 'At least one stream URL is required' });
    }

    for (const entry of incomingStreams) {
      if (!entry.platform) {
        return res.status(400).json({ error: 'Invalid stream URL. Provide a YouTube or Twitch link.' });
      }
    }

    // Use unauthenticated client for reads (SELECT policies allow public read)
    // Verify session exists and is live
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('*')
      .eq('id', id)
      .eq('status', 'live')
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Live session not found' });
    }

    // Check stream count
    const { count } = await supabaseAdmin
      .from('streams')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', id);

    if ((count ?? 0) + incomingStreams.length > 5) {
      return res.status(400).json({ error: 'Session is full (max 5 streams for MVP)' });
    }

    // Use authenticated client for INSERT (RLS: auth.uid() = user_id)
    const db = req.supabase;

    const insertedStreams = [];
    syncManager.startSession(id, (msg) => broadcastToSession(id, msg));

    for (const entry of incomingStreams) {
      const { data: stream, error: streamError } = await db
        .from('streams')
        .insert({
          session_id: id,
          user_id: req.supabaseUser.id,
          display_name: entry.displayName,
          youtube_url: entry.youtubeUrl,
          platform: entry.platform,
          offset_seconds: 0,
          is_anchor: false,
        })
        .select()
        .single();

      if (streamError) throw streamError;

      insertedStreams.push(stream);
      syncManager.addStream(id, stream.id, entry.youtubeUrl, false);
    }

    res.json({ stream: insertedStreams[0], streams: insertedStreams });
  } catch (err) {
    console.error('Error adding stream:', err);
    res.status(500).json({ error: 'Failed to add stream' });
  }
});

// POST /api/sessions/:id/promote-anchor — Promote a stream to anchor
router.post('/:id/promote-anchor', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { streamId } = req.body;

    if (!streamId) {
      return res.status(400).json({ error: 'streamId is required' });
    }

    // Verify requester is the session host
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('host_id')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const authUser = req.supabaseUser;
    if (authUser?.id !== session.host_id) {
      return res.status(403).json({ error: 'Only the host can promote the anchor' });
    }

    const db = req.supabase;

    // Clear existing anchor flag
    await db
      .from('streams')
      .update({ is_anchor: false })
      .eq('session_id', id);

    // Set new anchor (scoped to session for safety)
    const { error: updateError } = await db
      .from('streams')
      .update({ is_anchor: true })
      .eq('id', streamId)
      .eq('session_id', id);

    if (updateError) throw updateError;

    // Update session anchor reference
    await db
      .from('sessions')
      .update({ anchor_stream_id: streamId })
      .eq('id', id);

    // Tell sync manager
    syncManager.promoteAnchor(id, streamId);

    res.json({ success: true, newAnchorStreamId: streamId });
  } catch (err) {
    console.error('Error promoting anchor:', err);
    res.status(500).json({ error: 'Failed to promote anchor' });
  }
});

// PATCH /api/sessions/:id/streams/:streamId/start-time — Persist YouTube stream start time
// Called by the client after player.getVideoStartTime() resolves, so VOD recalculation
// works correctly even after a server restart (no audio data retained between restarts).
router.patch('/:id/streams/:streamId/start-time', requireAuth, async (req, res) => {
  try {
    const { id, streamId } = req.params;
    const { startTime } = req.body; // Unix timestamp (seconds) from YT IFrame API

    if (typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime <= 0 || startTime > 4e10) {
      return res.status(400).json({ error: 'startTime must be a finite positive Unix timestamp' });
    }

    const db = req.supabase;
    const { error } = await db
      .from('streams')
      .update({ youtube_start_time: startTime })
      .eq('id', streamId)
      .eq('session_id', id);

    if (error) throw error;

    res.json({ success: true, startTime });
  } catch (err) {
    console.error('Error saving start time:', err);
    res.status(500).json({ error: 'Failed to save start time' });
  }
});

// PATCH /api/sessions/:id/streams/:streamId/offset — Update a stream's offset
router.patch('/:id/streams/:streamId/offset', requireAuth, async (req, res) => {
  try {
    const { id, streamId } = req.params;
    const { offsetSeconds } = req.body;

    if (typeof offsetSeconds !== 'number' || !Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 86400) {
      return res.status(400).json({ error: 'offsetSeconds must be a finite number within ±24h' });
    }

    // RLS: stream owner or session host can update
    const db = req.supabase;
    const { error } = await db
      .from('streams')
      .update({ offset_seconds: offsetSeconds })
      .eq('id', streamId)
      .eq('session_id', id);

    if (error) throw error;

    res.json({ success: true, offsetSeconds });
  } catch (err) {
    console.error('Error updating offset:', err);
    res.status(500).json({ error: 'Failed to update offset' });
  }
});

// POST /api/sessions/:id/leave — Participant leaves a session (archives their stream)
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const authUser = req.supabaseUser;
    if (!authUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Find the participant's stream in this session
    const { data: stream, error: findError } = await supabaseAdmin
      .from('streams')
      .select('id, is_anchor')
      .eq('session_id', id)
      .eq('user_id', authUser.id)
      .single();

    if (findError || !stream) {
      return res.status(404).json({ error: 'You do not have a stream in this session' });
    }

    // Prevent anchor from leaving (host should end the session instead)
    if (stream.is_anchor) {
      return res.status(400).json({ error: 'The anchor/host cannot leave. End the session instead.' });
    }

    // Soft-archive the stream so the VOD keeps the participant's POV history.
    const db = req.supabase;
    const { error: archiveError } = await db
      .from('streams')
      .update({
        is_active: false,
        left_at: new Date().toISOString(),
      })
      .eq('id', stream.id);

    if (archiveError) throw archiveError;

    // Remove from sync manager
    syncManager.removeStream(id, stream.id);

    res.json({ success: true, archivedStreamId: stream.id });
  } catch (err) {
    console.error('Error leaving session:', err);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

// POST /api/sessions/:id/end — End a session
router.post('/:id/end', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verify the requester is the host (public read is fine)
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('host_id')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.host_id !== req.supabaseUser?.id) {
      return res.status(403).json({ error: 'Only the host can end the session' });
    }

    // Fetch all streams to compute final VOD offsets from UTC start times
    const { data: allStreams } = await supabaseAdmin
      .from('streams')
      .select('id, is_anchor, youtube_start_time, is_active')
      .eq('session_id', id);

    const anchor = allStreams?.find((s) => s.is_anchor);
    if (anchor?.youtube_start_time && allStreams?.length > 0) {
      const anchorStart = anchor.youtube_start_time;
      for (const stream of allStreams) {
        if (stream.id === anchor.id) continue;
        if (stream.youtube_start_time) {
          const offset = Math.round((stream.youtube_start_time - anchorStart) * 100) / 100;
          // Save computed offset to DB so VOD playback works without the sync server
          await supabaseAdmin
            .from('streams')
            .update({ offset_seconds: offset })
            .eq('id', stream.id);
          console.log(`[API] Saved VOD offset for stream ${stream.id.slice(0, 8)}: ${offset}s`);
        }
      }
    }

    // Use authenticated client for UPDATE (RLS: auth.uid() = host_id)
    const { error: updateError } = await supabaseAdmin
      .from('sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        vod_ready_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Clean up sync manager
    syncManager.stopSession(id);

    res.json({ success: true });
  } catch (err) {
    console.error('Error ending session:', err);
    res.status(500).json({ error: 'Failed to end session' });
  }
});

// POST /api/sessions/:id/delegate — host grants controls to another participant
router.post('/:id/delegate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { delegateeUserId } = req.body;

    if (!delegateeUserId) {
      return res.status(400).json({ error: 'delegateeUserId is required' });
    }

    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('host_id')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const authUser = req.supabaseUser;
    if (authUser?.id !== session.host_id) {
      return res.status(403).json({ error: 'Only the host can delegate control' });
    }

    // Delegatee must be a participant in this session
    const { data: targetStream } = await supabaseAdmin
      .from('streams')
      .select('id, display_name')
      .eq('session_id', id)
      .eq('user_id', delegateeUserId)
      .single();

    if (!targetStream) {
      return res.status(404).json({ error: 'Delegatee is not a participant in this session' });
    }

    // Set in WS layer and broadcast CONTROL_STATE
    setControlDelegation(id, session.host_id, delegateeUserId);

    res.json({ success: true, delegateeUserId });
  } catch (err) {
    console.error('Error delegating control:', err);
    res.status(500).json({ error: 'Failed to delegate control' });
  }
});

// POST /api/sessions/:id/revoke-control — host takes controls back
router.post('/:id/revoke-control', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: session, error: fetchError } = await supabaseAdmin
      .from('sessions')
      .select('host_id')
      .eq('id', id)
      .single();

    if (fetchError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const authUser = req.supabaseUser;
    if (authUser?.id !== session.host_id) {
      return res.status(403).json({ error: 'Only the host can revoke control' });
    }

    setControlDelegation(id, session.host_id, null);

    res.json({ success: true });
  } catch (err) {
    console.error('Error revoking control:', err);
    res.status(500).json({ error: 'Failed to revoke control' });
  }
});

export default router;
