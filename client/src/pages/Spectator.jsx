import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import YouTubePlayer from '../components/YouTubePlayer';
import StatusIndicators from '../components/StatusIndicators';
import ErrorState from '../components/ErrorState';

export default function Spectator() {
  const { code } = useParams();
  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [mainStreamId, setMainStreamId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Saved offsets from DB — applied on VOD load
  const [offsets, setOffsets] = useState({});

  // Player refs and sync state (same pattern as Viewer)
  const playerRefs = useRef({});
  const isPlayingRef = useRef(true);
  const syncingRef = useRef(false);

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
    if (!mainStreamId && streams.length > 0) {
      const anchor = streams.find((s) => s.is_anchor);
      setMainStreamId(anchor?.id || streams[0]?.id);
    }
  }, [streams, mainStreamId]);

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

  // Keep a ref to streams so callbacks stay stable
  const streamsRef = useRef(streams);
  useEffect(() => { streamsRef.current = streams; }, [streams]);

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

  return (
    <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
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
          {streams.length} stream{streams.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Main Stage — all players stacked, only selected visible */}
      <div className="aspect-video bg-black border border-pov-border rounded-lg mb-2 sm:mb-3 overflow-hidden relative">
        {streams.length > 0 ? (
          streams.map((stream) => (
            <div
              key={`stage-${stream.id}`}
              className={`absolute inset-0 transition-opacity duration-200 ${
                stream.id === mainStreamId ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
              }`}
            >
              <YouTubePlayer
                youtubeUrl={stream.youtube_url}
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
        {streams.length > 0 ? (
          streams.map((stream) => {
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
                  <YouTubePlayer
                    youtubeUrl={stream.youtube_url}
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
    </div>
  );
}
