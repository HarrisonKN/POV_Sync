import { useEffect, useRef, memo, useCallback } from 'react';
import { loadYouTubeAPI } from '../lib/youtube';
import { extractYouTubeVideoId } from '../../../shared/helpers.js';

/**
 * Persistent YouTube player — created once, never destroyed on swap.
 *
 * Props:
 *  - youtubeUrl: full YouTube URL
 *  - isMain: whether this player is currently the main stage (controls audio/controls)
 *  - onReady: callback(playerAPI) — returns a stable API object for imperative control
 *  - onStateChange: callback(state) — YT player state (PLAYING, PAUSED, etc.)
 *  - className: wrapper classes
 */
function YouTubePlayer({
  youtubeUrl,
  isMain = false,
  onReady,
  onStateChange,
  onError,
  className = '',
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const playerIdRef = useRef(`yt-player-${Math.random().toString(36).slice(2, 10)}`);
  const isMainRef = useRef(isMain);
  const onReadyRef = useRef(onReady);
  const onStateChangeRef = useRef(onStateChange);
  const onErrorRef = useRef(onError);

  // Keep callback refs current so event handlers always call the latest version
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onStateChangeRef.current = onStateChange; }, [onStateChange]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const videoId = extractYouTubeVideoId(youtubeUrl);

  // Keep isMain ref current without recreating the player
  useEffect(() => {
    isMainRef.current = isMain;
    const player = playerRef.current;
    if (!player || typeof player.isMuted !== 'function') return;

    try {
      if (isMain) {
        player.unMute();
        // Show controls by updating the iframe parameter isn't possible post-creation,
        // but we handle this by overlaying our own control bar or accepting YT's default.
      } else {
        player.mute();
      }
    } catch (_) {}
  }, [isMain]);

  useEffect(() => {
    if (!videoId) return;

    let destroyed = false;

    async function init() {
      await loadYouTubeAPI();
      if (destroyed) return;

      const container = containerRef.current;
      if (!container) return;

      // Clear any previous player
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }

      container.innerHTML = '';
      const el = document.createElement('div');
      el.id = playerIdRef.current;
      container.appendChild(el);

      playerRef.current = new window.YT.Player(playerIdRef.current, {
        videoId,
        width: '100%',
        height: '100%',
        playerVars: {
          autoplay: 1,
          controls: 1,       // Always render controls (CSS hides on filmstrip)
          modestbranding: 1,
          rel: 0,
          iv_load_policy: 3,
          playsinline: 1,
          mute: isMainRef.current ? 0 : 1,
        },
        events: {
          onReady: (event) => {
            if (destroyed) return;
            if (onReadyRef.current) onReadyRef.current(event.target);
          },
          onStateChange: (event) => {
            if (destroyed) return;
            if (onStateChangeRef.current) onStateChangeRef.current(event.data);
          },
          onError: (event) => {
            if (destroyed) return;
            if (onErrorRef.current) onErrorRef.current(event.data);
          },
        },
      });
    }

    init();

    return () => {
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch (_) {}
        playerRef.current = null;
      }
    };
  // Only recreate if the videoId changes — NOT on isMain or callback changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  if (!videoId) {
    return (
      <div className={`flex items-center justify-center bg-pov-surface text-pov-muted text-xs font-mono ${className}`}>
        Invalid YouTube URL
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`w-full h-full ${className}`}
    />
  );
}

export default memo(YouTubePlayer);
