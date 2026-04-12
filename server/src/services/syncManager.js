/**
 * syncManager.js — Simple UTC-offset sync manager.
 *
 * For LIVE streams:
 *   YouTube handles real-time sync inherently — all viewers watching the same
 *   live stream see the same real-world moment. No server-side sync needed.
 *   The client handles minor drift correction every 8s.
 *
 * For VODs:
 *   Each stream's youtube_start_time (UTC Unix timestamp) is captured during
 *   the live phase via synthetic computation (Date.now()/1000 - getCurrentTime()).
 *   When viewing a VOD, offset = streamStartUTC - anchorStartUTC.
 *   One subtraction per stream — simple, exact, no audio processing needed.
 *
 * This module:
 *   - Tracks start times reported by clients
 *   - Calculates UTC-based offsets
 *   - Broadcasts SYNC_OFFSETS to clients every 4s (for live status display)
 *   - Handles anchor promotion and stream removal
 *
 * Public API:
 *   syncManager.startSession(sessionId, broadcastFn)
 *   syncManager.addStream(sessionId, streamId, youtubeUrl, isAnchor)
 *   syncManager.registerStream(sessionId, streamId, isAnchor)
 *   syncManager.reportStartTime(sessionId, streamId, startTimeUnix)
 *   syncManager.promoteAnchor(sessionId, newAnchorStreamId)
 *   syncManager.removeStream(sessionId, streamId)
 *   syncManager.stopSession(sessionId)
 */

const BROADCAST_INTERVAL_MS = 4000; // push status every 4 seconds
const MAX_SESSION_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours — auto-cleanup abandoned sessions
const SWEEP_INTERVAL_MS = 60_000; // check for stale sessions every 60s

/**
 * Per-session state shape:
 * {
 *   broadcastFn:    Function,
 *   anchorStreamId: string | null,
 *   startTimes:     Map<streamId, number>,   // Unix timestamps (seconds)
 *   streamIds:      Set<string>,             // all registered stream IDs
 *   streamUrls:     Map<streamId, string>,   // youtube URLs
 *   everHadStreams:  boolean,
 *   intervalId:     NodeJS.Timeout | null,
 *   createdAt:      number,                  // Date.now() when session was started
 * }
 */
const sessions = new Map();

// ─── Session TTL sweep ────────────────────────────────────────────────────────

const _sweepIntervalId = setInterval(() => {
  const now = Date.now();
  for (const [sessionId, state] of sessions.entries()) {
    if (now - state.createdAt > MAX_SESSION_AGE_MS) {
      console.warn(`[SyncManager] Session ${sessionId} expired after ${MAX_SESSION_AGE_MS / 3600000}h — cleaning up`);
      stopSession(sessionId);
    }
  }
}, SWEEP_INTERVAL_MS);
_sweepIntervalId.unref(); // don't block process exit

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Calculate UTC-based offsets for all streams.
 *
 * offset = streamStartTime - anchorStartTime
 *   positive = stream started later than anchor
 *   negative = stream started earlier than anchor
 */
function calculateOffsets(state) {
  const { anchorStreamId, startTimes, streamIds } = state;
  if (!anchorStreamId) return null;

  const anchorStartTime = startTimes.get(anchorStreamId);
  const offsets    = {};
  const confidence = {};
  const startTimesAvailable = {};

  for (const streamId of streamIds) {
    startTimesAvailable[streamId] = startTimes.has(streamId);

    if (streamId === anchorStreamId) {
      offsets[streamId]    = 0;
      confidence[streamId] = 1;
      continue;
    }

    const streamStartTime = startTimes.get(streamId);

    if (anchorStartTime != null && streamStartTime != null) {
      offsets[streamId]    = Math.round((streamStartTime - anchorStartTime) * 100) / 100;
      confidence[streamId] = 1.0;
    } else {
      offsets[streamId]    = null;
      confidence[streamId] = 0;
    }
  }

  return { offsets, confidence, startTimesAvailable };
}

