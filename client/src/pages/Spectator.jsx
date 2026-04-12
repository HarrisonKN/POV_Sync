import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import StreamPlayer from '../components/StreamPlayer';
import StatusIndicators from '../components/StatusIndicators';
import ErrorState from '../components/ErrorState';
import SessionRoomHeader from '../components/SessionRoomHeader';

export default function Spectator() {
  const { code } = useParams();
  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [mainStreamId, setMainStreamId] = useState(null);
  const [viewMode, setViewMode] = useState('stage');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncStats, setSyncStats] = useState(null);
  // Saved offsets from DB — applied on VOD load
  const [offsets, setOffsets] = useState({});
  const visibleStreams = useMemo(() => (
    session?.status === 'ended'
      ? streams
      : streams.filter((s) => s.is_active !== false)
  ), [session?.status, streams]);
  const hostStream = visibleStreams.find((s) => s.user_id === session?.host_id);
  const hostName = hostStream?.display_name ?? hostStream?.users?.display_name ?? 'Host';

  // Player refs and sync state (same pattern as Viewer)
  const playerRefs = useRef({});
  const isPlayingRef = useRef(true);
  const syncingRef = useRef(false);
  const wsRef = useRef(null);

  // Fetch session on mount
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/watch/${code}`);
        if (!res.ok) throw new Error('Session not found');
        const data = await res.json();
        setSession(data.session);
        const fetchedStreams = data.session.streams || [];
        setStreams(fetchedStreams);

        // Store saved offsets for VOD seek-to-start
        const offsetMap = {};
        fetchedStreams.forEach((s) => { offsetMap[s.id] = s.offset_seconds ?? 0; });
        setOffsets(offsetMap);

        const anchor = fetchedStreams.find((s) => s.is_anchor);
        setMainStreamId(anchor?.id || fetchedStreams[0]?.id || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [code]);

  // Subscribe to realtime stream changes so spectators see new joiners live
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`spectator-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'streams',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setStreams((prev) => {
              if (prev.some((s) => s.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
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
          filter: `id=eq.${session.id}`,
        },
        (payload) => {
          setSession(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Auto-select first stream when they arrive
  useEffect(() => {
    if (!mainStreamId && visibleStreams.length > 0) {
      const anchor = visibleStreams.find((s) => s.is_anchor);
      setMainStreamId(anchor?.id || visibleStreams[0]?.id);
    }
  }, [visibleStreams, mainStreamId]);

  // Read-only live sync: spectators receive room offsets and status updates
  // without sending control messages back to the server.
  useEffect(() => {
    if (!session?.id) return;

    let active = true;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = import.meta.env.VITE_WS_URL || `${wsProtocol}//${window.location.hostname}:3002`;
    const ws = new WebSocket(`${wsHost}/ws?sessionId=${session.id}&role=spectator`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'SYNC_OFFSETS') {
          setSyncStats({
            offsets: msg.offsets || {},
            confidence: msg.confidence || {},
            startTimesAvailable: msg.startTimesAvailable || {},
            anchorStreamId: msg.anchorStreamId ?? null,
            timestamp: msg.timestamp ?? null,
          });

          setOffsets((prev) => ({
            ...prev,
            ...(msg.offsets || {}),
          }));
        }

        if (msg.type === 'ANCHOR_REMOVED') {
          setSyncStats((prev) => ({ ...(prev || {}), anchorRemoved: true }));
        }
      } catch (err) {
        console.error('[WS] Spectator message parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WS] Spectator error:', err);
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (active) {
        console.log('[WS] Spectator disconnected');
      }
    };

    return () => {
      active = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [session?.id]);

  // Keep refs to current values so callbacks stay stable (must be above early returns)
  const streamsRef = useRef(streams);
  useEffect(() => { streamsRef.current = visibleStreams; }, [visibleStreams]);

  const offsetsRef = useRef(offsets);
  useEffect(() => { offsetsRef.current = offsets; }, [offsets]);

  const sessionRef = useRef(session);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const readyCountRef = useRef(0);

  // Store player ref when ready; for VODs, seek to aligned start once all ready
  const handlePlayerReady = useCallback((streamId, player) => {
    playerRefs.current[streamId] = player;

    const isFilm = typeof streamId === 'string' && streamId.startsWith('film-');
    if (isFilm) return;
    if (sessionRef.current?.status !== 'ended') return;

    readyCountRef.current += 1;
    const total = streamsRef.current.length;
    if (readyCountRef.current < total) return;

    const anchor = streamsRef.current.find((s) => s.is_anchor);
    if (!anchor) return;
    streamsRef.current.forEach((stream) => {
      const offset = offsetsRef.current[stream.id] ?? 0;
      const target = Math.max(0, -offset);
      try { playerRefs.current[stream.id]?.seekTo(target, true); } catch (_) {}
      try { playerRefs.current[`film-${stream.id}`]?.seekTo(target, true); } catch (_) {}
    });
  }, []);

  // Anchor plays/pauses → sync everyone.
  // Non-anchor plays/pauses → sync only its own filmstrip mirror.
  const handleStageStateChange = useCallback((streamId, state) => {
    if (syncingRef.current) return;
    const YT = window.YT;
    if (!YT) return;
    if (state !== YT.PlayerState.PAUSED && state !== YT.PlayerState.PLAYING) return;

    const playing = state === YT.PlayerState.PLAYING;
    const isAnchor = streamsRef.current.find((s) => s.id === streamId)?.is_anchor ?? false;

    syncingRef.current = true;

    if (isAnchor) {
      isPlayingRef.current = playing;
      Object.entries(playerRefs.current).forEach(([id, player]) => {
        if (id === streamId) return;
        try { playing ? player.playVideo() : player.pauseVideo(); } catch (_) {}
      });
    } else {
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

  // ── Early returns (all hooks are declared above) ────────────────────────────

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
        title="Spectator room"
        session={session}
        hostLabel={hostName}
        roleLabel="Read-only view"
        roleTone="spectator"
        statusLabel={session?.status === 'live' ? 'Live session' : 'VOD session'}
        statusTone={session?.status === 'live' ? 'live' : 'vod'}
        secondaryLabel={session?.status === 'live' ? 'Watching the live room in read-only mode' : 'Watching the saved VOD session'}
        className="mb-3 sm:mb-4"
      />

      {/* Spectator header */}
      <div className="flex items-center gap-2 mb-3 sm:mb-4">
        <span className="text-[10px] sm:text-xs font-mono bg-pov-surface border border-pov-border rounded px-2 py-1 text-pov-muted">
          👁 Spectator
        </span>
        <span
          className={`text-xs font-mono px-2 py-1 rounded border ${
            session?.status === 'live'
              ? 'bg-pov-success/10 border-pov-success/30 text-pov-success'
              : 'bg-pov-muted/10 border-pov-muted/30 text-pov-muted'
          }`}
        >
          {session?.status === 'live' ? '● LIVE' : '📼 VOD'}
        </span>
        <span className="text-xs text-pov-muted font-mono">
          {visibleStreams.length} stream{visibleStreams.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={() => setViewMode((mode) => (mode === 'stage' ? 'wall' : 'stage'))}
          className="ml-auto text-[10px] sm:text-xs font-mono bg-pov-surface border border-pov-border rounded px-2 py-1 text-pov-muted hover:text-pov-accent hover:border-pov-accent transition-colors"
        >
          {viewMode === 'stage' ? 'Wall view' : 'Stage view'}
        </button>
      </div>

      {session?.status === 'live' && syncStats && (
        <div className="mb-3 sm:mb-4 bg-pov-surface border border-pov-border rounded-lg px-3 sm:px-4 py-2 sm:py-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs font-mono text-pov-muted">
          <span className="text-pov-accent">Read-only live sync</span>
          <span className="hidden sm:inline text-pov-border">|</span>
          <span>
            {Object.values(syncStats.startTimesAvailable || {}).filter(Boolean).length}/{visibleStreams.length} start times
          </span>
          {syncStats.timestamp && (
            <span className="hidden sm:inline text-pov-muted/60">
              updated {Math.max(0, Math.round((Date.now() - syncStats.timestamp) / 1000))}s ago
            </span>
          )}
        </div>
      )}

      {viewMode === 'wall' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3 mb-2 sm:mb-3">
          {visibleStreams.length > 0 ? (
            visibleStreams.map((stream) => {
              const isActive = stream.id === mainStreamId;
              return (
                <button
                  key={`wall-${stream.id}`}
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
                      />
                    </div>
                  </div>
                  {isActive && <div className="absolute top-0 left-0 right-0 h-0.5 bg-pov-accent" />}
                </button>
              );
            })
          ) : (
            <div className="col-span-full w-full h-40 flex items-center justify-center rounded-lg border border-dashed border-pov-border bg-pov-surface/50">
              <p className="text-pov-muted text-sm">Waiting for streams to join...</p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Main Stage — all players stacked, only selected visible */}
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

          {/* Filmstrip — live mini-players, click to swap */}
          <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:overflow-x-auto pb-2">
            {visibleStreams.length > 0 ? (
              visibleStreams.map((stream) => {
                const isActive = stream.id === mainStreamId;
                return (
                  <button
                    key={`film-${stream.id}`}
                    onClick={() => handleSwapStream(stream.id)}
                    className={`w-full sm:flex-shrink-0 sm:w-48 rounded-lg border-2 transition-all overflow-hidden relative group ${
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
                        />
                      </div>
                    </div>
                    {isActive && (
                      <div className="absolute top-0 left-0 right-0 h-0.5 bg-pov-accent" />
                    )}
                  </button>
                );
              })
            ) : (
              [...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="flex-shrink-0 w-48 aspect-video rounded-lg border border-dashed border-pov-border bg-pov-surface/50 animate-pulse flex items-center justify-center"
                >
                  <span className="text-[10px] text-pov-muted/40 font-mono">POV {i + 1}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
