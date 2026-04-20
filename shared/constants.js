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
  synced:    { emoji: 'Synced', label: 'Synced' },
  syncing:   { emoji: 'Syncing', label: 'Syncing' },
  drifted:   { emoji: 'Drifted', label: 'Drifted' },
  waiting:   { emoji: 'Waiting', label: 'Waiting' },
  buffering: { emoji: 'Buffering', label: 'Buffering' },
};

// Role indicators
export const ROLE_INDICATORS = {
  anchor: { emoji: 'Anchor', label: 'Anchor' },
  host:   { emoji: 'Host', label: 'Host' },
  control:{ emoji: 'Control', label: 'Control' },
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
