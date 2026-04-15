// Session status values
export const SESSION_STATUS = {
  LIVE: 'live',
  ENDED: 'ended',
};

// Stream platform identifiers
export const PLATFORM = {
  YOUTUBE: 'youtube',
  TWITCH: 'twitch',
};

// Sync status indicators
export const SYNC_STATUS = {
  SYNCED: 'synced',
  SYNCING: 'syncing',
  DRIFTED: 'drifted',
  WAITING: 'waiting',
  BUFFERING: 'buffering',
};

// Sync status display config
export const SYNC_INDICATORS = {
  synced:    { emoji: '🟢', label: 'Synced' },
  syncing:   { emoji: '🟡', label: 'Syncing' },
  drifted:   { emoji: '🔴', label: 'Drifted' },
  waiting:   { emoji: '⚪', label: 'Waiting' },
  buffering: { emoji: '🔵', label: 'Buffering' },
};

// Role indicators
export const ROLE_INDICATORS = {
  anchor: { emoji: '⚓', label: 'Anchor' },
  host:   { emoji: '👑', label: 'Host' },
  control:{ emoji: '🎮', label: 'Control' },
};

// Offset step sizes in seconds
export const OFFSET_STEPS = {
  FRAME: 1 / 60,     // ~0.0167s
  FINE: 1,            // 1s
  MEDIUM: 5,          // 5s
};

// Limits
export const MAX_STREAMS_MVP = 5;
export const MAX_STREAMS_ARCH = 10;

// Drift threshold in seconds — beyond this, auto-correction kicks in
export const DRIFT_THRESHOLD = 2;
