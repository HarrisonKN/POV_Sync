/**
 * SessionRoom — unified layout for host, participant, and spectator.
 *
 * Props
 * ─────
 * role          'host' | 'participant' | 'spectator'
 * session       session row from Supabase (includes share_link)
 * streams       array of stream rows
 * onStreamsChange  (streams => void) — called when streams need updating in parent
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import StreamPlayer from '../components/StreamPlayer';
import StatusIndicators from '../components/StatusIndicators';
import ConfirmModal from '../components/ConfirmModal';
import PlaybackControls from '../components/PlaybackControls';
import { MAX_STREAMS_MVP, OFFSET_STEPS } from '../../../shared/constants.js';

import InfoPill from '../components/session/InfoPill';
import LinkRow from '../components/session/LinkRow';
import CycleViewPicker from '../components/session/CycleViewPicker';
import ControlButton from '../components/session/ControlButton';
import AnchorDeadBanner from '../components/session/AnchorDeadBanner';
import ControlDelegationPanel from '../components/session/ControlDelegationPanel';
import ParticipantBar from '../components/session/ParticipantBar';
import AddPovModal from '../components/session/AddPovModal';
import SyncStatusPanel from '../components/session/SyncStatusPanel';
import FinishedStreamOverlay from '../components/session/FinishedStreamOverlay';

const ROOM_TILE_MIN_WIDTH = 180;
const ROOM_TILE_MAX_WIDTH = 840;
const ROOM_TILE_DEFAULT_WIDTH = 300;
const QUALITY_MODE_STORAGE_KEY = 'povsync.qualityMode';
const POV_STRIP_LAYOUT_STORAGE_KEY = 'povsync.desktopPovStripLayout';
const QUALITY_MODE_OPTIONS = [
  { id: 'highest', label: 'Highest preferred', shortLabel: 'Highest', title: 'Force the highest available quality (4K/1440p/1080p)' },
  { id: 'high', label: 'High quality', shortLabel: 'High', title: 'Prefer 720p–1080p for a good balance of quality and performance' },
  { id: 'datasaver', label: 'Data saver', shortLabel: 'Low', title: 'Use lowest quality to save bandwidth' },
  { id: 'auto', label: 'Auto', shortLabel: 'Auto', title: 'Let the platform choose quality automatically' },
];
const SEEK_COOLDOWN_MS = 4000;
const VIEW_MODE_OPTIONS = [
  { id: 'stage', label: 'Stage view', shortLabel: 'Stage' },
  { id: 'wall', label: 'Wall view', shortLabel: 'Wall' },
  // { id: 'cycle', label: 'Cycle view', shortLabel: 'Cycle' },  // TODO: re-enable after custom fullscreen rework
];

export default function SessionRoom({ role, session, streams, onStreamsChange }) {
  const navigate = useNavigate();
  const { user, getAccessToken } = useAuth();

  const isHost = role === 'host';
  const isSpectator = role === 'spectator';
  const isVod = session?.status === 'ended';
  const sessionId = session?.id;

  // ── Layout / UI state ───────────────────────────────────────────────────────
  const [mainStreamId, setMainStreamId] = useState(null);
  const [viewMode, setViewMode] = useState('stage');
  const [roomTileWidth, setRoomTileWidth] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('povsync.roomTileWidth'));
      return Number.isFinite(saved) && saved > 0 ? saved : ROOM_TILE_DEFAULT_WIDTH;
    } catch (_) { return ROOM_TILE_DEFAULT_WIDTH; }
  });
  const [qualityMode, setQualityMode] = useState(() => {
    try {
      const saved = localStorage.getItem(QUALITY_MODE_STORAGE_KEY);
      return QUALITY_MODE_OPTIONS.some((option) => option.id === saved) ? saved : 'highest';
    } catch (_) {
      return 'highest';
    }
  });
  const [isMobileLayout, setIsMobileLayout] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );
  const [desktopPovStripLayout, setDesktopPovStripLayout] = useState(() => {
    try {
      const saved = localStorage.getItem(POV_STRIP_LAYOUT_STORAGE_KEY);
      return saved === 'horizontal' ? 'horizontal' : 'vertical';
    } catch (_) {
      return 'vertical';
    }
  });

  const [isRoomHeaderCollapsed, setIsRoomHeaderCollapsed] = useState(true);
  const [showSessionLinks, setShowSessionLinks] = useState(false);
  const [cycleUiVisible, setCycleUiVisible] = useState(true);
  const [cycleHoverStreamId, setCycleHoverStreamId] = useState(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // ── Session action state ────────────────────────────────────────────────────
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [modal, setModal] = useState(null);

  // ── Add-POV modal ───────────────────────────────────────────────────────────
  const [addPovOpen, setAddPovOpen] = useState(false);
  const [addPovUrl, setAddPovUrl] = useState('');
  const [addPovDisplayName, setAddPovDisplayName] = useState('');
  const [addPovSubmitting, setAddPovSubmitting] = useState(false);
  const [addPovError, setAddPovError] = useState(null);
  const [replacingStreamId, setReplacingStreamId] = useState(null);

  // ── Sync / offsets ──────────────────────────────────────────────────────────
  const [offsets, setOffsets] = useState(() => {
    const m = {};
    (streams || []).forEach((s) => { m[s.id] = s.offset_seconds ?? 0; });
    return m;
  });
  const [syncStats, setSyncStats] = useState(null);
  const [controlHolderUserId, setControlHolderUserId] = useState(null);
  const [anchorDeadBanner, setAnchorDeadBanner] = useState(false);
  const [pendingLatestAnchorId, setPendingLatestAnchorId] = useState(null);
  const [applyingLatestBaseline, setApplyingLatestBaseline] = useState(false);

  // Live player positions polled every second — drives UTC time display in filmstrip
  const [playerTimes, setPlayerTimes] = useState({});

  // ── Refs ────────────────────────────────────────────────────────────────────
  const playerRefs = useRef({});
  const readyCountRef = useRef(0);
  const isPlayingRef = useRef(true);
  const syncingRef = useRef(false);
  const lastSeekTs = useRef(0);
  // VOD: per-stream timestamp of last user-initiated seek — prevents anchor BUFFERING handler from undoing manual seeks
  const lastStreamSeekTs = useRef({});
  // Ref to saveOffset so handleStageStateChange can call it without a forward-reference dep
  const saveOffsetRef = useRef(null);
  const saveTimers = useRef({});
  const wsRef = useRef(null);
  const wsStartTimesRef = useRef(new Set());
  const persistedStartTimesRef = useRef(new Set());
  const persistingStartTimesRef = useRef(new Set());
  // Maps streamId → synthetic start time (Unix s) computed at runtime
  const localStartTimesRef = useRef({});
  const registeredStreamsRef = useRef(new Set());
  const cycleHideTimerRef = useRef(null);
  const cycleTouchStartRef = useRef(null);
  const autoInactiveReportsRef = useRef(new Set());
  const sessionRef = useRef(session);
  const endingRef = useRef(false);
  // spectator: tracks which stream the user has manually jumped to
  const localOverrideStreamIdRef = useRef(null);
  // Tracks the last time WE programmatically seeked the anchor (e.g. Go Live).
  // Used to suppress the BUFFERING feedback loop without blocking user scrubs.
  const anchorProgrammaticSeekTs = useRef(0);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { endingRef.current = ending; }, [ending]);

  // ── Sync offsets/streams into refs ─────────────────────────────────────────
  // During a live session, keep finished (is_active=false) streams visible so
  // the filmstrip shows the "Ended" overlay rather than removing the card.
  // VOD sessions already show all streams regardless of is_active.
  const visibleStreams = useMemo(() => (
    isVod ? streams : (streams || [])
  ), [isVod, streams]);

  // Count of streams that are actually live/active — used for canAddPov and the POV counter.
  const activeStreamCount = useMemo(() => (
    (streams || []).filter((s) => s.is_active !== false).length
  ), [streams]);

  const streamsRef = useRef(visibleStreams);
  useEffect(() => { streamsRef.current = visibleStreams; }, [visibleStreams]);

  const offsetsRef = useRef(offsets);
  useEffect(() => { offsetsRef.current = offsets; }, [offsets]);

  // When parent streams change, sync new offset entries
  useEffect(() => {
    if (!streams) return;
    setOffsets((prev) => {
      const next = { ...prev };
      streams.forEach((s) => {
        if (!(s.id in next)) next[s.id] = s.offset_seconds ?? 0;
      });
      return next;
    });
    // Seed localStartTimesRef from DB so getUtcTimeLabel & handleSyncToUtc work immediately
    streams.forEach((s) => {
      if (Number.isFinite(s.youtube_start_time) && s.youtube_start_time > 0 && !localStartTimesRef.current[s.id]) {
        localStartTimesRef.current[s.id] = s.youtube_start_time;
      }
    });
    console.log('[Init] Stream start times from DB:', streams.map(s => `${s.display_name}: youtube_start_time=${s.youtube_start_time ?? 'null'} offset=${s.offset_seconds ?? 'null'}`).join(', '));
  }, [streams]);

  // ── VOD: backfill missing start times from YouTube API ──────────────────────
  useEffect(() => {
    if (!isVod || !sessionId) return;
    // Check if any stream is missing a start time
    const missing = (streams || []).some((s) => !Number.isFinite(s.youtube_start_time) || s.youtube_start_time <= 0);
    if (!missing) return;
    console.log('[VOD] Some streams missing youtube_start_time — calling backfill endpoint…');
    fetch(`/api/sessions/${sessionId}/backfill-start-times`, { method: 'POST' })
      .then((r) => r.json())
      .then((data) => {
        if (data.updated?.length > 0) {
          console.log('[VOD] Backfilled start times:', data.updated);
          data.updated.forEach(({ streamId, startTime }) => {
            localStartTimesRef.current[streamId] = startTime;
          });
          // Update stream objects so getUtcTimeLabel picks them up
          onStreamsChange?.((prev) => prev.map((s) => {
            const match = data.updated.find((u) => u.streamId === s.id);
            return match ? { ...s, youtube_start_time: match.startTime } : s;
          }));
        } else {
          console.log('[VOD] Backfill returned no new start times');
        }
      })
      .catch((err) => console.warn('[VOD] Backfill failed:', err));
  }, [isVod, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived display values ──────────────────────────────────────────────────
  const hasControl = isHost || (!!controlHolderUserId && user?.id === controlHolderUserId);
  const canAddPov = isHost && !isVod && activeStreamCount < MAX_STREAMS_MVP;
  const nextPovLabel = `POV ${activeStreamCount + 1}`;
  const hostStream = visibleStreams.find((s) => s.user_id === session?.host_id);
  const hostName = hostStream?.display_name ?? 'Host';
  const anchorStream = visibleStreams.find((s) => s.is_anchor);

  const roomTileMinWidth = Math.min(Math.max(roomTileWidth, ROOM_TILE_MIN_WIDTH), ROOM_TILE_MAX_WIDTH);
  const desktopFocusProgress = (roomTileMinWidth - ROOM_TILE_MIN_WIDTH) / (ROOM_TILE_MAX_WIDTH - ROOM_TILE_MIN_WIDTH);
  const desktopSidebarWidth = Math.round(320 - desktopFocusProgress * 110);
  const desktopStageViewportOffset = Math.round(390 - desktopFocusProgress * 90);
  const wallItemCount = visibleStreams.length + (canAddPov ? 1 : 0);
  const desktopWallMaxColumns = wallItemCount >= 9 ? 5 : 4;
  const wallColumnCount = Math.min(desktopWallMaxColumns, Math.max(1, Math.ceil(Math.sqrt(Math.max(wallItemCount, 1)))));
  const wallGridMaxWidth = wallColumnCount * roomTileMinWidth + Math.max(0, wallColumnCount - 1) * 12;
  const filmstripTileWidth = Math.min(360, Math.max(180, Math.round(roomTileMinWidth * 0.58)));
  const effectiveWallColumnCount = isMobileLayout ? Math.min(2, Math.max(1, wallItemCount)) : wallColumnCount;
  const effectiveWallGridMaxWidth = isMobileLayout ? null : wallGridMaxWidth;
  const effectiveFilmstripTileWidth = isMobileLayout ? Math.min(240, Math.max(176, Math.round(roomTileMinWidth * 0.52))) : filmstripTileWidth;
  const isWallView = viewMode === 'wall';
  const isCycleView = viewMode === 'cycle';
  const isDesktopHorizontalPovStrip = !isMobileLayout && viewMode === 'stage' && desktopPovStripLayout === 'horizontal';
  const activeMainStream = visibleStreams.find((s) => s.id === mainStreamId) ?? null;
  const cycleActiveIndex = useMemo(
    () => visibleStreams.findIndex((s) => s.id === mainStreamId),
    [visibleStreams, mainStreamId]
  );
  const cycleHoverStream = visibleStreams.find((s) => s.id === cycleHoverStreamId) ?? null;
  const cycleInfoStream = cycleHoverStream ?? visibleStreams[cycleActiveIndex] ?? visibleStreams[0] ?? null;

  const effectiveSyncStats = syncStats ?? (visibleStreams.length > 0 ? {
    offsets: Object.fromEntries(visibleStreams.map((s) => [s.id, s.offset_seconds ?? 0])),
    confidence: Object.fromEntries(visibleStreams.map((s) => [s.id, 0])),
    startTimesAvailable: Object.fromEntries(visibleStreams.map((s) => [s.id, Boolean(s.youtube_start_time)])),
    anchorStreamId: anchorStream?.id ?? null,
    timestamp: null,
  } : null);

  // ── Persist tile width ──────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('povsync.roomTileWidth', String(roomTileWidth)); } catch (_) {}
  }, [roomTileWidth]);

  useEffect(() => {
    try { localStorage.setItem(QUALITY_MODE_STORAGE_KEY, qualityMode); } catch (_) {}
  }, [qualityMode]);

  useEffect(() => {
    try { localStorage.setItem(POV_STRIP_LAYOUT_STORAGE_KEY, desktopPovStripLayout); } catch (_) {}
  }, [desktopPovStripLayout]);

  // ── Mobile layout detection ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobileLayout(media.matches);
    handleChange();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);



  // ── Auto-select main stream ─────────────────────────────────────────────────
  useEffect(() => {
    const current = isVod ? streams : (streams || []).filter((s) => s.is_active !== false);
    if (!mainStreamId && current.length > 0) {
      const anchor = current.find((s) => s.is_anchor);
      setMainStreamId(anchor?.id || current[0]?.id);
    }
  }, [streams, isVod, mainStreamId]);

  // ── beforeunload warning (host live only) ──────────────────────────────────
  useEffect(() => {
    if (!isHost || isVod) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isHost, isVod]);

  // ── Cycle UI reveal / hide ──────────────────────────────────────────────────
  const revealCycleUi = useCallback(() => {
    setCycleUiVisible(true);
    if (cycleHideTimerRef.current) { window.clearTimeout(cycleHideTimerRef.current); cycleHideTimerRef.current = null; }
    cycleHideTimerRef.current = window.setTimeout(() => setCycleUiVisible(false), 2200);
  }, []);

  useEffect(() => {
    if (viewMode !== 'cycle') {
      setCycleUiVisible(true); setCycleHoverStreamId(null);
      if (cycleHideTimerRef.current) { window.clearTimeout(cycleHideTimerRef.current); cycleHideTimerRef.current = null; }
      return undefined;
    }
    revealCycleUi();
    return () => { if (cycleHideTimerRef.current) { window.clearTimeout(cycleHideTimerRef.current); cycleHideTimerRef.current = null; } };
  }, [revealCycleUi, viewMode]);

  useEffect(() => {
    if (!visibleStreams.some((s) => s.id === cycleHoverStreamId)) setCycleHoverStreamId(null);
  }, [cycleHoverStreamId, visibleStreams]);

  // ── WebSocket — participant / host (authenticated) ─────────────────────────
  useEffect(() => {
    if (isSpectator || !sessionId || session?.status === 'ended' || ending) return;

    let active = true;
    let ws = null;
    let reconnectTimer = null;

    const connect = async () => {
      if (!active || endingRef.current || sessionRef.current?.status === 'ended') return;
      const token = await getAccessToken();
      if (!active || !token) return;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;
      ws = new WebSocket(`${wsHost}/ws?sessionId=${sessionId}&role=participant`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected — sending auth...');
        // Send token as first message (not in URL) to avoid log/proxy leakage
        ws.send(JSON.stringify({ type: 'AUTH', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          // AUTH_OK — server confirmed auth; now register streams
          if (msg.type === 'AUTH_OK') {
            console.log('[WS] Authenticated — registering streams');
            registeredStreamsRef.current.clear();
            const cur = streamsRef.current;
            if (cur.length > 0) {
              ws.send(JSON.stringify({
                type: 'REGISTER_STREAMS',
                streams: cur.map((s) => ({ id: s.id, isAnchor: s.is_anchor })),
              }));
              cur.forEach((s) => registeredStreamsRef.current.add(s.id));
            }
            return;
          }

          if (msg.type === 'SYNC_OFFSETS') {
            const { offsets: serverOffsets, confidence, startTimesAvailable, timestamp } = msg;
            setSyncStats({ offsets: serverOffsets || {}, confidence: confidence || {}, startTimesAvailable: startTimesAvailable || {}, anchorStreamId: msg.anchorStreamId, timestamp });
            // Debug: log offsets + local start times + UTC positions
            const debugRows = Object.entries(serverOffsets || {}).map(([sid, off]) => {
              const st = localStartTimesRef.current[sid];
              const pt = playerRefs.current[sid]?.getCurrentTime?.() ?? null;
              const utc = (st && pt != null) ? new Date((st + pt) * 1000).toISOString().substring(11, 19) : 'n/a';
              return `  ${sid.slice(0,8)} offset=${off != null ? off.toFixed(2) + 's' : 'null'} startTime=${st ?? 'unknown'} playerTime=${pt != null ? pt.toFixed(1) : 'n/a'} UTC=${utc}`;
            }).join('\n');
            console.log(`[SYNC_OFFSETS] anchor=${msg.anchorStreamId?.slice(0,8)}\n${debugRows}`);
            Object.entries(serverOffsets || {}).forEach(([streamId, serverOffset]) => {
              if (serverOffset == null) return;
              const stream = streamsRef.current.find((s) => s.id === streamId);
              if (!stream) return;
              const cur = typeof stream.offset_seconds === 'number' ? stream.offset_seconds : null;
              if (cur === null || Math.abs(cur - serverOffset) > 0.05) {
                setOffsets((prev) => ({ ...prev, [streamId]: serverOffset }));
              }
            });
          } else if (msg.type === 'CONTROL_STATE') {
            setControlHolderUserId(msg.delegateeUserId ?? null);
          } else if (msg.type === 'ANCHOR_REMOVED') {
            setAnchorDeadBanner(true);
          } else if (msg.type === 'ANCHOR_AUTO_PROMOTED') {
            setAnchorDeadBanner(false);
          } else if (msg.type === 'STREAM_REMOVED') {
            onStreamsChange?.((prev) => prev.map((s) => s.id === msg.streamId ? { ...s, is_active: false } : s));
          } else if (msg.type === 'STREAM_UPDATED') {
            onStreamsChange?.((prev) => prev.map((s) => s.id === msg.stream?.id ? { ...s, ...msg.stream } : s));
          }
        } catch (err) {
          console.error('[WS] Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => { console.error('[WS] Error:', err); };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (active && !endingRef.current && sessionRef.current?.status !== 'ended') {
          console.log('[WS] Reconnecting in 3s…');
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      if (ws?.readyState === WebSocket.OPEN) ws.close();
      if (wsRef.current === ws) wsRef.current = null;
    };
  }, [isSpectator, sessionId, getAccessToken, session?.status, ending, onStreamsChange]);

  // ── WebSocket — spectator (unauthenticated, read-only) ─────────────────────
  useEffect(() => {
    if (!isSpectator || !sessionId) return;

    let active = true;
    let reconnectTimer = null;

    function connect() {
      if (!active) return;
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.host}`;
      const ws = new WebSocket(`${wsHost}/ws?sessionId=${sessionId}&role=spectator`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SYNC_OFFSETS') {
            setSyncStats({ offsets: msg.offsets || {}, confidence: msg.confidence || {}, startTimesAvailable: msg.startTimesAvailable || {}, anchorStreamId: msg.anchorStreamId ?? null, timestamp: msg.timestamp ?? null });
            setOffsets((prev) => ({ ...prev, ...(msg.offsets || {}) }));
          } else if (msg.type === 'ANCHOR_REMOVED') {
            setSyncStats((prev) => ({ ...(prev || {}), anchorRemoved: true }));
          } else if (msg.type === 'STREAM_REMOVED') {
            onStreamsChange?.((prev) => prev.map((s) => s.id === msg.streamId ? { ...s, is_active: false } : s));
          } else if (msg.type === 'STREAM_UPDATED') {
            onStreamsChange?.((prev) => prev.map((s) => s.id === msg.stream?.id ? { ...s, ...msg.stream } : s));
          }
        } catch (err) {
          console.error('[WS] Spectator message parse error:', err);
        }
      };

      ws.onerror = (err) => { console.error('[WS] Spectator error:', err); };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (active) { reconnectTimer = setTimeout(connect, 3000); }
      };
    }

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimer);
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close();
      wsRef.current = null;
    };
  }, [isSpectator, sessionId, onStreamsChange]);

  // ── Register new streams with WS as they arrive ────────────────────────────
  useEffect(() => {
    if (isSpectator) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const cur = isVod ? streams : (streams || []).filter((s) => s.is_active !== false);
    if (!cur.length) return;
    const unregistered = cur.filter((s) => !registeredStreamsRef.current.has(s.id));
    if (!unregistered.length) return;
    ws.send(JSON.stringify({ type: 'REGISTER_STREAMS', streams: unregistered.map((s) => ({ id: s.id, isAnchor: s.is_anchor })) }));
    unregistered.forEach((s) => registeredStreamsRef.current.add(s.id));
  }, [streams, isVod, isSpectator]);

  // ── Sync start-time reporting ──────────────────────────────────────────────
  const reportSyntheticStartTime = useCallback(async (streamId, player, { minPlayerTime = 0 } = {}) => {
    if (!player) return false;
    if (typeof player.getCurrentTime !== 'function') return false;
    let playerTime = 0;
    try { playerTime = player.getCurrentTime(); } catch (_) { return false; }
    if (!Number.isFinite(playerTime) || playerTime <= minPlayerTime) return false;

    const syntheticStart = Math.round((Date.now() / 1000) - playerTime);
    if (!Number.isFinite(syntheticStart) || syntheticStart <= 1000000000) return false;

    // Keep a local copy so getUtcTimeLabel works even before the DB round-trip.
    // Only overwrite if we don't already have a YouTube API value from the DB.
    if (!localStartTimesRef.current[streamId]) {
      localStartTimesRef.current[streamId] = syntheticStart;
    }

    // In VOD mode, we only needed the local copy — skip WS and persistence
    if (sessionRef.current?.status === 'ended') return true;

    const ws = wsRef.current;
    if (!wsStartTimesRef.current.has(streamId) && ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'STREAM_START_TIME', streamId, startTime: syntheticStart }));
      wsStartTimesRef.current.add(streamId);
    }

    if (persistedStartTimesRef.current.has(streamId) || persistingStartTimesRef.current.has(streamId)) return true;
    persistingStartTimesRef.current.add(streamId);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/sessions/${sessionId}/streams/${streamId}/start-time`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ startTime: syntheticStart }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to persist start time'); }
      persistedStartTimesRef.current.add(streamId);
      return true;
    } catch (err) {
      console.error('[Sync] Failed to persist start time:', err);
      return false;
    } finally {
      persistingStartTimesRef.current.delete(streamId);
    }
  }, [getAccessToken, sessionId]);

  useEffect(() => {
    if (isSpectator) return;
    const timerId = setInterval(() => {
      for (const stream of streamsRef.current) {
        if (wsStartTimesRef.current.has(stream.id) && persistedStartTimesRef.current.has(stream.id)) continue;
        const player = playerRefs.current[stream.id];
        if (!player) continue;
        reportSyntheticStartTime(stream.id, player, { minPlayerTime: 10 }).catch(() => {});
      }
    }, 5000);
    return () => clearInterval(timerId);
  }, [isSpectator, reportSyntheticStartTime]);

  // ── Mirrored pair sync ──────────────────────────────────────────────────────
  const syncMirroredPair = useCallback((streamId, preferredPlayerId = streamId, threshold = 0.35) => {
    const stagePlayer = playerRefs.current[streamId];
    const filmPlayer = playerRefs.current[`film-${streamId}`];
    if (!stagePlayer || !filmPlayer || stagePlayer === filmPlayer) return;
    const useFilm = preferredPlayerId === `film-${streamId}`;
    const src = useFilm ? filmPlayer : stagePlayer;
    const tgt = useFilm ? stagePlayer : filmPlayer;
    try {
      const st = src.getCurrentTime?.();
      const tt = tgt.getCurrentTime?.();
      if (Number.isFinite(st) && Number.isFinite(tt) && Math.abs(st - tt) > threshold) { lastSeekTs.current = Date.now(); tgt.seekTo?.(st, true); }
      const YT = window.YT;
      const state = src.getPlayerState?.();
      if (!YT || typeof state !== 'number') return;
      if (state === YT.PlayerState.PLAYING) tgt.playVideo?.();
      else if (state === YT.PlayerState.PAUSED) tgt.pauseVideo?.();
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!mainStreamId) return;
    const id = window.setTimeout(() => syncMirroredPair(mainStreamId, `film-${mainStreamId}`), 120);
    return () => window.clearTimeout(id);
  }, [mainStreamId, syncMirroredPair]);

  useEffect(() => {
    const id = setInterval(() => {
      if (syncingRef.current || Date.now() - lastSeekTs.current < SEEK_COOLDOWN_MS) return;
      streamsRef.current.forEach((stream) => {
        const preferred = stream.id === mainStreamId ? stream.id : `film-${stream.id}`;
        syncMirroredPair(stream.id, preferred, 0.35);
      });
    }, 2500);
    return () => clearInterval(id);
  }, [mainStreamId, syncMirroredPair]);

  // ── Drift correction interval ───────────────────────────────────────────────
  useEffect(() => {
    // In VOD mode, the user is in control — no automatic drift correction.
    // They can hit UTC Sync manually whenever they want to re-align.
    if (isVod) return;
    const DRIFT_SEEK_THRESHOLD = 3;
    const FILM_DRIFT_THRESHOLD = 1.5;
    const id = setInterval(() => {
      if (syncingRef.current || Date.now() - lastSeekTs.current < SEEK_COOLDOWN_MS) return;
      const streams = streamsRef.current;
      const anchor = streams.find((s) => s.is_anchor);
      if (!anchor) return;
      const anchorPlayer = playerRefs.current[anchor.id];
      if (!anchorPlayer || typeof anchorPlayer.getCurrentTime !== 'function') return;
      let anchorTime; try { anchorTime = anchorPlayer.getCurrentTime(); } catch (_) { return; }
      if (typeof anchorTime !== 'number' || anchorTime <= 0) return;
      let didSeek = false;
      try {
        const film = playerRefs.current[`film-${anchor.id}`];
        if (film && Math.abs((film.getCurrentTime?.() ?? 0) - anchorTime) > FILM_DRIFT_THRESHOLD) { film.seekTo(anchorTime, true); didSeek = true; }
      } catch (_) {}
      streams.forEach((stream) => {
        if (stream.id === anchor.id) return;
        const offset = offsetsRef.current[stream.id] ?? 0;
        const expected = Math.max(0, anchorTime - offset);
        try { const stage = playerRefs.current[stream.id]; if (stage && Math.abs((stage.getCurrentTime?.() ?? 0) - expected) > DRIFT_SEEK_THRESHOLD) { stage.seekTo(expected, true); didSeek = true; } } catch (_) {}
        try { const film = playerRefs.current[`film-${stream.id}`]; if (film && Math.abs((film.getCurrentTime?.() ?? 0) - expected) > FILM_DRIFT_THRESHOLD) { film.seekTo(expected, true); didSeek = true; } } catch (_) {}
      });
      if (didSeek) lastSeekTs.current = Date.now();
    }, 8000);
    return () => clearInterval(id);
  }, [isVod]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player time polling — 1 s tick for UTC timestamp display ───────────────
  useEffect(() => {
    const id = setInterval(() => {
      const next = {};
      for (const stream of streamsRef.current) {
        const player = playerRefs.current[stream.id];
        if (!player || typeof player.getCurrentTime !== 'function') continue;
        try {
          const t = player.getCurrentTime();
          if (Number.isFinite(t) && t > 0) next[stream.id] = t;
        } catch (_) {}
      }
      if (Object.keys(next).length > 0) setPlayerTimes((prev) => ({ ...prev, ...next }));
    }, 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Player callbacks ────────────────────────────────────────────────────────
  const reportStreamInactive = useCallback(async (streamId, reason = 'ended') => {
    if (!sessionId || sessionRef.current?.status === 'ended') return;
    if (autoInactiveReportsRef.current.has(streamId)) return;
    const stream = streamsRef.current.find((s) => s.id === streamId);
    if (!stream) return;
    const canReport = isHost || stream.user_id === user?.id;
    if (!canReport) return;
    autoInactiveReportsRef.current.add(streamId);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/sessions/${sessionId}/streams/${streamId}/auto-inactive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error(`Auto-inactive failed (${res.status})`);
      const payload = await res.json().catch(() => ({}));
      if (payload?.promotedAnchorStreamId) setAnchorDeadBanner(false);
    } catch (err) {
      console.error('[SessionRoom] Auto-inactive failed:', err);
      autoInactiveReportsRef.current.delete(streamId);
    }
  }, [getAccessToken, isHost, sessionId, user?.id]);

  const handlePlayerReady = useCallback((streamId, player) => {
    playerRefs.current[streamId] = player;
    const streams = streamsRef.current;
    if (!streams.length) return;
    if (typeof streamId === 'string' && streamId.startsWith('film-')) {
      // Layout swap (horizontal ↔ vertical) unmounts and remounts filmstrip iframes.
      // Seek the newly-mounted film player to the stage player's current time so it
      // doesn't restart from 0.
      const baseId = streamId.slice('film-'.length);
      window.setTimeout(() => syncMirroredPair(baseId, baseId), 150);
      return;
    }
    const sessionStatus = sessionRef.current?.status;
    syncMirroredPair(streamId, streamId);
    // Always report synthetic start time (for UTC labels), even in VOD
    reportSyntheticStartTime(streamId, player).catch(() => {});
    if (sessionStatus !== 'ended') return;
    readyCountRef.current += 1;
    if (readyCountRef.current < streams.length) return;
    // All players ready — do a UTC-based initial sync
    console.log('[VOD] All players ready — performing initial UTC sync');
    const anchor = streams.find((s) => s.is_anchor);
    if (!anchor) return;
    const ap = playerRefs.current[anchor.id];
    const anchorPlayerTime = ap?.getCurrentTime?.() ?? 0;
    const anchorStartTime = localStartTimesRef.current[anchor.id] ?? anchor.youtube_start_time;
    // If we have UTC start times, do a proper UTC sync
    if (Number.isFinite(anchorStartTime) && anchorStartTime > 0 && anchorPlayerTime > 0) {
      const anchorUtc = anchorStartTime + anchorPlayerTime;
      const utcOffsets = {};
      streams.forEach((stream) => {
        const st = localStartTimesRef.current[stream.id] ?? stream.youtube_start_time;
        if (!Number.isFinite(st) || st <= 0) return;
        utcOffsets[stream.id] = Math.round((st - anchorStartTime) * 100) / 100;
        const target = Math.max(0, anchorUtc - st);
        try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
        try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
      });
      setOffsets((prev) => ({ ...prev, ...utcOffsets }));
      console.log('[VOD] Initial UTC sync complete — offsets:', utcOffsets);
    } else {
      // Fall back to DB offsets
      streams.forEach((stream) => {
        const offset = offsetsRef.current[stream.id] ?? 0;
        const target = Math.max(0, -offset);
        try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
        try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
      });
      console.log('[VOD] Fell back to DB offset sync (no UTC start times)');
    }
  }, [isSpectator, reportSyntheticStartTime, syncMirroredPair]);

  const handleStageStateChange = useCallback((streamId, state) => {
    if (syncingRef.current) return;
    const YT = window.YT;
    if (!YT) return;
    if (sessionRef.current?.status !== 'ended' && state === YT.PlayerState.ENDED) {
      if (!isSpectator) reportStreamInactive(streamId, 'youtube-ended');
      return;
    }
    const isAnchor = streamsRef.current.find((s) => s.id === streamId)?.is_anchor ?? false;
    if (isAnchor && state === YT.PlayerState.BUFFERING) {
      // Only suppress if WE programmatically seeked the anchor recently (e.g. Go Live).
      // Do NOT use lastSeekTs here — that gets set after every seek including the ones
      // this handler triggers, which would block rapid user scrubs within 4s.
      if (Date.now() - anchorProgrammaticSeekTs.current < SEEK_COOLDOWN_MS) return;
      setTimeout(() => {
        const ap = playerRefs.current[streamId];
        if (!ap) return;
        const anchorTime = ap.getCurrentTime?.() ?? 0;
        if (anchorTime <= 0) return; // player not ready yet
        syncingRef.current = true;
        lastSeekTs.current = Date.now();

        // Prefer UTC-based offsets if anchor has a known start time
        const anchorStartTime = localStartTimesRef.current[streamId];
        const useUtc = Number.isFinite(anchorStartTime) && anchorStartTime > 0;

        const VOD_STREAM_SEEK_PROTECT_MS = 12000;
        streamsRef.current.forEach((stream) => {
          if (stream.id === streamId) return;
          // VOD: if the user manually seeked this stream recently, leave it alone
          if (sessionRef.current?.status === 'ended' && Date.now() - (lastStreamSeekTs.current[stream.id] ?? 0) < VOD_STREAM_SEEK_PROTECT_MS) return;
          let target;
          if (useUtc) {
            const st = localStartTimesRef.current[stream.id] ?? stream.youtube_start_time;
            if (Number.isFinite(st) && st > 0) {
              target = Math.max(0, (anchorStartTime + anchorTime) - st);
            } else {
              const offset = offsetsRef.current[stream.id] ?? 0;
              target = Math.max(0, anchorTime - offset);
            }
          } else {
            const offset = offsetsRef.current[stream.id] ?? 0;
            target = Math.max(0, anchorTime - offset);
          }
          try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
          try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
        });
        try { playerRefs.current[`film-${streamId}`]?.seekTo(anchorTime, true); } catch (_) {}
        syncingRef.current = false;
        console.log(`[Sync] Anchor scrub → ${anchorTime.toFixed(1)}s | synced ${streamsRef.current.length - 1} streams ${useUtc ? '(UTC)' : '(offsets)'}`);
      }, 350);
      return;
    }
    if (!isAnchor && state === YT.PlayerState.BUFFERING) {
      // VOD: user manually seeked a non-anchor stream — stamp the time and recalculate
      // the offset so subsequent anchor syncs land at the right position
      if (sessionRef.current?.status === 'ended' && !syncingRef.current) {
        const anchor = streamsRef.current.find((s) => s.is_anchor);
        const ap = anchor ? playerRefs.current[anchor.id] : null;
        const sp = playerRefs.current[streamId];
        if (ap && sp) {
          try {
            const anchorTime = ap.getCurrentTime?.() ?? 0;
            const streamTime = sp.getCurrentTime?.() ?? 0;
            if (anchorTime > 0 && streamTime > 0) {
              const newOffset = anchorTime - streamTime;
              lastStreamSeekTs.current[streamId] = Date.now();
              setOffsets((prev) => ({ ...prev, [streamId]: newOffset }));
              saveOffsetRef.current?.(streamId, newOffset);
              console.log(`[VOD] User seeked ${streamId} → recalculated offset = ${newOffset.toFixed(1)}s`);
            }
          } catch (_) {}
        }
      }
      return;
    }
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
      const film = playerRefs.current[`film-${streamId}`];
      if (film) { try { playing ? film.playVideo() : film.pauseVideo(); } catch (_) {} }
    }
    syncingRef.current = false;
  }, [isSpectator, reportStreamInactive]);

  const handleStageError = useCallback((streamId, errorCode) => {
    if (sessionRef.current?.status === 'ended' || isSpectator) return;
    // Twitch fires ENDED via the error callback path — treat it like YouTube's ENDED state.
    if (errorCode === 'ENDED') {
      reportStreamInactive(streamId, 'twitch-ended');
      return;
    }
    reportStreamInactive(streamId, `player-error:${String(errorCode)}`);
  }, [isSpectator, reportStreamInactive]);

  const handleSwapStream = useCallback((newStreamId) => {
    if (newStreamId === mainStreamId) return;
    syncMirroredPair(newStreamId, `film-${newStreamId}`);
    setMainStreamId(newStreamId);
  }, [mainStreamId, syncMirroredPair]);

  // Auto-switch non-hosts away from a stream that just ended.
  // Runs whenever streams change — if the current main stream is now inactive,
  // jump to the first still-active stream.
  useEffect(() => {
    if (isHost || !mainStreamId || !streams) return;
    const current = streams.find((s) => s.id === mainStreamId);
    if (!current || current.is_active !== false) return;
    const nextActive = streams.find((s) => s.is_active !== false);
    if (nextActive) {
      syncMirroredPair(nextActive.id, `film-${nextActive.id}`);
      setMainStreamId(nextActive.id);
    }
  }, [streams, mainStreamId, isHost, syncMirroredPair]);

  // ── Finished-stream host actions ────────────────────────────────────────────
  const handleReplayStream = useCallback(async (streamId) => {
    // Clear dedup guard so the stream can report inactive again if it re-ends.
    autoInactiveReportsRef.current.delete(streamId);
    try {
      const token = await getAccessToken();
      await fetch(`/api/sessions/${sessionId}/streams/${streamId}/reactivate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      });
      // Seek to start and play.
      const stage = playerRefs.current[streamId];
      const film = playerRefs.current[`film-${streamId}`];
      try { stage?.seekTo(0, true); stage?.playVideo(); } catch (_) {}
      try { film?.seekTo(0, true); film?.playVideo(); } catch (_) {}
    } catch (err) {
      console.error('[SessionRoom] Replay failed:', err);
    }
  }, [getAccessToken, sessionId]);

  const handleReplaceStream = useCallback((streamId) => {
    const stream = (streams || []).find((s) => s.id === streamId);
    setReplacingStreamId(streamId);
    setAddPovUrl('');
    setAddPovDisplayName(stream?.display_name ?? '');
    setAddPovError(null);
    setAddPovOpen(true);
  }, [streams]);

  const handleClearStream = useCallback(async (streamId) => {
    try {
      const token = await getAccessToken();
      await fetch(`/api/sessions/${sessionId}/streams/${streamId}`, {
        method: 'DELETE',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
      });
    } catch (err) {
      console.error('[SessionRoom] Clear stream failed:', err);
    }
  }, [getAccessToken, sessionId]);

  const handleCycleStep = useCallback((direction) => {
    if (!visibleStreams.length) return;
    const cur = visibleStreams.findIndex((s) => s.id === mainStreamId);
    const safe = cur >= 0 ? cur : 0;
    const next = (safe + direction + visibleStreams.length) % visibleStreams.length;
    const nextId = visibleStreams[next]?.id;
    if (!nextId) return;
    handleSwapStream(nextId);
    setCycleHoverStreamId(nextId);
    revealCycleUi();
  }, [handleSwapStream, mainStreamId, revealCycleUi, visibleStreams]);

  useEffect(() => {
    if (viewMode !== 'cycle') return undefined;
    const handleKey = (e) => {
      if (e.key === 'ArrowLeft') handleCycleStep(-1);
      if (e.key === 'ArrowRight') handleCycleStep(1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleCycleStep, viewMode]);

  // ── Master controls ─────────────────────────────────────────────────────────
  const handlePlayAll = useCallback(() => {
    isPlayingRef.current = true; syncingRef.current = true;
    Object.values(playerRefs.current).forEach((p) => { try { p.playVideo(); } catch (_) {} });
    syncingRef.current = false;
  }, []);

  const handlePauseAll = useCallback(() => {
    isPlayingRef.current = false; syncingRef.current = true;
    Object.values(playerRefs.current).forEach((p) => { try { p.pauseVideo(); } catch (_) {} });
    syncingRef.current = false;
  }, []);

  const handleGoLive = useCallback(() => {
    syncingRef.current = true;
    lastSeekTs.current = Date.now();
    anchorProgrammaticSeekTs.current = Date.now(); // suppress BUFFERING feedback from our own seek
    streamsRef.current.forEach((stream) => {
      const stage = playerRefs.current[stream.id];
      const film = playerRefs.current[`film-${stream.id}`];
      const offset = offsetsRef.current[stream.id] ?? 0;
      try {
        const dur = stage?.getDuration?.() ?? film?.getDuration?.() ?? 0;
        const liveEdge = dur > 0 ? dur : 9999999;
        const target = Math.max(0, liveEdge - offset);
        stage?.seekTo(target, true); film?.seekTo(target, true);
      } catch (_) {}
    });
    syncingRef.current = false;
  }, []);

  const handleResync = useCallback(() => {
    const anchor = streamsRef.current.find((s) => s.is_anchor);
    const ap = anchor ? playerRefs.current[anchor.id] : null;
    const anchorTime = ap?.getCurrentTime?.() ?? 0;
    if (!anchor || !Number.isFinite(anchorTime) || anchorTime <= 0) { handleGoLive(); return; }
    syncingRef.current = true; lastSeekTs.current = Date.now();
    streamsRef.current.forEach((stream) => {
      const offset = offsetsRef.current[stream.id] ?? 0;
      const target = Math.max(0, anchorTime - offset);
      try { playerRefs.current[stream.id]?.seekTo?.(target, true); } catch (_) {}
      try { playerRefs.current[`film-${stream.id}`]?.seekTo?.(target, true); } catch (_) {}
    });
    syncingRef.current = false;
  }, [handleGoLive]);

  // Seek all streams to the same UTC wall-clock moment the anchor is currently at.
  // Uses youtube_start_time (from YouTube API or synthetic) directly — does not
  // rely on offsetsRef so it works even when offsets haven't propagated yet.
  const handleSyncToUtc = useCallback(() => {
    const anchor = streamsRef.current.find((s) => s.is_anchor);
    if (!anchor) return;
    const ap = playerRefs.current[anchor.id];
    const anchorPlayerTime = ap?.getCurrentTime?.() ?? 0;
    if (!Number.isFinite(anchorPlayerTime) || anchorPlayerTime <= 0) return;

    const anchorStartTime = localStartTimesRef.current[anchor.id] ?? anchor.youtube_start_time;
    if (!Number.isFinite(anchorStartTime) || anchorStartTime <= 0) {
      console.warn('[UTC Sync] Anchor start time unknown — falling back to Re-sync');
      handleResync();
      return;
    }

    const anchorUtc = anchorStartTime + anchorPlayerTime; // Unix epoch seconds
    console.log(`[UTC Sync] Anchor UTC = ${new Date(anchorUtc * 1000).toISOString().substring(11,19)} UTC (playerTime=${anchorPlayerTime.toFixed(1)}s)`);

    syncingRef.current = true;
    lastSeekTs.current = Date.now();
    anchorProgrammaticSeekTs.current = Date.now();

    // Compute UTC-based offsets and push them into offsetsRef so the drift
    // correction interval (every 8 s) doesn't yank streams back to stale positions.
    const utcOffsets = {};
    streamsRef.current.forEach((stream) => {
      const streamStartTime = localStartTimesRef.current[stream.id] ?? stream.youtube_start_time;
      if (!Number.isFinite(streamStartTime) || streamStartTime <= 0) {
        console.warn(`[UTC Sync] No start time for stream ${stream.id.slice(0,8)} — skipping`);
        return;
      }
      // offset = streamStart - anchorStart  (same formula as syncManager)
      const utcOffset = Math.round((streamStartTime - anchorStartTime) * 100) / 100;
      utcOffsets[stream.id] = utcOffset;
      const target = Math.max(0, anchorUtc - streamStartTime);
      console.log(`[UTC Sync]   ${stream.display_name}: startTime=${new Date(streamStartTime*1000).toISOString().substring(11,19)} UTC  offset=${utcOffset.toFixed(2)}s → seek to ${target.toFixed(1)}s`);
      try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
      try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
    });

    // Update offsets state + ref so drift correction uses the UTC-derived values
    setOffsets((prev) => ({ ...prev, ...utcOffsets }));

    syncingRef.current = false;
  }, [handleResync]);

  // ── Local playback (for spectator resync + personal controls) ──────────────
  const handleLocalPlaybackStep = useCallback((deltaSeconds) => {
    if (!mainStreamId) return;
    const stage = playerRefs.current[mainStreamId];
    const film = playerRefs.current[`film-${mainStreamId}`];
    const ref = stage ?? film;
    const cur = ref?.getCurrentTime?.();
    if (!Number.isFinite(cur)) return;
    const target = Math.max(0, cur + deltaSeconds);
    syncingRef.current = true; lastSeekTs.current = Date.now();
    try { stage?.seekTo?.(target, true); } catch (_) {}
    try { film?.seekTo?.(target, true); } catch (_) {}
    syncingRef.current = false;
  }, [mainStreamId]);

  const handleGoLiveLocal = useCallback(() => {
    if (!mainStreamId) return;
    const stage = playerRefs.current[mainStreamId];
    const film = playerRefs.current[`film-${mainStreamId}`];
    const offset = offsetsRef.current[mainStreamId] ?? 0;
    syncingRef.current = true; lastSeekTs.current = Date.now();
    if (!isSpectator) localOverrideStreamIdRef.current = mainStreamId;
    try {
      const dur = stage?.getDuration?.() ?? film?.getDuration?.() ?? 0;
      const liveEdge = dur > 0 ? dur : 9999999;
      const target = Math.max(0, liveEdge - offset);
      stage?.seekTo?.(target, true); film?.seekTo?.(target, true);
    } catch (_) {}
    syncingRef.current = false;
  }, [isSpectator, mainStreamId]);

  const handleResyncLocal = useCallback(() => {
    if (!mainStreamId) return;
    if (isSpectator) localOverrideStreamIdRef.current = null;
    const anchor = streamsRef.current.find((s) => s.is_anchor);
    const ap = anchor ? playerRefs.current[anchor.id] : null;
    const anchorTime = ap?.getCurrentTime?.() ?? 0;
    if (!anchor || !Number.isFinite(anchorTime) || anchorTime <= 0) { handleGoLiveLocal(); return; }
    const stage = playerRefs.current[mainStreamId];
    const film = playerRefs.current[`film-${mainStreamId}`];
    const offset = offsetsRef.current[mainStreamId] ?? 0;
    const target = Math.max(0, anchorTime - offset);
    syncingRef.current = true; lastSeekTs.current = Date.now();
    try { stage?.seekTo?.(target, true); } catch (_) {}
    try { film?.seekTo?.(target, true); } catch (_) {}
    syncingRef.current = false;
  }, [handleGoLiveLocal, isSpectator, mainStreamId]);

  // ── Offset controls ─────────────────────────────────────────────────────────
  const saveOffset = useCallback((streamId, newOffset) => {
    clearTimeout(saveTimers.current[streamId]);
    saveTimers.current[streamId] = setTimeout(async () => {
      try {
        const token = await getAccessToken();
        await fetch(`/api/sessions/${sessionId}/streams/${streamId}/offset`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({ offsetSeconds: newOffset }),
        });
      } catch (err) { console.error('[Offset] Save failed:', err); }
    }, 800);
  }, [sessionId, getAccessToken]);
  saveOffsetRef.current = saveOffset;

  const stepOffset = useCallback((streamId, deltaSeconds) => {
    setOffsets((prev) => {
      const cur = prev[streamId] ?? 0;
      const next = Math.round((cur + deltaSeconds) * 1000) / 1000;
      const ap = playerRefs.current[streamsRef.current.find((s) => s.is_anchor)?.id];
      const stage = playerRefs.current[streamId];
      const film = playerRefs.current[`film-${streamId}`];
      if (stage && ap) {
        try {
          const anchorTime = ap.getCurrentTime?.() ?? 0;
          const target = Math.max(0, anchorTime - next);
          lastSeekTs.current = Date.now();
          stage.seekTo(target, true); film?.seekTo(target, true);
        } catch (_) {}
      }
      saveOffset(streamId, next);
      return { ...prev, [streamId]: next };
    });
  }, [saveOffset]);

  // ── Pending latest anchor + Go Live ────────────────────────────────────────
  useEffect(() => {
    if (!pendingLatestAnchorId) return;
    if (effectiveSyncStats?.anchorStreamId !== pendingLatestAnchorId) return;
    handleGoLive();
    setPendingLatestAnchorId(null);
    setApplyingLatestBaseline(false);
  }, [effectiveSyncStats?.anchorStreamId, handleGoLive, pendingLatestAnchorId]);

  // ── Delegation ──────────────────────────────────────────────────────────────
  const handleDelegateControl = useCallback(async (delegateeUserId, displayName) => {
    const doDelegate = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/delegate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({ delegateeUserId }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delegate control'); }
      } catch (err) { setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' }); }
    };
    setModal({ title: 'Delegate Controls', message: `Give full controls to ${displayName}?`, confirmLabel: 'Delegate', onConfirm: doDelegate });
  }, [sessionId, getAccessToken]);

  const handleRevokeControl = useCallback(async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/sessions/${sessionId}/revoke-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to revoke control'); }
    } catch (err) { setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' }); }
  }, [sessionId, getAccessToken]);

  const handlePromoteAnchor = useCallback(async (streamId) => {
    const doPromote = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/promote-anchor`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({ streamId }),
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to promote anchor'); }
      } catch (err) { setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' }); }
    };
    setModal({ title: 'Promote Anchor', message: 'Promote this stream to anchor? All offsets will recalculate.', confirmLabel: 'Promote', onConfirm: doPromote });
  }, [sessionId, getAccessToken]);

  const handleSyncToLatestStart = useCallback(() => {
    const doSync = async () => {
      try {
        setApplyingLatestBaseline(true);
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/sync-to-latest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to sync to latest POV');
        setPendingLatestAnchorId(data.streamId || null);
      } catch (err) {
        setApplyingLatestBaseline(false); setPendingLatestAnchorId(null);
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      }
    };
    setModal({ title: 'Apply Latest Baseline', message: 'Use the newest confirmed POV as the room sync baseline? The room will snap back to live after the recalculated offsets arrive.', confirmLabel: 'Apply Baseline', onConfirm: doSync });
  }, [getAccessToken, sessionId]);

  // ── Kick participant ────────────────────────────────────────────────────────
  const handleKickParticipant = useCallback((streamId, displayName) => {
    const doKick = async () => {
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/streams/${streamId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to remove participant'); }
      } catch (err) { setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' }); }
    };
    setModal({ title: 'Remove Participant', message: `Remove ${displayName} from the room? Their stream will be archived.`, confirmLabel: 'Remove', destructive: true, onConfirm: doKick });
  }, [sessionId, getAccessToken]);

  // ── End / Leave session ─────────────────────────────────────────────────────
  function handleEndSession() {
    const doEnd = async () => {
      setEnding(true);
      try {
        const token = await getAccessToken();
        if (!token) throw new Error('Your sign-in expired. Refresh and try again.');
        const res = await fetch(`/api/sessions/${sessionId}/end`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to end session'); }
        const endedAt = new Date().toISOString();
        // Notify parent — parent updates session state via Supabase realtime normally,
        // but we also patch locally for immediate UI update.
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.close(1000, 'session ended');
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      } finally {
        setEnding(false);
      }
    };
    setModal({ title: 'End Session', message: 'End this session? It will be saved as a VOD.', confirmLabel: 'End Session', destructive: true, onConfirm: doEnd });
  }

  function handleLeaveSession() {
    const doLeave = async () => {
      setLeaving(true);
      try {
        const token = await getAccessToken();
        const res = await fetch(`/api/sessions/${sessionId}/leave`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        });
        if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to leave session'); }
        navigate('/');
      } catch (err) {
        setModal({ title: 'Error', message: err.message, variant: 'alert', confirmLabel: 'OK' });
      } finally {
        setLeaving(false);
      }
    };
    setModal({ title: 'Leave Session', message: 'Leave this session? Your stream will be archived for the VOD.', confirmLabel: 'Leave', destructive: true, onConfirm: doLeave });
  }

  // ── Add POV ─────────────────────────────────────────────────────────────────
  const openAddPovModal = useCallback(() => {
    if (!isHost || isVod) return;
    setAddPovUrl(''); setAddPovDisplayName(nextPovLabel); setAddPovError(null); setAddPovOpen(true);
  }, [isHost, isVod, nextPovLabel]);

  const closeAddPovModal = useCallback(() => {
    if (addPovSubmitting) return;
    setAddPovOpen(false); setAddPovError(null); setReplacingStreamId(null);
  }, [addPovSubmitting]);

  const handleAddPov = useCallback(async (e) => {
    e.preventDefault();
    const streamUrl = addPovUrl.trim();
    const displayName = addPovDisplayName.trim();
    if (!streamUrl) { setAddPovError('Enter a YouTube or Twitch URL.'); return; }
    try {
      setAddPovSubmitting(true); setAddPovError(null);
      const token = await getAccessToken();
      if (replacingStreamId) {
        // Replace mode: update the existing finished stream's URL.
        const res = await fetch(`/api/sessions/${sessionId}/streams/${replacingStreamId}/url`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({ youtubeUrl: streamUrl, displayName }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to replace POV');
        // Clear dedup guard so the new video can report inactive if it ends.
        autoInactiveReportsRef.current.delete(replacingStreamId);
      } else {
        const res = await fetch(`/api/sessions/${sessionId}/streams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
          body: JSON.stringify({ youtubeUrl: streamUrl, displayName }),
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(payload.error || 'Failed to add POV');
      }
      setAddPovOpen(false); setAddPovUrl(''); setAddPovDisplayName(''); setReplacingStreamId(null);
    } catch (err) {
      setAddPovError(err.message || 'Failed to add POV');
    } finally {
      setAddPovSubmitting(false);
    }
  }, [addPovDisplayName, addPovUrl, getAccessToken, replacingStreamId, sessionId]);

  const renderAddPovTile = useCallback((wrapperClassName, buttonClassName) => (
    <div className={wrapperClassName}>
      <button type="button" onClick={openAddPovModal} className={buttonClassName}>
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-pov-surface/95 via-pov-card/90 to-pov-surface/95">
          <div className="flex flex-col items-center gap-2 px-3 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-pov-accent/50 bg-pov-accent/10 text-xl font-semibold text-pov-accent">+</div>
            <div>
              <p className="font-semibold text-pov-text text-xs">Add POV</p>
              <p className="text-[10px] text-pov-muted">Drop in another stream</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  ), [openAddPovModal]);

  // ── Global keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKey = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          if (isPlayingRef.current) handlePauseAll(); else handlePlayAll();
          break;
        case '1': case '2': case '3': case '4': case '5': {
          const idx = Number(e.key) - 1;
          const stream = visibleStreams[idx];
          if (stream) handleSwapStream(stream.id);
          break;
        }
        case '?': setShowShortcutsHelp((v) => !v); break;
        case 'Escape': setShowShortcutsHelp(false); break;
        default: break;
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [handlePlayAll, handlePauseAll, handleSwapStream, visibleStreams]);

  // Returns a UTC wall-clock string for the video's current position, e.g. "14:32:07 UTC".
  // Requires youtube_start_time (Unix epoch s) and a live player position.
  const getUtcTimeLabel = (stream) => {
    // Prefer runtime-computed start time; fall back to DB value (may be stale/null)
    const startTime = localStartTimesRef.current[stream.id] ?? stream.youtube_start_time;
    if (!Number.isFinite(startTime) || startTime <= 0) return null;
    const playerTime = playerTimes[stream.id];
    if (!Number.isFinite(playerTime) || playerTime <= 0) return null;
    const utcMs = (startTime + playerTime) * 1000;
    return new Date(utcMs).toISOString().substring(11, 19) + ' UTC';
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const roleLabel = isHost ? 'Host control' : isSpectator ? 'Spectator view' : (hasControl ? 'Delegated control' : 'Participant view');
  const roleLabelClass = isHost
    ? 'text-pov-accent bg-pov-accent/10 border-pov-accent/20'
    : isSpectator
    ? 'text-pov-muted bg-pov-muted/10 border-pov-muted/20'
    : hasControl
    ? 'text-pov-success bg-pov-success/10 border-pov-success/20'
    : 'text-pov-muted bg-pov-muted/10 border-pov-muted/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="w-full max-w-none px-2.5 sm:px-4 py-3 sm:py-4"
    >
      {/* ══════════════════════════════════════════════════════════════════════
           SECTION 1 — Room Header (collapsible)
           ══════════════════════════════════════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: 'easeOut' }}
        className="glass-panel mb-2 sm:mb-3 rounded-2xl border border-white/10 px-3 py-2.5 sm:px-3.5 sm:py-3"
      >
        <div className="flex items-start justify-between gap-2.5">
          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${!isVod ? 'text-pov-success bg-pov-success/10 border-pov-success/20' : 'text-pov-warning bg-pov-warning/10 border-pov-warning/20'}`}>
                {isVod ? 'VOD session' : 'Live session'}
              </span>
              <span className={`text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${roleLabelClass}`}>
                {roleLabel}
              </span>
              <span className="text-[9px] sm:text-[10px] text-pov-muted font-mono">{visibleStreams.length} stream{visibleStreams.length !== 1 ? 's' : ''}</span>
            </div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-pov-text leading-tight">{session?.title || 'Live room'}</h1>
            <p className="mt-0.5 text-[11px] sm:text-xs leading-relaxed text-pov-muted">
              {isRoomHeaderCollapsed
                ? `${hostName} · ${visibleStreams.length} stream${visibleStreams.length !== 1 ? 's' : ''} · ${isVod ? 'VOD' : 'Live'}`
                : isHost
                ? `You're hosting. Everyone in the room follows your sync state.`
                : isSpectator
                ? `Watch along. Switch between any POV at any time.`
                : `${hostName} controls room sync. You can still focus on your own POV.`}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isHost && session?.status === 'live' && (
              <button onClick={handleEndSession} disabled={ending} className="text-[10px] sm:text-xs font-mono bg-pov-danger/10 border border-pov-danger/30 text-pov-danger hover:bg-pov-danger/20 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">{ending ? 'Ending...' : 'End'}</button>
            )}
            {!isHost && !isSpectator && session?.status === 'live' && (
              <button onClick={handleLeaveSession} disabled={leaving} className="text-[10px] sm:text-xs font-mono bg-pov-danger/10 border border-pov-danger/30 text-pov-danger hover:bg-pov-danger/20 rounded-lg px-2.5 py-1.5 transition-colors disabled:opacity-50">{leaving ? 'Leaving...' : 'Leave'}</button>
            )}
            <button
              type="button"
              onClick={() => setIsRoomHeaderCollapsed((c) => !c)}
              className="shrink-0 rounded-xl border border-pov-border bg-pov-bg px-2.5 py-1.5 text-[10px] sm:text-xs font-mono text-pov-text transition-colors hover:bg-pov-border/30"
            >
              {isRoomHeaderCollapsed ? '▾ Expand' : '▴ Collapse'}
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {!isRoomHeaderCollapsed && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              {/* Info pills */}
              <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <InfoPill label="Host" value={hostName} />
                <InfoPill label="State" value={isHost ? 'You manage sync' : isSpectator ? 'Read-only' : hasControl ? 'You can adjust sync' : 'Following host sync'} />
              </div>

              {/* Share link — opt-in reveal */}
              {session && !isVod && (
                <div className="mt-2.5">
                  {showSessionLinks ? (
                    <div className="space-y-2">
                      <LinkRow label="Invite link" url={`${window.location.origin}/room/${session.share_link}`} />
                      <button type="button" onClick={() => setShowSessionLinks(false)} className="text-[10px] font-mono text-pov-muted hover:text-pov-text transition-colors">Hide link ▴</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setShowSessionLinks(true)} className="text-[10px] sm:text-xs font-mono bg-pov-bg border border-pov-border text-pov-text hover:bg-pov-border/30 rounded px-3 py-1.5 transition-colors">
                      Show invite link
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ══════════════════════════════════════════════════════════════════════
           SECTION 2 — Viewer / Frames + Controls (desktop: side-by-side)
           ══════════════════════════════════════════════════════════════════════ */}
      <div className={isMobileLayout || isDesktopHorizontalPovStrip ? '' : 'flex gap-3 items-start'}>

      {/* ── Left column: Stage + Controls ────────────────────────────────────── */}
      <div className={isMobileLayout || isDesktopHorizontalPovStrip ? '' : 'flex-1 min-w-0'}>

      {/* Stage / Wall / Cycle */}
      <div className={`mb-2 sm:mb-3 ${isWallView ? '' : 'flex justify-center'}`}>
        <motion.div
          layout
          className={isWallView
            ? 'grid gap-2 sm:gap-3 mx-auto w-full justify-center'
            : 'glass-card aspect-video w-full border border-white/10 rounded-2xl overflow-hidden relative mx-auto'}
          style={isWallView
            ? {
                gridTemplateColumns: `repeat(${effectiveWallColumnCount}, minmax(0, 1fr))`,
                ...(effectiveWallGridMaxWidth ? { maxWidth: `${effectiveWallGridMaxWidth}px` } : {}),
              }
            : {
                width: isMobileLayout ? 'min(100%, calc((100vh - 360px) * 16 / 9))' : `min(100%, calc((100vh - ${desktopStageViewportOffset}px) * 16 / 9))`,
                maxHeight: isMobileLayout ? 'calc(100vh - 360px)' : `calc(100vh - ${desktopStageViewportOffset}px)`,
                minHeight: isCycleView ? (isMobileLayout ? '70vh' : 'min(78vh, 920px)') : '220px',
                height: isCycleView ? (isMobileLayout ? '70vh' : 'min(78vh, 920px)') : undefined,
                backgroundColor: isCycleView ? '#000000' : undefined,
              }}
          onMouseMove={isCycleView ? revealCycleUi : undefined}
          onClick={isCycleView ? revealCycleUi : undefined}
          onTouchStart={isCycleView ? ((e) => { cycleTouchStartRef.current = e.changedTouches[0]?.clientX ?? null; revealCycleUi(); }) : undefined}
          onTouchEnd={isCycleView ? ((e) => {
            const startX = cycleTouchStartRef.current;
            if (startX == null) return;
            const endX = e.changedTouches[0]?.clientX ?? startX;
            if (Math.abs(endX - startX) > 48) handleCycleStep(endX - startX < 0 ? 1 : -1);
            cycleTouchStartRef.current = null;
          }) : undefined}
        >
          {visibleStreams.length > 0 ? (
            visibleStreams.map((stream) => {
              const isActive = stream.id === mainStreamId;
              const stageWrapperClass = isWallView
                ? `relative aspect-video overflow-hidden rounded-2xl border-2 bg-black transition-all ${isActive ? 'border-pov-accent shadow-lg shadow-pov-accent/20' : 'border-pov-border hover:border-pov-muted'}`
                : `absolute inset-0 transition-opacity duration-200 ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`;

              return (
                <motion.div layout key={`stage-${stream.id}`} initial={false}
                  animate={{ opacity: isWallView ? 1 : (isActive ? 1 : 0), scale: isWallView ? 1 : (isActive ? 1 : (isCycleView ? 1.01 : 0.985)) }}
                  transition={{ duration: 0.22, ease: 'easeOut' }}
                  className={stageWrapperClass}
                >
                  <StreamPlayer
                    streamUrl={stream.youtube_url}
                    platform={stream.platform}
                    isMain={isActive}
                    qualityMode={qualityMode}
                    onReady={(player) => handlePlayerReady(stream.id, player)}
                    onStateChange={(state) => handleStageStateChange(stream.id, state)}
                    onError={(errorCode) => handleStageError(stream.id, errorCode)}
                    className="w-full h-full"
                  />

                  {isWallView ? (
                    <>
                      {!isActive && (
                        <button type="button" onClick={() => handleSwapStream(stream.id)} className="absolute inset-0 z-20" aria-label={`Focus ${stream.display_name}`} />
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 to-transparent px-3 py-2 pointer-events-none z-10">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-white truncate">{stream.display_name}</span>
                          <StatusIndicators stream={stream} isHost={stream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                        </div>
                      </div>
                      {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-pov-accent z-10" />}
                    </>
                  ) : !isCycleView && isActive ? (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 pointer-events-none z-10">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{stream.display_name}</span>
                        <StatusIndicators stream={stream} isHost={stream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                      </div>
                    </div>
                  ) : null}
                </motion.div>
              );
            })
          ) : (
            <div className={`${isWallView ? 'col-span-full h-40' : 'w-full h-full min-h-[220px]'} flex items-center justify-center`}>
              <div className="text-center">
                <p className="text-pov-muted text-sm">Waiting for streams to join...</p>
                {!isWallView && (
                  <div className="mt-3 flex gap-2 justify-center">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="w-3 h-3 bg-pov-border rounded-full animate-pulse" style={{ animationDelay: `${i * 150}ms` }} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Cycle view overlay */}
          {isCycleView && visibleStreams.length > 0 && (
            <>
              <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 via-black/20 to-transparent px-4 py-5 transition-opacity duration-200 ${cycleUiVisible ? 'opacity-100' : 'opacity-0'}`}>
                <div className="max-w-3xl">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/14 bg-black/25 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.18em] text-white/70 backdrop-blur-md">
                    <span>Current POV</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xl font-semibold text-white sm:text-3xl">{activeMainStream?.display_name || 'POV'}</span>
                    {activeMainStream && (
                      <StatusIndicators stream={activeMainStream} isHost={activeMainStream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && activeMainStream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                    )}
                  </div>
                </div>
              </div>
              <button type="button" onClick={() => handleCycleStep(-1)} onMouseEnter={revealCycleUi}
                className={`absolute left-3 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/14 bg-black/20 text-xl text-white shadow-lg backdrop-blur-md transition-opacity duration-200 sm:left-4 sm:h-14 sm:w-14 ${cycleUiVisible ? 'opacity-100' : 'opacity-0'}`}
                aria-label="Previous POV">←</button>
              <button type="button" onClick={() => handleCycleStep(1)} onMouseEnter={revealCycleUi}
                className={`absolute right-3 top-1/2 z-30 grid h-12 w-12 -translate-y-1/2 place-items-center rounded-full border border-white/14 bg-black/20 text-xl text-white shadow-lg backdrop-blur-md transition-opacity duration-200 sm:right-4 sm:h-14 sm:w-14 ${cycleUiVisible ? 'opacity-100' : 'opacity-0'}`}
                aria-label="Next POV">→</button>
              <CycleViewPicker streams={visibleStreams} activeStreamId={mainStreamId} infoStreamId={cycleInfoStream?.id ?? mainStreamId} visible={cycleUiVisible}
                onHoverStream={(id) => { setCycleHoverStreamId(id); revealCycleUi(); }}
                onLeave={() => setCycleHoverStreamId(mainStreamId)}
                onSelectStream={(id) => { handleSwapStream(id); setCycleHoverStreamId(id); revealCycleUi(); }}
              />
            </>
          )}
        </motion.div>
      </div>

      {/* Filmstrip — mobile: horizontal scroll below stage */}
      {isMobileLayout && (
      <div
        className={`${viewMode === 'stage' ? 'mb-2 pb-1' : 'hidden'} -mx-2.5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-2.5 pb-2`}
      >
        {visibleStreams.map((stream) => {
          const isActive = stream.id === mainStreamId;
          const isFinished = !isVod && stream.is_active === false;
          return (
            <div key={`film-wrap-${stream.id}`} className={`flex flex-col gap-1 ${isMobileLayout ? 'w-[210px] shrink-0 snap-start first:pl-0' : ''}`} style={isMobileLayout ? { width: `${effectiveFilmstripTileWidth}px` } : undefined}>
              <motion.button type="button" layout whileHover={isFinished ? {} : { y: -2, scale: 1.01 }} whileTap={isFinished ? {} : { scale: 0.985 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                onClick={isFinished && !isHost ? undefined : () => handleSwapStream(stream.id)}
                className={`group relative overflow-hidden rounded-2xl border text-left ${isActive ? 'border-pov-accent/70 shadow-[0_16px_50px_rgba(108,92,231,0.22)]' : 'border-white/8 hover:border-white/18'} glass-card ${isMobileLayout ? 'min-h-full' : ''} ${isFinished && !isHost ? 'cursor-default' : ''}`}
              >
                <div className="relative aspect-video overflow-hidden bg-black">
                  <div className="pointer-events-none absolute inset-0">
                    <StreamPlayer streamUrl={stream.youtube_url} platform={stream.platform} isMain={false}
                      qualityMode={qualityMode}
                      onReady={(player) => handlePlayerReady(`film-${stream.id}`, player)} className="h-full w-full" />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                  {stream.is_anchor && (
                    <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-white/80 backdrop-blur-md">Anchor</div>
                  )}
                  {isActive && !isFinished && <div className="absolute inset-x-0 top-0 h-0.5 bg-pov-accent shadow-[0_0_18px_rgba(108,92,231,0.6)]" />}
                  {isFinished && (
                    <FinishedStreamOverlay
                      isHost={isHost}
                      onReplay={() => handleReplayStream(stream.id)}
                      onReplace={() => handleReplaceStream(stream.id)}
                      onClear={() => handleClearStream(stream.id)}
                    />
                  )}
                </div>
                <div className="absolute inset-x-0 bottom-0 p-3 pointer-events-none">
                  <div className="glass-pill flex items-center justify-between gap-2 rounded-xl px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{stream.display_name}</p>
                      <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wide text-white/55">{isFinished ? 'Stream ended' : isActive ? 'On stage' : 'Tap to focus'}</p>
                      {(() => { const utc = getUtcTimeLabel(stream); return utc ? <p className="mt-0.5 text-[10px] font-mono tabular-nums text-white/45">{utc}</p> : null; })()}
                    </div>
                    <StatusIndicators stream={stream} isHost={stream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                  </div>
                </div>
              </motion.button>
            </div>
          );
        })}

        {canAddPov && renderAddPovTile('flex flex-col gap-1', 'relative aspect-video rounded-lg border-2 border-dashed border-pov-accent/50 overflow-hidden transition-all hover:border-pov-accent')}

        {visibleStreams.length === 0 && !canAddPov && (
          [...Array(4)].map((_, i) => (
            <div key={i} className="w-[210px] shrink-0 snap-start aspect-video rounded-lg border border-dashed border-pov-border bg-pov-surface/50 animate-pulse flex items-center justify-center">
              <span className="text-[10px] text-pov-muted/40 font-mono">POV {i + 1}</span>
            </div>
          ))
        )}
      </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           SECTION 3 — Controls (unified, all roles)
           ══════════════════════════════════════════════════════════════════════ */}
      {visibleStreams.length > 0 && (
        <div className="mt-2 space-y-2">

          {!isMobileLayout && viewMode === 'stage' && desktopPovStripLayout === 'horizontal' && visibleStreams.length > 0 && (
            <div className="rounded-2xl border border-pov-border bg-pov-surface p-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[10px] font-mono text-pov-muted uppercase tracking-wider">
                  POVs <span className="text-pov-muted/55 normal-case tracking-normal">{activeStreamCount}/{MAX_STREAMS_MVP}</span>
                </span>
                <span className="text-[10px] font-mono text-pov-muted/80">Horizontal strip</span>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {visibleStreams.map((stream) => {
                  const isActive = stream.id === mainStreamId;
                  const isFinished = !isVod && stream.is_active === false;
                  return (
                    <div key={`desktop-strip-${stream.id}`} className="w-[240px] shrink-0 flex flex-col gap-1">
                      <motion.button type="button" layout whileHover={isFinished ? {} : { y: -1, scale: 1.01 }} whileTap={isFinished ? {} : { scale: 0.985 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                        onClick={isFinished && !isHost ? undefined : () => handleSwapStream(stream.id)}
                        className={`group relative overflow-hidden rounded-xl border text-left ${isActive ? 'border-pov-accent/70 shadow-[0_8px_24px_rgba(108,92,231,0.18)]' : 'border-white/8 hover:border-white/18'} glass-card ${isFinished && !isHost ? 'cursor-default' : ''}`}
                      >
                        <div className="relative aspect-video overflow-hidden bg-black">
                          <div className="pointer-events-none absolute inset-0">
                            <StreamPlayer streamUrl={stream.youtube_url} platform={stream.platform} isMain={false}
                              qualityMode={qualityMode}
                              onReady={(player) => handlePlayerReady(`film-${stream.id}`, player)} className="h-full w-full" />
                          </div>
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                          {stream.is_anchor && (
                            <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/35 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-white/80 backdrop-blur-md">Anchor</div>
                          )}
                          {isActive && !isFinished && <div className="absolute inset-x-0 top-0 h-0.5 bg-pov-accent shadow-[0_0_18px_rgba(108,92,231,0.6)]" />}
                          {isFinished && (
                            <FinishedStreamOverlay
                              isHost={isHost}
                              onReplay={() => handleReplayStream(stream.id)}
                              onReplace={() => handleReplaceStream(stream.id)}
                              onClear={() => handleClearStream(stream.id)}
                            />
                          )}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-none">
                          <div className="glass-pill flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-[10px] font-semibold text-white">{stream.display_name}</p>
                              <p className="text-[8px] font-mono uppercase tracking-wide text-white/55">{isFinished ? 'Stream ended' : isActive ? 'On stage' : 'Click to focus'}</p>
                            </div>
                            <StatusIndicators stream={stream} isHost={stream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                          </div>
                        </div>
                      </motion.button>


                    </div>
                  );
                })}

                {canAddPov && renderAddPovTile('w-[240px] shrink-0 flex flex-col gap-1', 'relative aspect-video rounded-lg border-2 border-dashed border-pov-accent/50 overflow-hidden transition-all hover:border-pov-accent')}
              </div>
            </div>
          )}

          {/* ─ Playback bar ─ Primary actions ─────────────────────────────────── */}
          <div className={`bg-pov-surface border border-pov-border rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] ${isMobileLayout ? 'sticky bottom-3 z-20 backdrop-blur-xl shadow-[0_18px_50px_rgba(0,0,0,0.25)]' : ''}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* Left — View mode */}
              <div className="inline-flex rounded-lg border border-pov-border overflow-hidden shrink-0">
                {VIEW_MODE_OPTIONS.map((mode) => (
                  <button key={mode.id} type="button" onClick={() => setViewMode(mode.id)}
                    className={`text-[10px] sm:text-xs font-mono px-2.5 py-1.5 transition-colors border-r border-pov-border last:border-r-0 ${viewMode === mode.id ? 'bg-pov-accent/15 text-pov-accent' : 'bg-pov-bg text-pov-muted hover:text-pov-text hover:bg-pov-border/30'}`}>
                    {isMobileLayout ? mode.shortLabel : mode.label}
                  </button>
                ))}
              </div>

              {/* Center — Playback + Sync */}
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <button type="button" onClick={handlePlayAll}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-pov-accent/15 border border-pov-accent/30 text-pov-accent rounded-lg px-3.5 py-2 hover:bg-pov-accent/25 active:bg-pov-accent/35 transition-colors">
                  <span>Play All</span>
                </button>
                <button type="button" onClick={handlePauseAll}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-pov-bg border border-pov-border text-pov-text rounded-lg px-3.5 py-2 hover:bg-pov-border/40 active:bg-pov-accent/10 transition-colors">
                  <span>Pause All</span>
                </button>

                <span className="hidden sm:block w-px h-6 bg-pov-border/60 mx-1" />

                {!isVod && (
                  <button type="button" onClick={isHost || hasControl ? handleGoLive : handleGoLiveLocal}
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-pov-bg border border-pov-border text-pov-text rounded-lg px-3.5 py-2 hover:bg-pov-border/40 active:bg-pov-accent/10 transition-colors">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> Go Live
                  </button>
                )}
                <button type="button" onClick={isHost || hasControl ? handleSyncToUtc : handleResyncLocal}
                  className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium bg-pov-bg border border-pov-border text-pov-text rounded-lg px-3.5 py-2 hover:bg-pov-border/40 active:bg-pov-accent/10 transition-colors">
                  <span className="text-sm">↻</span> Re-sync
                </button>
              </div>

              {/* Right — Quality */}
              <div className="inline-flex rounded-lg border border-pov-border overflow-hidden shrink-0">
                {QUALITY_MODE_OPTIONS.map((option) => (
                  <button key={option.id} type="button" onClick={() => setQualityMode(option.id)}
                    title={option.title}
                    className={`text-[10px] sm:text-xs font-mono px-2.5 py-1.5 transition-colors border-r border-pov-border last:border-r-0 ${qualityMode === option.id ? 'bg-pov-accent/15 text-pov-accent' : 'bg-pov-bg text-pov-muted hover:text-pov-text hover:bg-pov-border/30'}`}>
                    {isMobileLayout ? option.shortLabel : option.label}
                  </button>
                ))}
              </div>
            </div>
            {isVod && <div className="text-center mt-1.5"><span className="text-[10px] text-pov-muted/60 font-mono">VOD — Scrub the anchor to move all POVs</span></div>}
          </div>

          {/* ─ Nudge + Preferences ─────────────────────────────────────────────── */}
          <div className="bg-pov-surface border border-pov-border rounded-2xl p-3 sm:p-4 shadow-[0_12px_40px_rgba(0,0,0,0.12)]">
            {mainStreamId && (
              <div className="mb-3">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <span className="text-[10px] sm:text-xs font-mono text-pov-muted uppercase tracking-wider">Nudge</span>
                  <span className="text-[10px] sm:text-xs font-mono text-pov-accent truncate max-w-[180px]">{visibleStreams.find((s) => s.id === mainStreamId)?.display_name || 'POV'}</span>
                </div>
                <PlaybackControls
                  title={null}
                  description={null}
                  activeLabel={null}
                  onStep={handleLocalPlaybackStep}
                  onGoLive={null}
                  onResync={null}
                  showLiveActions={false}
                  _inline
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-3 border-t border-pov-border/60 pt-3">
              {!isMobileLayout && (
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <span className="text-[10px] font-mono text-pov-muted uppercase tracking-wider whitespace-nowrap">Main view</span>
                  <input type="range" min={ROOM_TILE_MIN_WIDTH} max={ROOM_TILE_MAX_WIDTH} step="20" value={roomTileWidth} onChange={(e) => setRoomTileWidth(Number(e.target.value))}
                    className="w-28 accent-pov-accent" />
                  <span className="text-[10px] font-mono text-pov-muted whitespace-nowrap">{desktopFocusProgress > 0.66 ? 'Large' : desktopFocusProgress > 0.33 ? 'Balanced' : 'Compact'}</span>
                  {viewMode === 'stage' && (
                    <button
                      type="button"
                      onClick={() => setDesktopPovStripLayout((current) => current === 'vertical' ? 'horizontal' : 'vertical')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-pov-border bg-pov-bg px-2.5 py-1.5 text-[10px] font-mono text-pov-text transition-colors hover:bg-pov-border/30"
                      title={desktopPovStripLayout === 'vertical' ? 'Move POV frames into a horizontal strip below the main view' : 'Move POV frames into a vertical sidebar beside the main view'}
                    >
                      <span>POVs {desktopPovStripLayout === 'vertical' ? 'Horizontal' : 'Vertical'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>
      )}

      </div>{/* end left column */}

      {/* ── Right sidebar: POV filmstrip (desktop, stage view) ─────────────── */}
      {!isMobileLayout && viewMode === 'stage' && desktopPovStripLayout === 'vertical' && visibleStreams.length > 0 && (
        <div className="shrink-0 flex flex-col gap-2 max-h-[calc(100vh-160px)] overflow-y-auto pr-1 scrollbar-thin" style={{ width: `${desktopSidebarWidth}px` }}>
          <span className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-1">
            POVs <span className="text-pov-muted/55 normal-case tracking-normal">{activeStreamCount}/{MAX_STREAMS_MVP}</span>
          </span>
          {visibleStreams.map((stream) => {
            const isActive = stream.id === mainStreamId;
            const isFinished = !isVod && stream.is_active === false;
            return (
              <div key={`side-wrap-${stream.id}`} className="flex flex-col gap-1">
                <motion.button type="button" layout whileHover={isFinished ? {} : { y: -1, scale: 1.01 }} whileTap={isFinished ? {} : { scale: 0.985 }} transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                  onClick={isFinished && !isHost ? undefined : () => handleSwapStream(stream.id)}
                  className={`group relative overflow-hidden rounded-xl border text-left ${isActive ? 'border-pov-accent/70 shadow-[0_8px_24px_rgba(108,92,231,0.18)]' : 'border-white/8 hover:border-white/18'} glass-card ${isFinished && !isHost ? 'cursor-default' : ''}`}
                >
                  <div className="relative aspect-video overflow-hidden bg-black">
                    <div className="pointer-events-none absolute inset-0">
                      <StreamPlayer streamUrl={stream.youtube_url} platform={stream.platform} isMain={false}
                        qualityMode={qualityMode}
                        onReady={(player) => handlePlayerReady(`film-${stream.id}`, player)} className="h-full w-full" />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
                    {stream.is_anchor && (
                      <div className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/35 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-white/80 backdrop-blur-md">Anchor</div>
                    )}
                    {isActive && !isFinished && <div className="absolute inset-x-0 top-0 h-0.5 bg-pov-accent shadow-[0_0_18px_rgba(108,92,231,0.6)]" />}
                    {isFinished && (
                      <FinishedStreamOverlay
                        isHost={isHost}
                        onReplay={() => handleReplayStream(stream.id)}
                        onReplace={() => handleReplaceStream(stream.id)}
                        onClear={() => handleClearStream(stream.id)}
                      />
                    )}
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-2 pointer-events-none">
                    <div className="glass-pill flex items-center justify-between gap-1.5 rounded-lg px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-[10px] font-semibold text-white">{stream.display_name}</p>
                        <p className="text-[8px] font-mono uppercase tracking-wide text-white/55">{isFinished ? 'Stream ended' : isActive ? 'On stage' : 'Click to focus'}</p>
                      </div>
                      <StatusIndicators stream={stream} isHost={stream.user_id === session?.host_id} isControlDelegated={!!controlHolderUserId && stream.user_id === controlHolderUserId} showSyncStatus={!isVod} />
                    </div>
                  </div>
                </motion.button>


              </div>
            );
          })}

          {canAddPov && renderAddPovTile('flex flex-col gap-1', 'relative aspect-video rounded-lg border-2 border-dashed border-pov-accent/50 overflow-hidden transition-all hover:border-pov-accent')}
        </div>
      )}

      </div>{/* end desktop flex wrapper */}

      {/* ══════════════════════════════════════════════════════════════════════
           SECTION 4 — Host Controls (host-exclusive)
           Sync diagnostics, delegation, anchor recovery
           ══════════════════════════════════════════════════════════════════════ */}

      {/* Anchor dead banner */}
      {anchorDeadBanner && !isVod && (
        <AnchorDeadBanner
          streams={visibleStreams}
          onPromote={(streamId) => { handlePromoteAnchor(streamId); setAnchorDeadBanner(false); }}
          onDismiss={() => setAnchorDeadBanner(false)}
        />
      )}

      {/* Sync Status Panel (host, live) */}
      {isHost && !isVod && effectiveSyncStats && (
        <SyncStatusPanel
          streams={visibleStreams}
          syncStats={effectiveSyncStats}
          session={session}
          onApplyLatestBaseline={handleSyncToLatestStart}
          applyingLatestBaseline={applyingLatestBaseline}
          pendingLatestAnchorId={pendingLatestAnchorId}
        />
      )}

      {/* Control Delegation (host, live, multi-stream) */}
      {isHost && !isVod && visibleStreams.length > 1 && (
        <ControlDelegationPanel
          streams={visibleStreams}
          session={session}
          controlHolderUserId={controlHolderUserId}
          onDelegate={handleDelegateControl}
          onRevoke={handleRevokeControl}
        />
      )}

      {/* ── Add POV modal ─────────────────────────────────────────────────────── */}
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
        title={replacingStreamId ? 'Replace POV' : 'Add another POV'}
        submitLabel={replacingStreamId ? 'Replace POV' : undefined}
      />

      {/* ── Confirm / alert modal ─────────────────────────────────────────────── */}
      <ConfirmModal
        open={!!modal}
        title={modal?.title}
        message={modal?.message}
        confirmLabel={modal?.confirmLabel}
        variant={modal?.variant ?? 'confirm'}
        destructive={modal?.destructive ?? false}
        onConfirm={() => { const cb = modal?.onConfirm; setModal(null); cb?.(); }}
        onCancel={() => setModal(null)}
      />

      {/* ── Keyboard shortcuts overlay ────────────────────────────────────────── */}
      <AnimatePresence>
        {showShortcutsHelp && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowShortcutsHelp(false)}
          >
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }} transition={{ duration: 0.18, ease: 'easeOut' }}
              className="bg-pov-surface border border-pov-border rounded-2xl p-6 sm:p-8 max-w-sm w-full mx-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-lg font-bold text-pov-text mb-4">Keyboard Shortcuts</h2>
              <div className="space-y-2.5">
                {[['Space', 'Play / Pause all'], ['1 – 5', 'Switch POV'], ['← →', 'Cycle POV (cycle view)'], ['?', 'Toggle this help'], ['Esc', 'Close overlay']].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-4">
                    <kbd className="text-xs font-mono bg-pov-bg border border-pov-border rounded px-2 py-1 text-pov-accent min-w-[60px] text-center">{key}</kbd>
                    <span className="text-sm text-pov-muted">{desc}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setShowShortcutsHelp(false)} className="mt-6 w-full text-center text-xs font-mono text-pov-muted hover:text-pov-text transition-colors">Press ? or Esc to close</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
