import { memo } from 'react';
import { motion } from 'motion/react';
import YouTubeThumbnail from './YouTubeThumbnail';
import StatusIndicators from './StatusIndicators';
import { detectPlatform, extractTwitchChannel } from '../../../shared/helpers.js';

function TwitchPreview({ streamUrl }) {
  const channel = extractTwitchChannel(streamUrl);

  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#6c5ce7]/30 via-[#201e2a] to-[#00d296]/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_45%)]" />
      <div className="relative z-10 text-center">
        <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-lg backdrop-blur-md">
          🟣
        </div>
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-white/60">Twitch</p>
        <p className="mt-1 text-sm font-semibold text-white">{channel || 'Live channel'}</p>
      </div>
    </div>
  );
}

function StreamPreviewCard({
  stream,
  isActive = false,
  onClick,
  isHost = false,
  isControlDelegated = false,
  label = null,
  className = '',
}) {
  const platform = stream.platform || detectPlatform(stream.youtube_url);

  return (
    <motion.button
      type="button"
      layout
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      onClick={onClick}
      className={`group relative overflow-hidden rounded-2xl border text-left ${
        isActive
          ? 'border-pov-accent/70 shadow-[0_16px_50px_rgba(108,92,231,0.22)]'
          : 'border-white/8 hover:border-white/18'
      } glass-card ${className}`}
    >
      <div className="relative aspect-video overflow-hidden">
        {platform === 'twitch' ? (
          <TwitchPreview streamUrl={stream.youtube_url} />
        ) : (
          <YouTubeThumbnail youtubeUrl={stream.youtube_url} quality="hqdefault" className="h-full w-full" />
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />

        {label && (
          <div className="absolute left-3 top-3 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[10px] font-mono uppercase tracking-wide text-white/80 backdrop-blur-md">
            {label}
          </div>
        )}

        {isActive && <div className="absolute inset-x-0 top-0 h-0.5 bg-pov-accent shadow-[0_0_18px_rgba(108,92,231,0.6)]" />}
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="glass-pill flex items-center justify-between gap-2 rounded-xl px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{stream.display_name}</p>
            <p className="mt-0.5 text-[10px] font-mono uppercase tracking-wide text-white/55">
              {isActive ? 'On stage' : 'Tap to focus'}
            </p>
          </div>
          <StatusIndicators
            stream={stream}
            isHost={isHost}
            isControlDelegated={isControlDelegated}
          />
        </div>
      </div>
    </motion.button>
  );
}

export default memo(StreamPreviewCard);