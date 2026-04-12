import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import StreamPlayer from '../components/StreamPlayer';
import StatusIndicators from '../components/StatusIndicators';
import ErrorState from '../components/ErrorState';
import ConfirmModal from '../components/ConfirmModal';
import SessionRoomHeader from '../components/SessionRoomHeader';
import { OFFSET_STEPS } from '../../../shared/constants.js';

export default function Viewer() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, getAccessToken } = useAuth();

  // ?pov=<userId> — when arriving from a profile link, load that user's stream first
  const povUserId = new URLSearchParams(location.search).get('pov');

  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [mainStreamId, setMainStreamId] = useState(null);
  const [viewMode, setViewMode] = useState('stage');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [addPovOpen, setAddPovOpen] = useState(false);
  const [addPovUrl, setAddPovUrl] = useState('');
  const [addPovDisplayName, setAddPovDisplayName] = useState('');
  const [addPovSubmitting, setAddPovSubmitting] = useState(false);
  const [addPovError, setAddPovError] = useState(null);

  // Modal state: { title, message, confirmLabel, onConfirm, variant, destructive }
  const [modal, setModal] = useState(null);
  const [offsets, setOffsets] = useState({});

  // Sync status from server: { [streamId]: { confidence, startTimeAvailable } }
  const [syncStats, setSyncStats] = useState(null);

  // Control delegation: which userId currently holds controls (null = host only)
  const [controlHolderUserId, setControlHolderUserId] = useState(null);
  // controlHostUserId from server (so any client knows who the host is)
  const [controlHostUserId, setControlHostUserId] = useState(null);

  // Anchor-dead banner: set when server broadcasts ANCHOR_REMOVED
  const [anchorDeadBanner, setAnchorDeadBanner] = useState(false);

  // Player refs keyed by streamId (stage) and "film-<streamId>" (filmstrip)
  const playerRefs = useRef({});
  // Track which players have called onReady (for VOD autoplay from start)
  const readyCountRef = useRef(0);
  // Track global play/pause state to sync all players
  const isPlayingRef = useRef(true);
  // Prevent sync feedback loops
  const syncingRef = useRef(false);
  // Timestamp of the last programmatic seekTo — used to suppress the BUFFERING→seek
  // feedback loop.  Any state-change or drift-correction within SEEK_COOLDOWN_MS of a
  // programmatic seek is ignored.
  const lastSeekTs = useRef(0);
  const SEEK_COOLDOWN_MS = 4000; // 4 seconds
  // Debounce timers for saving offsets to Supabase
  const saveTimers = useRef({});
  // WebSocket instance ref — allows handlePlayerReady to send start-time messages
  const wsRef = useRef(null);

  // Fetch session and streams on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) throw sessionError;
        setSession(sessionData);

        const { data: streamsData, error: streamsError } = await supabase
          .from('streams')
          .select('*')
          .eq('session_id', sessionId)
          .order('joined_at', { ascending: true });

        if (streamsError) throw streamsError;
        setStreams(streamsData || []);

        // Initialise offsets from DB values
        const offsetMap = {};
        (streamsData || []).forEach((s) => { offsetMap[s.id] = s.offset_seconds ?? 0; });
        setOffsets(offsetMap);

        // Pick initial main stage:
        //   1. ?pov=userId  — the POV of the user whose profile link was clicked
        //   2. anchor stream
        //   3. first stream
        const povStream = povUserId && streamsData?.find((s) => s.user_id === povUserId);
        const anchor    = streamsData?.find((s) => s.is_anchor);
        setMainStreamId(povStream?.id || anchor?.id || streamsData?.[0]?.id || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionId]);

  // Subscribe to realtime changes on streams AND session
  useEffect(() => {
    const channel = supabase
      .channel(`viewer-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streams',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setStreams((prev) => {
              if (prev.some((s) => s.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
            // Add the new stream's offset to local state
            setOffsets((prev) => ({
              ...prev,
              [payload.new.id]: payload.new.offset_seconds ?? 0,
            }));
          } else if (payload.eventType === 'UPDATE') {
            setStreams((prev) =>
              prev.map((s) => (s.id === payload.new.id ? payload.new : s))
            );
          } else if (payload.eventType === 'DELETE') {
            setStreams((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'sessions',
          filter: `id=eq.${sessionId}`,
        },
        (payload) => {
          setSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  // Auto-select first stream when main stage is empty and streams arrive
  useEffect(() => {
    const currentStreams = session?.status === 'ended'
      ? streams
      : streams.filter((stream) => stream.is_active !== false);
    if (!mainStreamId && currentStreams.length > 0) {
      const anchor = currentStreams.find((s) => s.is_anchor);
      setMainStreamId(anchor?.id || currentStreams[0]?.id);
    }
  }, [streams, session?.status, mainStreamId]);

  // When streams change (loaded from DB, or new participant joins), ensure the
  // sync server knows about them.  This covers the case where streams load from
  // Supabase AFTER the WS has already connected.
  const registeredStreamsRef = useRef(new Set());
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const currentStreams = session?.status === 'ended'
      ? streams
      : streams.filter((stream) => stream.is_active !== false);
    if (currentStreams.length === 0) return;

    // Only send for streams we haven't registered yet
    const unregistered = currentStreams.filter((s) => !registeredStreamsRef.current.has(s.id));
    if (unregistered.length === 0) return;

    ws.send(JSON.stringify({
      type: 'REGISTER_STREAMS',
      streams: unregistered.map((s) => ({
        id: s.id,
        isAnchor: s.is_anchor,
      })),
    }));
    unregistered.forEach((s) => registeredStreamsRef.current.add(s.id));
    console.log(`[WS] Registered ${unregistered.length} new streams with sync server`);
  }, [streams, session?.status]);

  // ── WebSocket — Sync Status Consumer ────────────────────────────────────────
  // Connect to the server's WS and listen for SYNC_OFFSETS, control state, etc.
  useEffect(() => {
    if (!sessionId) return;

    let active = true;
    let ws = null;

    const connect = async () => {
      const token = await getAccessToken();
      if (!active || !token) return;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:3002`;
      ws = new WebSocket(`${wsHost}/ws?sessionId=${sessionId}&role=participant&token=${encodeURIComponent(token)}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected to sync server');

        const currentStreams = streamsRef.current;
        if (currentStreams.length > 0) {
          ws.send(JSON.stringify({
            type: 'REGISTER_STREAMS',
            streams: currentStreams.map((s) => ({
              id: s.id,
              isAnchor: s.is_anchor,
            })),
          }));
          currentStreams.forEach((s) => registeredStreamsRef.current.add(s.id));
          console.log(`[WS] Registered ${currentStreams.length} streams with sync server`);
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'SYNC_OFFSETS') {
            const { offsets: serverOffsets, confidence, startTimesAvailable, timestamp } = msg;

            setSyncStats({
              offsets: serverOffsets || {},
              confidence: confidence || {},
              startTimesAvailable: startTimesAvailable || {},
              anchorStreamId: msg.anchorStreamId,
              timestamp,
            });

            Object.entries(serverOffsets || {}).forEach(([streamId, serverOffset]) => {
              if (serverOffset === null || serverOffset === undefined) return;
              const stream = streamsRef.current.find((s) => s.id === streamId);
              if (!stream) return;
              const currentOffset = typeof stream.offset_seconds === 'number' ? stream.offset_seconds : null;
              const shouldUpdate = currentOffset === null || currentOffset === undefined || Math.abs(currentOffset - serverOffset) > 0.05;
              if (shouldUpdate) {
                setOffsets((prev) => ({ ...prev, [streamId]: serverOffset }));
              }
            });
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        console.error('[WS] Error:', err);
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        console.log('[WS] Disconnected from sync server');
      };
    };

    connect();

    return () => {
      active = false;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [sessionId, getAccessToken]);

  // ── Synthetic start-time computation ──────────────────────────────────────
  // For live streams, getCurrentTime() returns seconds since the stream went
  // live.  We compute a synthetic Unix start time = Date.now()/1000 - playerTime
  // and send it to the server so L1 timestamp sync kicks in immediately.
  // This runs every 5s and only sends once per stream.
  const sentStartTimes = useRef(new Set());
  useEffect(() => {
    const timerId = setInterval(() => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      const currentStreams = streamsRef.current;
      if (!currentStreams.length) return;

      const now = Date.now();
      for (const stream of currentStreams) {
        if (sentStartTimes.current.has(stream.id)) continue;

        // Skip Twitch streams — Twitch embeds don't expose reliable UTC-based time
        if (stream.platform === 'twitch') continue;

        const player = playerRefs.current[stream.id];
        if (!player || typeof player.getCurrentTime !== 'function') continue;

        try {
          const pt = player.getCurrentTime();
          if (typeof pt === 'number' && pt > 10) { // Wait until at least 10s of playback to get a stable reading
            const syntheticStart = Math.round((now / 1000) - pt);
            if (syntheticStart > 1000000000) { // sanity: after year 2001
              ws.send(JSON.stringify({ type: 'STREAM_START_TIME', streamId: stream.id, startTime: syntheticStart }));
              sentStartTimes.current.add(stream.id);
              console.log(`[Sync] Sent synthetic start time for ${stream.display_name || stream.id.slice(0, 8)}: ${syntheticStart} (playerTime=${pt.toFixed(1)}s)`);
            }
          }
        } catch (_) {}
      }
    }, 5000);

    return () => clearInterval(timerId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Position drift-correction interval ────────────────────────────────────
  // Every 8s: for each non-anchor stream, check whether its stage player is
  // within DRIFT_SEEK_THRESHOLD of where it should be relative to the anchor.
  // The threshold is generous (3s) to avoid the seek→buffer→seek feedback loop
  // that YouTube live streams are prone to. Only filmstrip mirrors use a tighter
  // threshold (1.5s) since they are muted and don't cause visible buffering.
  useEffect(() => {
    const DRIFT_SEEK_THRESHOLD = 3;       // seconds — for stage players
    const FILM_DRIFT_THRESHOLD = 1.5;     // seconds — for filmstrip mirrors (muted, no rebuffer)

    const id = setInterval(() => {
      if (syncingRef.current) return;
      // Skip if we programmatically seeked recently — give YouTube time to settle
      if (Date.now() - lastSeekTs.current < SEEK_COOLDOWN_MS) return;

      const streams = streamsRef.current;
      const anchor = streams.find((s) => s.is_anchor);
      if (!anchor) return;
      const anchorPlayer = playerRefs.current[anchor.id];
      if (!anchorPlayer || typeof anchorPlayer.getCurrentTime !== 'function') return;

      let anchorTime;
      try { anchorTime = anchorPlayer.getCurrentTime(); } catch (_) { return; }
      if (typeof anchorTime !== 'number' || anchorTime <= 0) return;

      let didSeek = false;

      // Sync anchor's own filmstrip mirror (muted → tight threshold is fine)
      try {
        const film = playerRefs.current[`film-${anchor.id}`];
        if (film) {
          const ft = film.getCurrentTime?.() ?? 0;
          if (Math.abs(ft - anchorTime) > FILM_DRIFT_THRESHOLD) {
            film.seekTo(anchorTime, true);
            didSeek = true;
          }
        }
      } catch (_) {}

      // Sync every non-anchor stream
      streams.forEach((stream) => {
        if (stream.id === anchor.id) return;
        const offset = offsetsRef.current[stream.id] ?? 0;
        const expected = Math.max(0, anchorTime - offset);

        try {
          const stage = playerRefs.current[stream.id];
          if (stage) {
            const st = stage.getCurrentTime?.() ?? 0;
            if (Math.abs(st - expected) > DRIFT_SEEK_THRESHOLD) {
              stage.seekTo(expected, true);
              didSeek = true;
            }
          }
        } catch (_) {}

        try {
          const film = playerRefs.current[`film-${stream.id}`];
          if (film) {
            const ft = film.getCurrentTime?.() ?? 0;
            if (Math.abs(ft - expected) > FILM_DRIFT_THRESHOLD) {
              film.seekTo(expected, true);
              didSeek = true;
            }
          }
        } catch (_) {}
      });

      if (didSeek) lastSeekTs.current = Date.now();
    }, 8000);

    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isHost = user?.id === session?.host_id;
  const isVod  = session?.status === 'ended';
  const visibleStreams = useMemo(() => (
    isVod ? streams : streams.filter((stream) => stream.is_active !== false)
  ), [isVod, streams]);
  // true for the host AND for whoever the host has delegated controls to
  const hasControl = isHost || (!!controlHolderUserId && user?.id === controlHolderUserId);
  const canAddPov = isHost && !isVod && visibleStreams.length < 5;
  const hostStream = visibleStreams.find((s) => s.user_id === session?.host_id);
  const hostName = hostStream?.display_name ?? hostStream?.users?.display_name ?? 'Host';

  // Derive a display-ready syncStats object.
  // Once the WebSocket sends a SYNC_OFFSETS message syncStats is populated with real data.
  // Before that, we build a stub from local stream data so the panels always render.
  const anchorStream = visibleStreams.find((s) => s.is_anchor);
  const effectiveSyncStats = syncStats ?? (visibleStreams.length > 0 ? {
    offsets:             Object.fromEntries(visibleStreams.map((s) => [s.id, s.offset_seconds ?? 0])),
    confidence:          Object.fromEntries(visibleStreams.map((s) => [s.id, 0])),
    startTimesAvailable: Object.fromEntries(visibleStreams.map((s) => [s.id, false])),
    anchorStreamId:      anchorStream?.id ?? null,
    timestamp:           null,
  } : null);

  // Keep a ref to the current streams array so callbacks can read it without
  // being recreated every time streams changes.
  const streamsRef = useRef(streams);
  useEffect(() => { streamsRef.current = visibleStreams; }, [visibleStreams]);

  const renderAddPovTile = useCallback((wrapperClassName, buttonClassName, labelSizeClassName = 'text-xs') => (
    <div className={wrapperClassName}>
      <button
        type="button"
        onClick={openAddPovModal}
        className={buttonClassName}
      >
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pov-surface/95 via-pov-card/90 to-pov-surface/95">
          <div className="flex flex-col items-center gap-2 px-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-pov-accent/50 bg-pov-accent/10 text-xl font-semibold text-pov-accent">
              +
            </div>
            <div>
              <p className={`font-semibold text-pov-text ${labelSizeClassName}`}>Add POV</p>
              <p className="text-[10px] text-pov-muted">Drop in another stream</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  ), [openAddPovModal]);

  // Keep a ref to offsets so offset callbacks stay stable
  const offsetsRef = useRef(offsets);
  useEffect(() => { offsetsRef.current = offsets; }, [offsets]);

  // Store player ref when a YT player is ready.
  // Stage players use plain streamId; filmstrip players use "film-<streamId>".
  // For VODs, once all stage players are ready we seek each to its saved offset
  // position so all streams start at the same real-world moment.

  const handlePlayerReady = useCallback((streamId, player) => {
    playerRefs.current[streamId] = player;

    // Only act on stage players (not filmstrip mirrors)
    const streams = streamsRef.current;
    if (!streams.length) return;
    const isFilm = typeof streamId === 'string' && streamId.startsWith('film-');
    if (isFilm) return;

    const sessionStatus = sessionRef.current?.status;

    // ── Report synthetic start time to sync server ─────────────────────────
    // For live YouTube streams, getCurrentTime() returns elapsed seconds since
    // the stream went live.  We compute: startTime ≈ Date.now()/1000 - playerTime.
    // Also persist to DB so VOD recalculation survives server restarts.
    // Skip Twitch streams — they don't expose reliable UTC-based timing.
    const stream = streams.find((s) => s.id === streamId);
    const isTwitch = stream?.platform === 'twitch' || player._isTwitch;

    if (sessionStatus !== 'ended' && !isTwitch) {
      try {
        const pt = player.getCurrentTime?.() ?? 0;
        if (pt > 0) {
          const wallMs = Date.now();
          const syntheticStart = Math.round((wallMs / 1000) - pt);

          if (syntheticStart > 1000000000) { // sanity: after year 2001
            // 1. Tell sync server via WS
            const ws = wsRef.current;
            if (ws?.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'STREAM_START_TIME', streamId, startTime: syntheticStart }));
            }
            // 2. Persist to DB
            getAccessToken().then((token) => {
              fetch(`/api/sessions/${sessionId}/streams/${streamId}/start-time`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: JSON.stringify({ startTime: syntheticStart }),
              }).catch(() => {});
            }).catch(() => {});
            console.log(`[Sync] Sent start time for ${streamId.slice(0, 8)}: ${syntheticStart} (playerTime=${pt.toFixed(1)}s)`);
          }
        }
      } catch (_) {}
    }

    // ── VOD mode: seek all streams to aligned start positions ───────────────
    if (sessionStatus !== 'ended') return;

    readyCountRef.current += 1;
    const stagePlayers = streams.length;
    if (readyCountRef.current < stagePlayers) return;

    const anchor = streams.find((s) => s.is_anchor);
    if (!anchor) return;
    streams.forEach((stream) => {
      const offset = offsetsRef.current[stream.id] ?? 0;
      const target = Math.max(0, -offset);
      try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
      try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
    });
  }, []);

  // Keep a stable ref to the session object for use inside callbacks
  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Called whenever ANY stage player fires a play/pause/buffering state change.
  // Anchor plays/pauses  → sync play/pause state on ALL other players.
  // Anchor BUFFERING     → user scrubbed the anchor; re-seek every other player.
  // Non-anchor BUFFERING → IGNORED (almost always caused by our own programmatic seeks).
  // Non-anchor play/pause → sync only its own filmstrip mirror play/pause state.
  //
  // IMPORTANT: We do NOT re-seek non-anchor streams on their own state changes.
  // That was causing a seek→buffer→seek→buffer infinite loop. Position correction
  // is handled solely by the 8-second drift-correction interval.
  const handleStageStateChange = useCallback((streamId, state) => {
    if (syncingRef.current) return;
    const YT = window.YT;
    if (!YT) return;

    const isAnchor = streamsRef.current.find((s) => s.id === streamId)?.is_anchor ?? false;

    // ── Anchor seeked (BUFFERING fires right after a scrubber drag) ─────────
    if (isAnchor && state === YT.PlayerState.BUFFERING) {
      // Only react if this wasn't caused by our own recent programmatic seek
      if (Date.now() - lastSeekTs.current < SEEK_COOLDOWN_MS) return;

      // Small delay so the anchor's getCurrentTime() has updated to the new position
      setTimeout(() => {
        const anchorPlayer = playerRefs.current[streamId];
        if (!anchorPlayer) return;
        const anchorTime = anchorPlayer.getCurrentTime?.() ?? 0;
        syncingRef.current = true;
        lastSeekTs.current = Date.now();
        streamsRef.current.forEach((stream) => {
          if (stream.id === streamId) return; // skip anchor itself
          const offset = offsetsRef.current[stream.id] ?? 0;
          const target = Math.max(0, anchorTime - offset);
          try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
          try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
        });
        // Also keep anchor filmstrip mirror in sync
        try { playerRefs.current[`film-${streamId}`]?.seekTo(anchorTime, true); } catch (_) {}
        syncingRef.current = false;
      }, 200);
      return;
    }

    // Ignore BUFFERING for non-anchor streams entirely — these are almost always
    // caused by our own seeks and reacting to them creates the infinite loop.
    if (!isAnchor && state === YT.PlayerState.BUFFERING) return;

    if (state !== YT.PlayerState.PAUSED && state !== YT.PlayerState.PLAYING) return;

    const playing = state === YT.PlayerState.PLAYING;
    syncingRef.current = true;

    if (isAnchor) {
      isPlayingRef.current = playing;
      Object.entries(playerRefs.current).forEach(([id, player]) => {
        if (id === streamId) return;
        try { playing ? player.playVideo() : player.pauseVideo(); } catch (_) {}
      });
    } else {
      // Non-anchor stage player: sync its own filmstrip mirror play/pause only.
      // Do NOT seek here — position correction is handled by the drift interval.
      const filmPlayer = playerRefs.current[`film-${streamId}`];
      if (filmPlayer) {
        try { playing ? filmPlayer.playVideo() : filmPlayer.pauseVideo(); } catch (_) {}
      }
    }

    syncingRef.current = false;
  }, []);

  const handleSwapStream = useCallback((newStreamId) => {
    if (newStreamId === mainStreamId) return;
    setMainStreamId(newStreamId);
  }, [mainStreamId]);

  const toggleViewMode = useCallback(() => {
    setViewMode((mode) => (mode === 'wall' ? 'stage' : 'wall'));
  }, []);

  const openAddPovModal = useCallback(() => {
    if (!isHost || isVod) return;
    setAddPovUrl('');
    setAddPovDisplayName('');
    setAddPovError(null);
    setAddPovOpen(true);
  }, [isHost, isVod]);

  const closeAddPovModal = useCallback(() => {
    if (addPovSubmitting) return;
    setAddPovOpen(false);
    setAddPovError(null);
  }, [addPovSubmitting]);

  const handleAddPov = useCallback(async (event) => {
    event.preventDefault();

    const streamUrl = addPovUrl.trim();
    const displayName = addPovDisplayName.trim();

    if (!streamUrl) {
      setAddPovError('Enter a YouTube or Twitch URL.');
      return;
    }

    try {
      setAddPovSubmitting(true);
      setAddPovError(null);

      const token = await getAccessToken();
      const response = await fetch(`/api/sessions/${sessionId}/streams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          streamUrl,
          displayName,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to add POV');
      }

      setAddPovOpen(false);
      setAddPovUrl('');
      setAddPovDisplayName('');
    } catch (err) {
      setAddPovError(err.message || 'Failed to add POV');
    } finally {
      setAddPovSubmitting(false);
    }
  }, [addPovDisplayName, addPovUrl, getAccessToken, sessionId]);

  // ── OFFSET CONTROLS ────────────────────────────────────────────────────────

  // Save a stream's offset to Supabase (debounced 800ms to avoid DB spam)
  const saveOffset = useCallback((streamId, newOffset) => {
    clearTimeout(saveTimers.current[streamId]);
    saveTimers.current[streamId] = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        await fetch(`/api/sessions/${sessionId}/streams/${streamId}/offset`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ offsetSeconds: newOffset }),
        });
      } catch (err) {
        console.error('[Offset] Save failed:', err);
      }
    }, 800);
  }, [sessionId, getAccessToken]);

  // Step a stream's offset by delta seconds, then re-seek that player to stay in sync
  const stepOffset = useCallback((streamId, deltaSeconds) => {
    setOffsets((prev) => {
      const current = prev[streamId] ?? 0;
      const next = Math.round((current + deltaSeconds) * 1000) / 1000; // avoid float drift

      // Re-seek this stream's stage player to account for new offset
      const anchorPlayer = playerRefs.current[
        streamsRef.current.find((s) => s.is_anchor)?.id
      ];
      const stagePlayer = playerRefs.current[streamId];
      const filmPlayer = playerRefs.current[`film-${streamId}`];

      if (stagePlayer && anchorPlayer) {
        try {
          // Get anchor's current time as reference, apply the new offset to this stream
          const anchorTime = anchorPlayer.getCurrentTime?.() ?? 0;
          const targetTime = Math.max(0, anchorTime - next);
          lastSeekTs.current = Date.now();
          stagePlayer.seekTo(targetTime, true);
          filmPlayer?.seekTo(targetTime, true);
        } catch (_) {}
      }

      saveOffset(streamId, next);
      return { ...prev, [streamId]: next };
    });
  }, [saveOffset]);

  // ── MASTER CONTROLS ────────────────────────────────────────────────────────

  const handlePlayAll = useCallback(() => {
    isPlayingRef.current = true;
    syncingRef.current = true;
    Object.values(playerRefs.current).forEach((p) => {
      try { p.playVideo(); } catch (_) {}
    });
    syncingRef.current = false;
  }, []);

  const handlePauseAll = useCallback(() => {
    isPlayingRef.current = false;
    syncingRef.current = true;
    Object.values(playerRefs.current).forEach((p) => {
      try { p.pauseVideo(); } catch (_) {}
    });
    syncingRef.current = false;
  }, []);

  // Go Live — snap every stream to its live edge, accounting for its offset.
  // Uses getDuration() which returns the live DVR window length for live streams;
  // seeking to that value moves to the live edge without overshooting.
  const handleGoLive = useCallback(() => {
    syncingRef.current = true;
    lastSeekTs.current = Date.now();
    streamsRef.current.forEach((stream) => {
      const stagePlayer = playerRefs.current[stream.id];
      const filmPlayer  = playerRefs.current[`film-${stream.id}`];
      const offset = offsetsRef.current[stream.id] ?? 0;
      try {
        // getDuration() returns the DVR buffer length for live streams (e.g. 10800s for a 3h window)
        const duration = stagePlayer?.getDuration?.() ?? 0;
        // Use duration as the live edge; if not available fall back to a large number
        const liveEdge = duration > 0 ? duration : 9999999;
        const target   = Math.max(0, liveEdge - offset);
        stagePlayer?.seekTo(target, true);
        filmPlayer?.seekTo(target, true);
      } catch (_) {}
    });
    syncingRef.current = false;
  }, []);

  // Re-sync — snap all streams to their correct positions relative to anchor
  const handleResync = useCallback(() => {
    handleGoLive();
  }, [handleGoLive]);

  // Delegate controls to another participant
  const handleDelegateControl = useCallback(async (delegateeUserId, displayName) => {
    const doDelegate = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/delegate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ delegateeUserId }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delegate control');
        }
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      }
    };
    setModal({
      title: 'Delegate Controls',
      message: `Give full controls to ${displayName}?`,
      confirmLabel: 'Delegate',
      onConfirm: doDelegate,
    });
  }, [sessionId, getAccessToken]);

  // Revoke delegated controls — host takes them back
  const handleRevokeControl = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/sessions/${sessionId}/revoke-control`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to revoke control');
      }
    } catch (err) {
      setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
    }
  }, [sessionId, getAccessToken]);

  // Promote a stream to anchor
  const handlePromoteAnchor = useCallback(async (streamId) => {
    const doPromote = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/promote-anchor`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
          body: JSON.stringify({ streamId }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to promote anchor');
        }
        // The Supabase realtime subscription will push the stream UPDATE events
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      }
    };
    setModal({
      title: 'Promote Anchor',
      message: 'Promote this stream to anchor? All offsets will recalculate.',
      confirmLabel: 'Promote',
      onConfirm: doPromote,
    });
  }, [sessionId, getAccessToken]);

  // End session handler
  function handleEndSession() {
    const doEnd = async () => {
      setEnding(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to end session');
        }
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      } finally {
        setEnding(false);
      }
    };
    setModal({
      title: 'End Session',
      message: 'End this session? It will be saved as a VOD.',
      confirmLabel: 'End Session',
      destructive: true,
      onConfirm: doEnd,
    });
  }

  // Leave session handler — participants only
  function handleLeaveSession() {
    const doLeave = async () => {
      setLeaving(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/leave`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` }),
          },
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to leave session');
        }
        // Navigate back to home after leaving
        navigate('/');
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      } finally {
        setLeaving(false);
      }
    };
    setModal({
      title: 'Leave Session',
      message: 'Leave this session? Your stream will be archived for the VOD.',
      confirmLabel: 'Leave',
      destructive: true,
      onConfirm: doLeave,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-pov-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        icon="📺"
        title="Session not found"
        message={error}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
      <SessionRoomHeader
        title="Live room"
        session={session}
        hostLabel={hostName}
        roleLabel={isHost ? 'Host control' : hasControl ? 'Delegated control' : 'Participant view'}
        roleTone={isHost ? 'host' : 'participant'}
        statusLabel={isVod ? 'VOD session' : 'Live session'}
        statusTone={isVod ? 'vod' : 'live'}
        secondaryLabel={isHost ? 'You manage sync for everyone' : hasControl ? 'You can adjust sync for the room' : 'Following the host’s sync state'}
        className="mb-3 sm:mb-4"
      />

      {/* Session header bar */}
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            className={`text-[10px] sm:text-xs font-mono px-1.5 sm:px-2 py-1 rounded border flex-shrink-0 ${
              !isVod
                ? 'bg-pov-success/10 border-pov-success/30 text-pov-success'
                : 'bg-pov-muted/10 border-pov-muted/30 text-pov-muted'
            }`}
          >
            {!isVod ? '● LIVE' : '📼 VOD'}
          </span>
          <span className="text-[10px] sm:text-xs text-pov-muted font-mono">
            {visibleStreams.length} stream{visibleStreams.length !== 1 ? 's' : ''}
          </span>
          {isVod && session?.ended_at && (
            <span className="text-[10px] sm:text-xs text-pov-muted/60 font-mono hidden sm:inline">
              {new Date(session.ended_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleViewMode}
          className="text-[10px] sm:text-xs font-mono bg-pov-surface border border-pov-border text-pov-text hover:bg-pov-border/30 rounded px-2 sm:px-3 py-1.5 transition-colors flex-shrink-0"
        >
          {viewMode === 'wall' ? 'Stage view' : 'Wall view'}
        </button>

        {isHost && session?.status === 'live' && (
          <button
            onClick={handleEndSession}
            disabled={ending}
            className="text-[10px] sm:text-xs font-mono bg-pov-danger/10 border border-pov-danger/30 text-pov-danger hover:bg-pov-danger/20 rounded px-2 sm:px-3 py-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {ending ? 'Ending...' : '⏹ End Session'}
          </button>
        )}

        {!isHost && session?.status === 'live' && (
          <button
            onClick={handleLeaveSession}
            disabled={leaving}
            className="text-[10px] sm:text-xs font-mono bg-pov-danger/10 border border-pov-danger/30 text-pov-danger hover:bg-pov-danger/20 rounded px-2 sm:px-3 py-1.5 transition-colors disabled:opacity-50 flex-shrink-0"
          >
            {leaving ? 'Leaving...' : '🚪 Leave'}
          </button>
        )}
      </div>

      {/* Session links — host only, live sessions only */}
      {isHost && session && !isVod && (
        <div className="mb-3 sm:mb-4 bg-pov-surface border border-pov-border rounded-lg p-3 sm:p-4 space-y-2">
          <h2 className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider mb-2">
            Share with your squad
          </h2>
          <LinkRow
            label="Participant"
            url={`${window.location.origin}/join/${session.participant_link}`}
          />
          <LinkRow
            label="Spectator"
            url={`${window.location.origin}/watch/${session.spectator_link}`}
          />
        </div>
      )}

      {/* Participant context bar — non-host, live sessions only */}
      {!isHost && !isVod && session && (
        <ParticipantBar
          session={session}
          streams={visibleStreams}
          effectiveSyncStats={effectiveSyncStats}
          controlHolderUserId={controlHolderUserId}
          userId={user?.id}
        />
      )}

      {viewMode === 'wall' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3">
          {visibleStreams.map((stream) => {
            const isActive = stream.id === mainStreamId;

            return (
              <div key={`wall-wrap-${stream.id}`} className="flex flex-col gap-1">
                <button
                  onClick={() => handleSwapStream(stream.id)}
                  className={`relative aspect-video bg-black rounded-lg overflow-hidden border-2 transition-all ${
                    isActive ? 'border-pov-accent shadow-lg shadow-pov-accent/20' : 'border-pov-border hover:border-pov-muted'
                  }`}
                >
                  <StreamPlayer
                    streamUrl={stream.youtube_url}
                    platform={stream.platform}
                    isMain={stream.id === mainStreamId}
                    onReady={(player) => {
                      handlePlayerReady(stream.id, player);
                      playerRefs.current[`film-${stream.id}`] = player;
                    }}
                    onStateChange={(state) => handleStageStateChange(stream.id, state)}
                    className="w-full h-full"
                  />
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-2 pointer-events-none">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">{stream.display_name}</span>
                      <StatusIndicators
                        stream={stream}
                        isHost={stream.user_id === session?.host_id}
                        isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId}
                      />
                    </div>
                  </div>
                  {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-pov-accent" />}
                </button>

                {hasControl && !isVod && (
                  <OffsetControls
                    streamId={stream.id}
                    isAnchor={stream.is_anchor}
                    offset={offsets[stream.id] ?? 0}
                    onStep={stepOffset}
                    onPromoteAnchor={handlePromoteAnchor}
                  />
                )}
              </div>
            );
          })}

          {canAddPov && renderAddPovTile(
            'flex flex-col gap-1',
            'relative aspect-video bg-black rounded-lg overflow-hidden border-2 border-dashed border-pov-accent/50 transition-all hover:border-pov-accent'
          )}

          {visibleStreams.length === 0 && !canAddPov && (
            <div className="col-span-full w-full h-40 flex items-center justify-center rounded-lg border border-dashed border-pov-border bg-pov-surface/50">
              <p className="text-pov-muted text-sm">Waiting for streams to join...</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Main Stage — shows the selected stream's player */}
          <div className="aspect-video bg-black border border-pov-border rounded-lg mb-2 sm:mb-3 overflow-hidden relative">
            {visibleStreams.length > 0 ? (
              visibleStreams.map((stream) => (
                <div
                  key={`stage-${stream.id}`}
                  className={`absolute inset-0 transition-opacity duration-200 ${
                    stream.id === mainStreamId ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                  }`}
                >
                  <StreamPlayer
                    streamUrl={stream.youtube_url}
                    platform={stream.platform}
                    isMain={stream.id === mainStreamId}
                    onReady={(player) => handlePlayerReady(stream.id, player)}
                    onStateChange={(state) => handleStageStateChange(stream.id, state)}
                    className="w-full h-full"
                  />
                  {/* Main stage name overlay */}
                  {stream.id === mainStreamId && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{stream.display_name}</span>
                        <StatusIndicators
                          stream={stream}
                          isHost={stream.user_id === session?.host_id}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-center">
                  <p className="text-pov-muted text-sm">Waiting for streams to join...</p>
                  <div className="mt-3 flex gap-2 justify-center">
                    {[...Array(5)].map((_, i) => (
                      <div
                        key={i}
                        className="w-3 h-3 bg-pov-border rounded-full animate-pulse"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Filmstrip — thumbnails that mirror each player's live frame */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:overflow-x-auto mb-2 pb-1">
            {visibleStreams.map((stream) => {
              const isActive = stream.id === mainStreamId;

              return (
                <div key={`film-wrap-${stream.id}`} className="w-full sm:flex-shrink-0 sm:w-48 flex flex-col gap-1">
                  <button
                    onClick={() => handleSwapStream(stream.id)}
                    className={`w-full rounded-lg border-2 transition-all overflow-hidden relative group ${
                      isActive
                        ? 'border-pov-accent shadow-lg shadow-pov-accent/20'
                        : 'border-pov-border hover:border-pov-muted'
                    }`}
                  >
                    <div className="aspect-video pointer-events-none">
                      <StreamPlayer
                        streamUrl={stream.youtube_url}
                        platform={stream.platform}
                        isMain={false}
                        onReady={(player) => {
                          playerRefs.current[`film-${stream.id}`] = player;
                        }}
                        className="w-full h-full"
                      />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-2 py-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono text-white truncate">
                          {stream.display_name}
                        </span>
                        <StatusIndicators
                          stream={stream}
                          isHost={stream.user_id === session?.host_id}
                          isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId}
                        />
                      </div>
                    </div>
                    {isActive && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-pov-accent" />
                    )}
                  </button>

                  {hasControl && !isVod && (
                    <OffsetControls
                      streamId={stream.id}
                      isAnchor={stream.is_anchor}
                      offset={offsets[stream.id] ?? 0}
                      onStep={stepOffset}
                      onPromoteAnchor={handlePromoteAnchor}
                    />
                  )}
                </div>
              );
            })}

            {canAddPov && renderAddPovTile(
              'w-full sm:flex-shrink-0 sm:w-48 flex flex-col gap-1',
              'relative w-full aspect-video rounded-lg border-2 border-dashed border-pov-accent/50 overflow-hidden transition-all hover:border-pov-accent'
            )}

            {visibleStreams.length === 0 && !canAddPov && (
              [...Array(4)].map((_, i) => (
                <div
                  key={i}
                  className="w-full sm:flex-shrink-0 sm:w-48 aspect-video rounded-lg border border-dashed border-pov-border bg-pov-surface/50 animate-pulse flex items-center justify-center"
                >
                  <span className="text-[10px] text-pov-muted/40 font-mono">POV {i + 1}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {/* Sync Status Panel — host/delegate, live sessions */}
      {hasControl && !isVod && effectiveSyncStats && (
        <SyncStatusPanel
          streams={visibleStreams}
          syncStats={effectiveSyncStats}
          session={session}
        />
      )}

      {/* VOD notice bar */}
      {isVod && (
        <div className="bg-pov-surface border border-pov-border rounded-lg px-4 py-3 mt-3 flex items-center gap-3">
          <span className="text-pov-muted text-xs font-mono">📼 VOD</span>
          <span className="text-xs text-pov-muted/70">
            Saved offsets applied automatically. Switch POVs freely.
          </span>
        </div>
      )}

      {/* Anchor-dead banner — shown when anchor stream goes away */}
      {anchorDeadBanner && !isVod && (
        <AnchorDeadBanner
          streams={visibleStreams}
          onPromote={(streamId) => {
            handlePromoteAnchor(streamId);
            setAnchorDeadBanner(false);
          }}
          onDismiss={() => setAnchorDeadBanner(false)}
        />
      )}

      {/* Master controls — host or delegate, live only */}
      {hasControl && !isVod && (
        <div className="bg-pov-surface border border-pov-border rounded-lg p-3 sm:p-4 mt-2 sm:mt-3">
          <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
            <p className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
              Master Controls
            </p>
            {/* Delegated-control indicator for the delegate */}
            {!isHost && hasControl && (
              <span className="text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded border border-pov-accent/40 text-pov-accent bg-pov-accent/10">
                🎮 Delegated to you
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
            <ControlButton label="▶ Play All" onClick={handlePlayAll} />
            <ControlButton label="⏸ Pause All" onClick={handlePauseAll} />
            <ControlButton label="📡 Go Live" onClick={handleGoLive} />
            <ControlButton label="🔁 Re-sync" onClick={handleResync} />
          </div>
        </div>
      )}

      {/* Control Delegation panel — host only, live only */}
      {isHost && !isVod && visibleStreams.length > 1 && (
        <ControlDelegationPanel
          streams={visibleStreams}
          session={session}
          controlHolderUserId={controlHolderUserId}
          onDelegate={handleDelegateControl}
          onRevoke={handleRevokeControl}
        />
      )}

      {/* Confirmation / alert modal */}
      <AddPovModal
        open={addPovOpen}
        url={addPovUrl}
        displayName={addPovDisplayName}
        error={addPovError}
        submitting={addPovSubmitting}
        onUrlChange={setAddPovUrl}
        onDisplayNameChange={setAddPovDisplayName}
        onSubmit={handleAddPov}
        onCancel={closeAddPovModal}
      />

      {/* Confirmation / alert modal */}
      <ConfirmModal
        open={!!modal}
        title={modal?.title}
        message={modal?.message}
        confirmLabel={modal?.confirmLabel}
        variant={modal?.variant ?? 'confirm'}
        destructive={modal?.destructive ?? false}
        onConfirm={() => {
          const cb = modal?.onConfirm;
          setModal(null);
          cb?.();
        }}
        onCancel={() => setModal(null)}
      />
    </div>
  );
}

function AddPovModal({
  open,
  url,
  displayName,
  error,
  submitting,
  onUrlChange,
  onDisplayNameChange,
  onSubmit,
  onCancel,
}) {
  const firstInputRef = useRef(null);

  useEffect(() => {
    if (open) firstInputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event) => {
      if (event.key === 'Escape') onCancel?.();
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-pov-modal-title"
    >
      <form
        className="w-full max-w-md rounded-xl border border-pov-border bg-pov-card p-5 sm:p-6 shadow-2xl space-y-4"
        onSubmit={onSubmit}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 id="add-pov-modal-title" className="text-lg font-bold font-mono text-pov-text">
            Add another POV
          </h2>
          <p className="text-sm text-pov-muted">
            Drop in a YouTube or Twitch link to add it to this session.
          </p>
        </div>

        <label className="block space-y-1.5">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
            Stream URL
          </span>
          <input
            ref={firstInputRef}
            type="url"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-pov-border bg-pov-bg px-3 py-2 text-sm text-pov-text outline-none transition focus:border-pov-accent"
            required
          />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">
            Label
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(event) => onDisplayNameChange(event.target.value)}
            placeholder="POV 2"
            maxLength={40}
            className="w-full rounded-lg border border-pov-border bg-pov-bg px-3 py-2 text-sm text-pov-text outline-none transition focus:border-pov-accent"
          />
        </label>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-pov-muted hover:text-pov-text transition"
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-lg text-sm font-medium bg-pov-accent hover:opacity-90 text-white transition disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? 'Adding...' : 'Add POV'}
          </button>
        </div>
      </form>
    </div>
  );
}

// -- Sub-components --

function LinkRow({ label, url }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <span className="text-[10px] sm:text-xs font-mono text-pov-muted w-16 sm:w-24 flex-shrink-0">{label}</span>
      <code className="text-[10px] sm:text-xs text-pov-text bg-pov-bg border border-pov-border rounded px-2 sm:px-3 py-1.5 flex-1 truncate min-w-0">
        {url}
      </code>
      <button
        onClick={handleCopy}
        className={`text-[10px] sm:text-xs font-mono border rounded px-2 sm:px-3 py-1.5 transition-all flex-shrink-0 ${
          copied
            ? 'border-pov-success/50 text-pov-success bg-pov-success/10'
            : 'border-pov-border text-pov-muted hover:text-pov-text hover:border-pov-muted'
        }`}
      >
        {copied ? '✓' : 'Copy'}
      </button>
    </div>
  );
}

/**
 * Collapsible sync status panel — host only.
 * Shows per-stream: status, offset, start time availability.
 */
function SyncStatusPanel({ streams, syncStats, session }) {
  const [collapsed, setCollapsed] = useState(false);

  const {
    offsets, confidence, startTimesAvailable,
    anchorStreamId, timestamp,
  } = syncStats;

  const secAgo = timestamp ? Math.round((Date.now() - timestamp) / 1000) : null;

  function statusFor(streamId) {
    const isAnchor = streamId === anchorStreamId;
    const hasStartTime = startTimesAvailable?.[streamId];
    if (isAnchor)     return { dot: '⚓', color: 'text-pov-muted',   label: 'Anchor' };
    if (hasStartTime) return { dot: '●', color: 'text-pov-success', label: 'Synced' };
    return                   { dot: '●', color: 'text-pov-muted/40', label: 'Waiting' };
  }

  const fmtOffset = (v) => {
    if (v === null || v === undefined) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}s`;
  };

  const nonAnchor = streams.filter((s) => s.id !== anchorStreamId);
  const syncedCount = nonAnchor.filter((s) => startTimesAvailable?.[s.id]).length;
  const total = nonAnchor.length;

  return (
    <div className="bg-pov-surface border border-pov-border rounded-lg mt-2 sm:mt-3 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-pov-bg/40 transition-colors"
      >
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">Sync</span>
          <span className="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded border text-pov-accent border-pov-accent/30 bg-pov-accent/10">
            UTC
          </span>
          {total > 0 && (
            <span className={`text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded border ${
              syncedCount === total
                ? 'text-pov-success border-pov-success/30 bg-pov-success/10'
                : 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10'
            }`}>
              {syncedCount}/{total}
            </span>
          )}
          {secAgo !== null && (
            <span className="text-[9px] sm:text-[10px] font-mono text-pov-muted/50 hidden sm:inline">
              updated {secAgo}s ago
            </span>
          )}
        </div>
        <span className="text-pov-muted/50 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="border-t border-pov-border px-3 sm:px-4 py-2 sm:py-3 overflow-x-auto">
          <table className="w-full text-[10px] sm:text-[11px] font-mono">
            <thead>
              <tr className="text-pov-muted/60 text-left">
                <th className="pb-1.5 font-normal w-4"></th>
                <th className="pb-1.5 font-normal">Stream</th>
                <th className="pb-1.5 font-normal w-20">Status</th>
                <th className="pb-1.5 font-normal w-16 text-right">Offset</th>
              </tr>
            </thead>
            <tbody>
              {streams.map((stream) => {
                const st = statusFor(stream.id);
                const offset  = offsets[stream.id];
                const isAnchor = stream.id === anchorStreamId;
                return (
                  <tr key={stream.id} className="border-t border-pov-border/40">
                    <td className={`py-1.5 pr-2 ${st.color}`}>{st.dot}</td>
                    <td className="py-1.5 pr-3">
                      <span className="text-pov-text truncate block max-w-[120px]">{stream.display_name}</span>
                    </td>
                    <td className="py-1.5 pr-3">
                      <span className={st.color}>{st.label}</span>
                    </td>
                    <td className={`py-1.5 text-right ${
                      isAnchor ? 'text-pov-muted/40' : offset !== null && offset !== undefined ? 'text-pov-accent' : 'text-pov-muted/40'
                    }`}>
                      {isAnchor ? '0.00s' : fmtOffset(offset)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-2 pt-2 border-t border-pov-border/40">
            <span className="text-[9px] font-mono text-pov-muted/50">
              Offsets computed from UTC start times — no audio processing needed.
              Live streams are synced by YouTube. VOD offsets applied automatically.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function ControlButton({ label, disabled = false, onClick, title }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border rounded px-3 py-2 sm:py-2 text-pov-text hover:border-pov-muted active:bg-pov-accent/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors min-h-[36px]"
    >
      {label}
    </button>
  );
}

/**
 * Per-stream offset step controls shown below each filmstrip thumbnail (host only).
 * Anchor stream shows controls as disabled — it's the reference point.
 */
function OffsetControls({ streamId, isAnchor, offset, onStep, onPromoteAnchor }) {
  const fmt = (s) => {
    const sign = s >= 0 ? '+' : '';
    return `${sign}${s.toFixed(2)}s`;
  };

  return (
    <div className="w-full">
      {/* Offset readout + promote button */}
      <div className="flex items-center justify-between mb-0.5 px-0.5">
        <span className={`text-[10px] font-mono ${isAnchor ? 'text-pov-muted/40' : 'text-pov-accent'}`}>
          {isAnchor ? '⚓ anchor' : fmt(offset)}
        </span>
        <div className="flex items-center gap-1">
          {!isAnchor && (
            <button
              onClick={() => onPromoteAnchor(streamId)}
              title="Promote to anchor"
              className="text-[8px] font-mono text-pov-muted/50 hover:text-pov-muted border border-pov-border/50 rounded px-1 py-0.5 leading-none transition-colors"
            >
              ⚓
            </button>
          )}
        </div>
      </div>
      {/* Step buttons — show fewer on mobile for larger touch targets */}
      <div className="hidden sm:flex gap-0.5">
        {[
          { label: '◀◀', delta: -OFFSET_STEPS.COARSE, title: '−30s' },
          { label: '◀',  delta: -OFFSET_STEPS.MEDIUM,  title: '−5s' },
          { label: '‹',  delta: -OFFSET_STEPS.FINE,    title: '−1s' },
          { label: '⟨',  delta: -OFFSET_STEPS.FRAME,   title: '−1 frame' },
          { label: '⟩',  delta: +OFFSET_STEPS.FRAME,   title: '+1 frame' },
          { label: '›',  delta: +OFFSET_STEPS.FINE,    title: '+1s' },
          { label: '▶',  delta: +OFFSET_STEPS.MEDIUM,  title: '+5s' },
          { label: '▶▶', delta: +OFFSET_STEPS.COARSE,  title: '+30s' },
        ].map(({ label, delta, title }) => (
          <button
            key={label}
            title={title}
            disabled={isAnchor}
            onClick={() => onStep(streamId, delta)}
            className="flex-1 text-[9px] font-mono bg-pov-bg border border-pov-border rounded py-0.5 text-pov-muted hover:text-pov-text hover:border-pov-muted disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
      {/* Mobile: simplified 4-button layout */}
      <div className="flex sm:hidden gap-0.5">
        {[
          { label: '−5s',   delta: -OFFSET_STEPS.MEDIUM,  title: '−5s' },
          { label: '−1s',   delta: -OFFSET_STEPS.FINE,     title: '−1s' },
          { label: '+1s',   delta: +OFFSET_STEPS.FINE,     title: '+1s' },
          { label: '+5s',   delta: +OFFSET_STEPS.MEDIUM,   title: '+5s' },
        ].map(({ label, delta, title }) => (
          <button
            key={label}
            title={title}
            disabled={isAnchor}
            onClick={() => onStep(streamId, delta)}
            className="flex-1 text-[10px] font-mono bg-pov-bg border border-pov-border rounded py-1 text-pov-muted hover:text-pov-text active:bg-pov-accent/10 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Sticky banner shown when the anchor stream disappears.
 * Lists all remaining streams as promote-to-anchor buttons.
 */
function AnchorDeadBanner({ streams, onPromote, onDismiss }) {
  const candidates = streams.filter((s) => !s.is_anchor);

  return (
    <div className="mt-3 bg-pov-danger/10 border border-pov-danger/40 rounded-lg px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-pov-danger mb-1">
            ⚠️ Anchor stream ended
          </p>
          <p className="text-xs text-pov-muted mb-3">
            The reference stream is no longer available. Promote a replacement anchor to keep sync running.
          </p>
          <div className="flex flex-wrap gap-2">
            {candidates.map((stream) => (
              <button
                key={stream.id}
                onClick={() => onPromote(stream.id)}
                className="text-xs font-mono bg-pov-surface border border-pov-border rounded px-3 py-1.5 text-pov-text hover:border-pov-accent hover:text-pov-accent transition-colors"
              >
                ⚓ Promote {stream.display_name}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="text-pov-muted/50 hover:text-pov-muted text-lg leading-none flex-shrink-0 transition-colors"
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Control Delegation panel — host can hand full controls to one participant.
 * Shows each non-host stream with a Give Control / Reclaim button.
 */
function ControlDelegationPanel({ streams, session, controlHolderUserId, onDelegate, onRevoke }) {
  const [collapsed, setCollapsed] = useState(true);

  const participants = streams.filter((s) => s.user_id !== session?.host_id);
  if (participants.length === 0) return null;

  return (
    <div className="bg-pov-surface border border-pov-border rounded-lg mt-2 sm:mt-3 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 sm:px-4 py-2 sm:py-2.5 hover:bg-pov-bg/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-pov-muted uppercase tracking-wider">
            Control Delegation
          </span>
          {controlHolderUserId && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-pov-accent/30 text-pov-accent bg-pov-accent/10">
              🎮 Active
            </span>
          )}
        </div>
        <span className="text-pov-muted/50 text-xs">{collapsed ? '▼' : '▲'}</span>
      </button>

      {!collapsed && (
        <div className="border-t border-pov-border px-4 py-3 space-y-2">
          <p className="text-[11px] text-pov-muted/70 mb-3">
            Temporarily hand full playback and sync controls to one participant. You can reclaim at any time.
          </p>
          {participants.map((stream) => {
            const isHolder = stream.user_id === controlHolderUserId;
            return (
              <div
                key={stream.id}
                className={`flex items-center justify-between py-1.5 px-2 rounded ${
                  isHolder ? 'bg-pov-accent/5 border border-pov-accent/20' : ''
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-pov-text">{stream.display_name}</span>
                  {isHolder && (
                    <span className="text-[10px] font-mono text-pov-accent">🎮 has controls</span>
                  )}
                </div>
                {isHolder ? (
                  <button
                    onClick={onRevoke}
                    className="text-xs font-mono border border-pov-danger/40 text-pov-danger bg-pov-danger/5 hover:bg-pov-danger/15 rounded px-3 py-1 transition-colors"
                  >
                    Reclaim
                  </button>
                ) : (
                  <button
                    onClick={() => onDelegate(stream.user_id, stream.display_name)}
                    disabled={!!controlHolderUserId}
                    className="text-xs font-mono border border-pov-border text-pov-muted hover:border-pov-muted hover:text-pov-text rounded px-3 py-1 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={controlHolderUserId ? 'Reclaim controls first before delegating to someone else' : ''}
                  >
                    Give Control
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Participant context bar ────────────────────────────────── */

function ParticipantBar({ session, streams, effectiveSyncStats, controlHolderUserId, userId }) {
  // Find the host stream for display name
  const hostStream = streams.find((s) => s.user_id === session.host_id);
  const hostName = hostStream?.display_name ?? 'Host';

  // Sync health: check if start times are available
  const startTimesAvailable = effectiveSyncStats?.startTimesAvailable || {};
  const anchorId = effectiveSyncStats?.anchorStreamId;
  const nonAnchor = streams.filter((s) => s.id !== anchorId);
  const syncedCount = nonAnchor.filter((s) => startTimesAvailable[s.id]).length;
  const total = nonAnchor.length;

  const syncColor = total === 0 ? 'bg-pov-muted' : syncedCount === total ? 'bg-pov-success' : syncedCount > 0 ? 'bg-pov-warning' : 'bg-pov-danger';
  const syncLabel = total === 0 ? 'Waiting' : syncedCount === total ? 'Synced' : syncedCount > 0 ? 'Partial' : 'Waiting';

  const hasControl = !!controlHolderUserId && userId === controlHolderUserId;

  return (
    <div className="mb-2 sm:mb-3 flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1 bg-pov-surface border border-pov-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 text-[10px] sm:text-xs font-mono">
      {/* Host name */}
      <span className="text-pov-muted">
        Hosted by <span className="text-pov-text">{hostName}</span>
      </span>

      <span className="text-pov-border hidden sm:inline">|</span>

      {/* Sync dot */}
      <span className="flex items-center gap-1.5 text-pov-muted">
        <span className={`w-2 h-2 rounded-full ${syncColor}`} />
        {syncLabel}
      </span>

      <span className="text-pov-border hidden sm:inline">|</span>

      {/* POV count */}
      <span className="text-pov-muted">
        {streams.length} POV{streams.length !== 1 ? 's' : ''}
      </span>

      {/* Control delegation badge */}
      {hasControl && (
        <>
          <span className="text-pov-border hidden sm:inline">|</span>
          <span className="text-pov-accent flex items-center gap-1">
            <span className="text-[10px]">🎮</span> <span className="hidden sm:inline">You have controls</span><span className="sm:hidden">Controls</span>
          </span>
        </>
      )}
    </div>
  );
}
