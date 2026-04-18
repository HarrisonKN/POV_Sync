import { Router } from 'express';
import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth } from '../lib/supabaseAuth.js';
import { generateLinkCode, detectPlatform } from '../../../shared/helpers.js';
import * as syncManager from '../services/syncManager.js';
import { broadcastToSession, setControlDelegation } from '../websocket/index.js';
import { fetchActualStartTime } from '../lib/youtubeApi.js';

const router = Router();

async function finalizeSessionEnd(sessionId) {
  const nowIso = new Date().toISOString();

  const { data: allStreams, error: streamsError } = await supabaseAdmin
    .from('streams')
    .select('id, is_anchor, youtube_start_time, is_active')
    .eq('session_id', sessionId);

  if (streamsError) throw streamsError;

  const anchor = allStreams?.find((stream) => stream.is_anchor);
  if (anchor?.youtube_start_time && allStreams?.length > 0) {
    const anchorStart = anchor.youtube_start_time;
    for (const stream of allStreams) {
      if (stream.id === anchor.id) continue;
      if (stream.youtube_start_time) {
        const offset = Math.round((stream.youtube_start_time - anchorStart) * 100) / 100;
        await supabaseAdmin
          .from('streams')
          .update({ offset_seconds: offset })
          .eq('id', stream.id);
        console.log(`[API] Saved VOD offset for stream ${stream.id.slice(0, 8)}: ${offset}s`);
      }
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from('sessions')
    .update({
      status: 'ended',
      ended_at: nowIso,
      vod_ready_at: nowIso,
    })
    .eq('id', sessionId)
    .neq('status', 'ended');

  if (updateError) throw updateError;

  syncManager.stopSession(sessionId);

  return { endedAt: nowIso, streamCount: allStreams?.length ?? 0 };
}

async function autoEndSessionIfNoActiveStreams(sessionId) {
  const { data: session, error: sessionError } = await supabaseAdmin
    .from('sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session || session.status === 'ended') {
    return { ended: false, reason: 'session-unavailable' };
  }

  const { count, error: activeCountError } = await supabaseAdmin
    .from('streams')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId)
    .eq('is_active', true);

  if (activeCountError) throw activeCountError;

  if ((count ?? 0) > 0) {
    return { ended: false, reason: 'streams-still-active', activeCount: count ?? 0 };
  }

  const result = await finalizeSessionEnd(sessionId);
  console.log(`[API] Auto-ended session ${sessionId} after all streams became inactive`);
  return { ended: true, ...result };
}

async function archiveStreamAndMaybeFinalizeSession(sessionId, streamId) {
  const nowIso = new Date().toISOString();

  const { data: stream, error: streamError } = await supabaseAdmin
    .from('streams')
    .select('id, session_id, is_anchor, is_active, left_at')
    .eq('id', streamId)
    .eq('session_id', sessionId)
    .single();

  if (streamError || !stream) {
    return { found: false, archived: false, sessionEnded: false };
  }

  if (stream.is_active !== false) {
    const { error: archiveError } = await supabaseAdmin
      .from('streams')
      .update({
        is_active: false,
        is_anchor: false,
        left_at: stream.left_at || nowIso,
      })
      .eq('id', stream.id);

    if (archiveError) throw archiveError;

    syncManager.removeStream(sessionId, stream.id);
  }

  let promotedAnchorStreamId = null;
  if (stream.is_anchor) {
    const { data: replacementStream, error: replacementError } = await supabaseAdmin
      .from('streams')
      .select('id')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .order('joined_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (replacementError) throw replacementError;

    if (replacementStream?.id) {
      promotedAnchorStreamId = replacementStream.id;
      const { error: clearAnchorError } = await supabaseAdmin
        .from('sessions')
        .update({ anchor_stream_id: replacementStream.id })
        .eq('id', sessionId);

      if (clearAnchorError) throw clearAnchorError;

      const { error: markAnchorError } = await supabaseAdmin
        .from('streams')
        .update({ is_anchor: true })
        .eq('id', replacementStream.id)
        .eq('session_id', sessionId);

      if (markAnchorError) throw markAnchorError;

      syncManager.promoteAnchor(sessionId, replacementStream.id);
      broadcastToSession(sessionId, {
        type: 'ANCHOR_AUTO_PROMOTED',
        sessionId,
        streamId: replacementStream.id,
      });
    } else {
      const { error: clearAnchorError } = await supabaseAdmin
        .from('sessions')
        .update({ anchor_stream_id: null })
        .eq('id', sessionId);

      if (clearAnchorError) throw clearAnchorError;
    }
  }

  const autoEndResult = await autoEndSessionIfNoActiveStreams(sessionId);
  return {
    found: true,
    archived: stream.is_active !== false,
    promotedAnchorStreamId,
    sessionEnded: autoEndResult.ended === true,
  };
}

// ── Param validators ──────────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid session ID format' });
  }
  next();
});
router.param('streamId', (req, res, next, streamId) => {
  if (!UUID_RE.test(streamId)) {
    return res.status(400).json({ error: 'Invalid stream ID format' });
  }
  next();
});