function runBroadcastCycle(sessionId) {
  const state = sessions.get(sessionId);
  if (!state || !state.anchorStreamId) return;

  const result = calculateOffsets(state);
  if (!result) return;

  state.broadcastFn({
    type: 'SYNC_OFFSETS',
    sessionId,
    anchorStreamId: state.anchorStreamId,
    offsets: result.offsets,
    confidence: result.confidence,
    startTimesAvailable: result.startTimesAvailable,
    timestamp: Date.now(),
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function startSession(sessionId, broadcastFn) {
  if (sessions.has(sessionId)) {
    console.log(`[SyncManager] Session ${sessionId} already started`);
    return;
  }

  sessions.set(sessionId, {
    broadcastFn,
    anchorStreamId: null,
    startTimes:    new Map(),
    streamIds:     new Set(),
    streamUrls:    new Map(),
    everHadStreams: false,
    createdAt:     Date.now(),
    intervalId:    setInterval(() => runBroadcastCycle(sessionId), BROADCAST_INTERVAL_MS),
  });

  console.log(`[SyncManager] Session ${sessionId} started`);
}

export function addStream(sessionId, streamId, youtubeUrl, isAnchor) {
  const state = sessions.get(sessionId);
  if (!state) {
    console.warn(`[SyncManager] addStream — unknown session ${sessionId}`);
    return;
  }

  if (isAnchor) state.anchorStreamId = streamId;

  state.streamUrls.set(streamId, youtubeUrl);
  state.streamIds.add(streamId);
  state.everHadStreams = true;

  console.log(`[SyncManager] Added stream ${streamId.slice(0, 8)} (anchor=${isAnchor})`);
}

/**
 * Lightweight stream registration — ensures the stream is tracked.
 * Used when a WS client connects and tells us about existing streams.
 */
export function registerStream(sessionId, streamId, isAnchor = false) {
  const state = sessions.get(sessionId);
  if (!state) return;

  state.streamIds.add(streamId);
  state.everHadStreams = true;
  if (isAnchor && !state.anchorStreamId) {
    state.anchorStreamId = streamId;
  }
}

/**
 * Called when a client reports a start time for their stream.
 * This is the primary sync mechanism — gives us exact UTC-based offsets.
 */
export function reportStartTime(sessionId, streamId, startTimeUnix) {
  const state = sessions.get(sessionId);
  if (!state) return;
  if (typeof startTimeUnix !== 'number' || startTimeUnix <= 0) return;

  // Ensure this stream is registered
  if (!state.streamIds.has(streamId)) {
    state.streamIds.add(streamId);
    state.everHadStreams = true;
    console.log(`[SyncManager] Auto-registered stream ${streamId.slice(0, 8)} via start-time report`);
  }

  state.startTimes.set(streamId, startTimeUnix);
  console.log(
    `[SyncManager] Start time for ${streamId.slice(0, 8)}: ${new Date(startTimeUnix * 1000).toISOString()}`
  );

  // Immediately broadcast so client gets offsets without waiting 4s
  runBroadcastCycle(sessionId);
}

export function promoteAnchor(sessionId, newAnchorStreamId) {
  const state = sessions.get(sessionId);
  if (!state) return;

  const old = state.anchorStreamId;
  state.anchorStreamId = newAnchorStreamId;

  console.log(`[SyncManager] Anchor promoted ${old?.slice(0, 8)} → ${newAnchorStreamId.slice(0, 8)}`);
  runBroadcastCycle(sessionId);
}

export function removeStream(sessionId, streamId) {
  const state = sessions.get(sessionId);
  if (!state) return;

  state.startTimes.delete(streamId);
  state.streamUrls.delete(streamId);
  state.streamIds.delete(streamId);

  if (state.anchorStreamId === streamId) {
    state.anchorStreamId = null;
    state.broadcastFn({ type: 'ANCHOR_REMOVED', sessionId, streamId });
    console.warn(`[SyncManager] Anchor removed — session ${sessionId} needs new anchor`);
  }

  console.log(`[SyncManager] Removed stream ${streamId.slice(0, 8)}`);
}

export function stopSession(sessionId) {
  const state = sessions.get(sessionId);
  if (!state) return;

  clearInterval(state.intervalId);
  sessions.delete(sessionId);

  console.log(`[SyncManager] Session ${sessionId} stopped`);
}

/**
 * Stop all active sessions — used during graceful shutdown.
 */
export function stopAllSessions() {
  const ids = [...sessions.keys()];
  for (const sessionId of ids) {
    stopSession(sessionId);
  }
  console.log(`[SyncManager] Stopped all ${ids.length} sessions`);
}
