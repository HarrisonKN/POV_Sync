/**
 * Extract YouTube video ID from various URL formats.
 * Supports: youtube.com/watch?v=, youtu.be/, youtube.com/live/, embed URLs
 * Returns null if no valid ID found.
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;

  const patterns = [
    // youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    // youtu.be/VIDEO_ID
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    // youtube.com/live/VIDEO_ID
    /(?:youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/,
    // youtube.com/embed/VIDEO_ID
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Extract Twitch channel name from various URL formats.
 * Supports: twitch.tv/<channel>, twitch.tv/<channel>/videos, player embed URLs
 * Returns null if no valid channel found.
 */
export function extractTwitchChannel(url) {
  if (!url) return null;

  const patterns = [
    // twitch.tv/channelname (must not be a special path)
    /(?:twitch\.tv\/)([a-zA-Z0-9_]{1,25})(?:\/|$|\?)/,
    // player.twitch.tv/?channel=<channel>
    /(?:player\.twitch\.tv\/\?.*channel=)([a-zA-Z0-9_]{1,25})/,
  ];

  // Special Twitch paths that are NOT channel names
  const reservedPaths = new Set([
    'directory', 'videos', 'settings', 'subscriptions', 'inventory',
    'wallet', 'friends', 'downloads', 'prime', 'turbo', 'products',
    'p', 'jobs', 'about', 'legal', 'privacy', 'terms',
  ]);

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const channel = match[1].toLowerCase();
      if (reservedPaths.has(channel)) continue;
      return channel;
    }
  }

  return null;
}

/**
 * Detect the streaming platform from a URL.
 * Returns 'youtube' | 'twitch' | null
 */
export function detectPlatform(url) {
  if (!url) return null;
  if (extractYouTubeVideoId(url)) return 'youtube';
  if (extractTwitchChannel(url)) return 'twitch';
  return null;
}

/**
 * Extract the platform-specific stream identifier from a URL.
 * Returns { platform, id } or null.
 *   YouTube → { platform: 'youtube', id: 'dQw4w9WgXcQ' }
 *   Twitch  → { platform: 'twitch', id: 'shroud' }
 */
export function extractStreamId(url) {
  if (!url) return null;

  const ytId = extractYouTubeVideoId(url);
  if (ytId) return { platform: 'youtube', id: ytId };

  const twitchChannel = extractTwitchChannel(url);
  if (twitchChannel) return { platform: 'twitch', id: twitchChannel };

  return null;
}

/**
 * Generate a cryptographically secure random code for session links.
 * e.g. "a3f9c2b1"
 *
 * Uses the Web Crypto API (globalThis.crypto.getRandomValues) which is
 * available in all modern browsers and Node.js 19+.
 */
export function generateLinkCode(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(length);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(arr);
  } else {
    // No Web Crypto available — refuse to generate weak codes
    throw new Error('crypto.getRandomValues is required but not available');
  }

  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(arr[i] % chars.length);
  }
  return result;
}
