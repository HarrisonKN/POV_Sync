import { SYNC_INDICATORS, ROLE_INDICATORS } from '../../../shared/constants.js';

/**
 * Status indicator cluster for a stream thumbnail.
 *
 * Props:
 *  - stream: stream object from DB
 *  - isHost: whether this stream belongs to the session host
 *  - isControlDelegated: whether control is delegated to this stream's user
 *  - syncStatus: 'synced' | 'syncing' | 'drifted' | 'waiting' | 'buffering'
 */
export default function StatusIndicators({
  stream,
  isHost = false,
  isControlDelegated = false,
  syncStatus = 'waiting',
}) {
  const indicators = [];

  // Platform indicator — show Twitch badge for non-YouTube streams
  if (stream.platform === 'twitch') {
    indicators.push({ key: 'platform', emoji: '🟣', label: 'Twitch' });
  }

  // Role indicators
  if (stream.is_anchor) {
    indicators.push({ key: 'anchor', ...ROLE_INDICATORS.anchor });
  }
  if (isHost) {
    indicators.push({ key: 'host', ...ROLE_INDICATORS.host });
  }
  if (isControlDelegated) {
    indicators.push({ key: 'control', ...ROLE_INDICATORS.control });
  }

  // Sync status — only show if not anchor (anchor is always reference)
  if (!stream.is_anchor && SYNC_INDICATORS[syncStatus]) {
    indicators.push({ key: 'sync', ...SYNC_INDICATORS[syncStatus] });
  }

  if (indicators.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {indicators.map((ind) => (
        <span
          key={ind.key}
          title={ind.label}
          className="text-xs leading-none cursor-default"
        >
          {ind.emoji}
        </span>
      ))}
    </div>
  );
}