// POST /api/sessions — Create a new session
router.post('/', requireAuth, async (req, res) => {
  try {
    const hostId = req.supabaseUser?.id;

    const rawEntries = Array.isArray(req.body.streams)
      ? req.body.streams
      : [{ youtubeUrl: req.body.youtubeUrl ?? req.body.streamUrl, displayName: req.body.displayName }];

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
    const shareLink = generateLinkCode(10);

    // Use authenticated client so RLS passes (auth.uid() = host_id)
    const db = req.supabase;

    // Optional session title (trimmed, max 80 chars)
    const title = typeof req.body.title === 'string' ? req.body.title.trim().slice(0, 80) || null : null;

    // Create the session
    console.log('[API] Inserting session...');
    const { data: session, error: sessionError } = await db
      .from('sessions')
      .insert({
        host_id: hostId,
        participant_link: participantLink,
        spectator_link: spectatorLink,
        share_link: shareLink,
        status: 'live',
        ...(title && { title }),
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

    // Proactively fetch authoritative start time from YouTube API (non-blocking)
    fetchActualStartTime(primaryStream.youtubeUrl).then((ytStartTime) => {
      if (!ytStartTime) return;
      supabaseAdmin.from('streams').update({ youtube_start_time: ytStartTime }).eq('id', stream.id).then(() => {
        syncManager.reportStartTime(session.id, stream.id, ytStartTime);
        console.log(`[API] YouTube actualStartTime saved for anchor stream ${stream.id.slice(0,8)}: ${ytStartTime}`);
      });
    }).catch(() => {});

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
      fetchActualStartTime(entry.youtubeUrl).then((ytStartTime) => {
        if (!ytStartTime) return;
        supabaseAdmin.from('streams').update({ youtube_start_time: ytStartTime }).eq('id', extraStream.id).then(() => {
          syncManager.reportStartTime(session.id, extraStream.id, ytStartTime);
        });
      }).catch(() => {});
    }

    res.json({
      session: { ...session, anchor_stream_id: stream.id },
      stream,
      streams: [stream, ...extraStreams],
      participantLink,
      spectatorLink,
      shareLink,
    });
  } catch (err) {
    console.error('[API] Error creating session:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/room/:code — Resolve a share_link to session info + internal codes
// Used by the RoleSelect page so joiners can pick their role before being
// routed to the appropriate internal flow.
router.get('/room/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('id, host_id, participant_link, spectator_link, share_link, status, title, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, youtube_start_time, platform, offset_seconds, is_anchor, is_active)')
      .eq('share_link', code)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // The share_link IS the authorization gate — once the joiner has it they
    // are allowed to see the internal routing codes so RoleSelect can redirect
    // them to /join/:participant_link or /watch/:spectator_link.
    const { share_link, ...sessionPayload } = session;
    res.json({ session: sessionPayload });
  } catch (err) {
    console.error('Error fetching session by share_link:', err);
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// GET /api/sessions/join/:code — Get session by participant link code
router.get('/join/:code', async (req, res) => {
  try {
    const { code } = req.params;
    console.log('[API] GET /join/:code —', code);

    const { data: session, error } = await supabaseAdmin
      .from('sessions')
      .select('id, host_id, participant_link, spectator_link, status, anchor_stream_id, created_at, ended_at, vod_ready_at, title, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, youtube_start_time, platform, offset_seconds, is_anchor, is_active, joined_at, left_at)')
      .eq('participant_link', code)
      .single();

    console.log('[API] Join query result — data:', !!session, 'error:', error?.message ?? 'none', 'code:', error?.code ?? 'none');

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Strip spectator link — join participants shouldn't see it
    const { spectator_link, ...safeSession } = session;
    res.json({ session: safeSession });
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
      .select('id, host_id, participant_link, spectator_link, status, anchor_stream_id, created_at, ended_at, vod_ready_at, title, streams!streams_session_id_fkey(id, display_name, user_id, youtube_url, youtube_start_time, platform, offset_seconds, is_anchor, is_active, joined_at, left_at)')
      .eq('spectator_link', code)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Strip participant link — spectators should not see it
    const { participant_link, ...safeSession } = session;
    res.json({ session: safeSession });
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
      : [{ youtubeUrl: req.body.youtubeUrl ?? req.body.streamUrl, displayName: req.body.displayName }];

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

    // Verify session exists and is live (select only needed fields, not *)
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, host_id, status')
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

    const nextPovIndex = (count ?? 0) + 1;

    // Use authenticated client for INSERT (RLS: auth.uid() = user_id)
    const db = req.supabase;

    const insertedStreams = [];
    syncManager.startSession(id, (msg) => broadcastToSession(id, msg));

    for (const entry of incomingStreams) {
      const fallbackLabel = `POV ${nextPovIndex + insertedStreams.length}`;
      const { data: stream, error: streamError } = await db
        .from('streams')
        .insert({
          session_id: id,
          user_id: req.supabaseUser.id,
          display_name: entry.displayName || fallbackLabel,
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
      fetchActualStartTime(entry.youtubeUrl).then((ytStartTime) => {
        if (!ytStartTime) return;
        supabaseAdmin.from('streams').update({ youtube_start_time: ytStartTime }).eq('id', stream.id).then(() => {
          syncManager.reportStartTime(id, stream.id, ytStartTime);
        });
      }).catch(() => {});
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

// POST /api/sessions/:id/sync-to-latest — Promote the latest-starting synced stream to anchor
router.post('/:id/sync-to-latest', requireAuth, async (req, res) => {
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

    if (req.supabaseUser?.id !== session.host_id) {
      return res.status(403).json({ error: 'Only the host can change the sync baseline' });
    }

    const { data: syncedStreams, error: streamsError } = await supabaseAdmin
      .from('streams')
      .select('id, display_name, youtube_start_time, is_anchor')
      .eq('session_id', id)
      .eq('is_active', true)
      .not('youtube_start_time', 'is', null)
      .order('youtube_start_time', { ascending: false });

    if (streamsError) throw streamsError;

    const latestStream = syncedStreams?.[0];
    if (!latestStream) {
      return res.status(400).json({ error: 'No synced POV start times are available yet' });
    }

    if (!latestStream.is_anchor) {
      const db = req.supabase;

      const { error: clearError } = await db
        .from('streams')
        .update({ is_anchor: false })
        .eq('session_id', id);

      if (clearError) throw clearError;

      const { error: setAnchorError } = await db
        .from('streams')
        .update({ is_anchor: true })
        .eq('id', latestStream.id)
        .eq('session_id', id);

      if (setAnchorError) throw setAnchorError;

      const { error: sessionUpdateError } = await db
        .from('sessions')
        .update({ anchor_stream_id: latestStream.id })
        .eq('id', id);

      if (sessionUpdateError) throw sessionUpdateError;

      syncManager.promoteAnchor(id, latestStream.id);
    }

    res.json({
      success: true,
      streamId: latestStream.id,
      displayName: latestStream.display_name,
      youtubeStartTime: latestStream.youtube_start_time,
      alreadyLatestAnchor: !!latestStream.is_anchor,
    });
  } catch (err) {
    console.error('Error syncing to latest stream:', err);
    res.status(500).json({ error: 'Failed to sync to latest POV' });
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

    // Try to get authoritative actualStartTime from YouTube Data API.
    // Fall back to client-submitted synthetic value if no API key or request fails.
    const streamRow = await supabaseAdmin
      .from('streams').select('youtube_url').eq('id', streamId).single();
    let resolvedStartTime = startTime;
    if (streamRow.data?.youtube_url) {
      const ytTime = await fetchActualStartTime(streamRow.data.youtube_url);
      if (ytTime) {
        resolvedStartTime = ytTime;
        console.log(`[API] Using YouTube actualStartTime (${ytTime}) instead of synthetic (${startTime}) for stream ${streamId.slice(0,8)}`);
      }
    }

    const db = req.supabase;
    const { error } = await db
      .from('streams')
      .update({ youtube_start_time: resolvedStartTime })
      .eq('id', streamId)
      .eq('session_id', id);

    if (error) throw error;

    // Tell syncManager about the resolved time immediately
    syncManager.reportStartTime(id, streamId, resolvedStartTime);

    res.json({ success: true, startTime: resolvedStartTime, source: resolvedStartTime !== startTime ? 'youtube-api' : 'synthetic' });
  } catch (err) {
    console.error('Error saving start time:', err);
    res.status(500).json({ error: 'Failed to save start time' });
  }
});

// POST /api/sessions/:id/backfill-start-times — Fetch actualStartTime from YouTube API
// for any stream in the session that is missing youtube_start_time.
// Useful for VODs where start times were never captured during the live session.
router.post('/:id/backfill-start-times', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: streams, error } = await supabaseAdmin
      .from('streams')
      .select('id, youtube_url, youtube_start_time, display_name')
      .eq('session_id', id);

    if (error) throw error;
    if (!streams?.length) return res.json({ updated: [] });

    const updated = [];
    for (const stream of streams) {
      // Skip streams that already have a start time
      if (Number.isFinite(stream.youtube_start_time) && stream.youtube_start_time > 0) {
        console.log(`[Backfill] ${stream.display_name} (${stream.id.slice(0,8)}): already has start time ${stream.youtube_start_time}`);
        continue;
      }
      const ytStartTime = await fetchActualStartTime(stream.youtube_url);
      if (!ytStartTime) {
        console.log(`[Backfill] ${stream.display_name} (${stream.id.slice(0,8)}): YouTube API returned no start time`);
        continue;
      }
      const { error: updateError } = await supabaseAdmin
        .from('streams')
        .update({ youtube_start_time: ytStartTime })
        .eq('id', stream.id);
      if (updateError) {
        console.error(`[Backfill] Failed to update stream ${stream.id.slice(0,8)}:`, updateError);
        continue;
      }
      updated.push({ streamId: stream.id, displayName: stream.display_name, startTime: ytStartTime });
      console.log(`[Backfill] ${stream.display_name} (${stream.id.slice(0,8)}): saved actualStartTime ${ytStartTime} (${new Date(ytStartTime * 1000).toISOString()})`);
    }

    res.json({ updated, totalStreams: streams.length });
  } catch (err) {
    console.error('Error backfilling start times:', err);
    res.status(500).json({ error: 'Failed to backfill start times' });
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

// POST /api/sessions/:id/streams/:streamId/auto-inactive — auto-archive a stream that ended/offlined
router.post('/:id/streams/:streamId/auto-inactive', requireAuth, async (req, res) => {
  try {
    const { id, streamId } = req.params;
    const authUser = req.supabaseUser;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('host_id, status')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status === 'ended') {
      return res.json({ success: true, archived: false, sessionEnded: true });
    }

    const { data: stream, error: streamError } = await supabaseAdmin
      .from('streams')
      .select('id, user_id, is_active')
      .eq('id', streamId)
      .eq('session_id', id)
      .single();

    if (streamError || !stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    const isHost = authUser?.id === session.host_id;
    const isOwner = authUser?.id === stream.user_id;
    if (!isHost && !isOwner) {
      return res.status(403).json({ error: 'Only the stream owner or host can auto-archive this stream' });
    }

    const result = await archiveStreamAndMaybeFinalizeSession(id, streamId);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Error auto-archiving stream:', err);
    res.status(500).json({ error: 'Failed to auto-archive stream' });
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

    const autoEnd = await autoEndSessionIfNoActiveStreams(id);

    res.json({ success: true, archivedStreamId: stream.id, sessionEnded: autoEnd.ended === true });
  } catch (err) {
    console.error('Error leaving session:', err);
    res.status(500).json({ error: 'Failed to leave session' });
  }
});

// POST /api/sessions/:id/end — End a session
router.post('/:id/end', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    console.log(`[API] POST /api/sessions/${id}/end — user=${req.supabaseUser?.id?.slice(0, 8) ?? 'unknown'}`);

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

    await finalizeSessionEnd(id);

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

// DELETE /api/sessions/:id/streams/:streamId — host removes a participant
// Sets is_active=false on the stream and broadcasts STREAM_REMOVED to all
// session clients so every filmstrip updates instantly.
router.delete('/:id/streams/:streamId', requireAuth, async (req, res) => {
  try {
    const { id, streamId } = req.params;
    const authUser = req.supabaseUser;

    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('host_id, status')
      .eq('id', id)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (authUser?.id !== session.host_id) {
      return res.status(403).json({ error: 'Only the host can remove participants' });
    }

    if (session.status === 'ended') {
      return res.status(400).json({ error: 'Session has already ended' });
    }

    const { data: stream, error: streamError } = await supabaseAdmin
      .from('streams')
      .select('id, user_id, is_anchor, is_active')
      .eq('id', streamId)
      .eq('session_id', id)
      .single();

    if (streamError || !stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }

    if (stream.user_id === authUser?.id) {
      return res.status(400).json({ error: 'Use End Session to remove yourself as host' });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('streams')
      .update({ is_active: false, left_at: nowIso })
      .eq('id', streamId);

    if (updateError) throw updateError;

    syncManager.removeStream(id, streamId);

    // Broadcast to all connected clients so their filmstrips update immediately
    broadcastToSession(id, { type: 'STREAM_REMOVED', streamId });

    const autoEnd = await autoEndSessionIfNoActiveStreams(id);

    res.json({ success: true, removedStreamId: streamId, sessionEnded: autoEnd.ended === true });
  } catch (err) {
    console.error('Error removing participant stream:', err);
    res.status(500).json({ error: 'Failed to remove participant' });
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
