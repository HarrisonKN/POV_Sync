import { useEffect, useRef, memo } from 'react';
import { extractTwitchChannel } from '../../../shared/helpers.js';

/**
 * Load the Twitch Embed API script once. Returns a promise that resolves
 * when Twitch.Player is available globally. Safe to call multiple times.
 */
let twitchApiReady = false;
let twitchApiPromise = null;

function loadTwitchAPI() {
  if (twitchApiReady && window.Twitch?.Player) return Promise.resolve();

  if (twitchApiPromise) return twitchApiPromise;

  twitchApiPromise = new Promise((resolve) => {
    // If already loaded (e.g. from a previous mount)
    if (window.Twitch?.Player) {
      twitchApiReady = true;
      resolve();
      return;
    }

    const tag = document.createElement('script');
    tag.src = 'https://player.twitch.tv/js/embed/v1.js';
    tag.onload = () => {
      twitchApiReady = true;
      resolve();
    };
    tag.onerror = () => {
      twitchApiPromise = null; // allow retry
      resolve(); // resolve anyway to avoid hanging
    };
    document.head.appendChild(tag);
  });

  return twitchApiPromise;
}

/**
 * Persistent Twitch player — embeds a live Twitch channel.
 *
 * Props:
 *  - twitchUrl: full Twitch URL (e.g. https://twitch.tv/shroud)
 *  - isMain: whether this player is the main stage (controls audio)
 *  - onReady: callback(playerAPI) — returns a lightweight API shim
 *  - onStateChange: callback(state) — not fully supported by Twitch embed
 *  - className: wrapper classes
 *
 * NOTE: Twitch embeds don't expose the same granular API as YouTube.
 * For sync purposes, Twitch live streams are inherently real-time so
 * drift correction is minimal. The onReady callback receives a shim
 * object with play/pause/mute/unmute for compatibility with the
 * existing player ref interface.
 */
function TwitchPlayer({
  twitchUrl,
  isMain = false,
  onReady,
  onStateChange,
  className = '',
}) {
  const containerRef = useRef(null);
  const playerRef = useRef(null);
  const isMainRef = useRef(isMain);

  const channel = extractTwitchChannel(twitchUrl);

  // Keep isMain ref current and toggle mute
  useEffect(() => {
    isMainRef.current = isMain;
    const player = playerRef.current;
    if (!player) return;

    try {
      if (isMain) {
        player.setMuted(false);
      } else {
        player.setMuted(true);
      }
    } catch (_) {}
  }, [isMain]);

  useEffect(() => {
    if (!channel) return;

    let destroyed = false;

    async function init() {
      await loadTwitchAPI();
      if (destroyed) return;

      const container = containerRef.current;
      if (!container) return;

      // Clear previous
      if (playerRef.current) {
        try { playerRef.current = null; } catch (_) {}
      }
      container.innerHTML = '';

      const el = document.createElement('div');
      el.id = `twitch-player-${Math.random().toString(36).slice(2, 10)}`;
      // Force the wrapper div to fill the container so the iframe stretches
      el.style.cssText = 'width:100%;height:100%;';
      container.appendChild(el);

      if (!window.Twitch?.Player) {
        console.error('[TwitchPlayer] Twitch.Player not available');
        return;
      }

      const player = new window.Twitch.Player(el.id, {
        channel,
        width: '100%',
        height: '100%',
        muted: !isMainRef.current,
        autoplay: true,
        parent: [window.location.hostname],
      });

      playerRef.current = player;

      // Helper: force all children + iframes inside the embed div to fill 100%
      const stretchEmbedChildren = () => {
        if (destroyed) return;
        const iframe = el.querySelector('iframe');
        if (iframe) {
          iframe.style.cssText = 'width:100%!important;height:100%!important;position:absolute!important;top:0!important;left:0!important;';
        }
        for (const child of el.children) {
          child.style.cssText = 'width:100%!important;height:100%!important;position:relative!important;';
        }
      };

      // The Twitch SDK injects its own wrapper div + iframe. Force them to
      // fill the container so the player isn't a tiny 400×300 box.
      requestAnimationFrame(stretchEmbedChildren);

      // Also watch for late-injected iframes (the SDK can be async)
      const observer = new MutationObserver(stretchEmbedChildren);
      observer.observe(el, { childList: true, subtree: true });

      // Create a shim API compatible with the YouTubePlayer ref interface
      const apiShim = {
        // Twitch players are always live — getCurrentTime isn't meaningful
        // but we provide a stub for compatibility
        getCurrentTime: () => {
          try {
            return player.getCurrentTime?.() ?? 0;
          } catch (_) {
            return 0;
          }
        },
        getDuration: () => {
          try {
            return player.getDuration?.() ?? 0;
          } catch (_) {
            return 0;
          }
        },
        seekTo: (seconds, allowSeekAhead) => {
          try {
            player.seek?.(seconds);
          } catch (_) {}
        },
        playVideo: () => {
          try { player.play(); } catch (_) {}
        },
        pauseVideo: () => {
          try { player.pause(); } catch (_) {}
        },
        mute: () => {
          try { player.setMuted(true); } catch (_) {}
        },
        unMute: () => {
          try { player.setMuted(false); } catch (_) {}
        },
        isMuted: () => {
          try { return player.getMuted?.() ?? true; } catch (_) { return true; }
        },
        // Flag to identify this as a Twitch player
        _isTwitch: true,
      };

      player.addEventListener(window.Twitch.Player.READY, () => {
        if (destroyed) return;
        stretchEmbedChildren(); // re-apply sizing once iframe is guaranteed present
        try {
          if (!isMainRef.current) {
            player.setMuted(true);
          }
          player.play();
        } catch (_) {}
        if (onReady) onReady(apiShim);
      });

      // Map Twitch events to YouTube-like state values for consistency
      player.addEventListener(window.Twitch.Player.PLAYING, () => {
        if (destroyed) return;
        if (onStateChange) onStateChange(1); // YT.PlayerState.PLAYING = 1
      });

      player.addEventListener(window.Twitch.Player.PAUSE, () => {
        if (destroyed) return;
        if (onStateChange) onStateChange(2); // YT.PlayerState.PAUSED = 2
      });

      return observer;
    }

    let observer = null;

    init().then((obs) => { observer = obs; });

    return () => {
      destroyed = true;
      playerRef.current = null;
      if (observer) observer.disconnect();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);

  if (!channel) {
    return (
      <div className={`flex items-center justify-center bg-pov-surface text-pov-muted text-xs font-mono ${className}`}>
        Invalid Twitch URL
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

export default memo(TwitchPlayer);
