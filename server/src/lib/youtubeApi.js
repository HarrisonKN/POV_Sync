/**
 * YouTube Data API v3 helpers.
 *
 * Requires YOUTUBE_API_KEY in the server environment.
 * If the key is missing or the request fails, functions return null so
 * callers can fall back to synthetic (client-computed) values.
 */

/**
 * Extract the YouTube video ID from a URL.
 * Handles:
 *   https://www.youtube.com/watch?v=VIDEO_ID
 *   https://youtu.be/VIDEO_ID
 *   https://www.youtube.com/live/VIDEO_ID
 *   https://www.youtube.com/shorts/VIDEO_ID
 * Returns the 11-char video ID string, or null.
 */
export function extractVideoId(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    const u = new URL(url);
    // youtu.be short link
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null;
    }
    // /watch?v=
    const v = u.searchParams.get('v');
    if (v) return v;
    // /live/ID  or  /shorts/ID
    const match = u.pathname.match(/\/(live|shorts|embed)\/([^/?&]+)/);
    if (match) return match[2];
  } catch (_) { /* invalid URL */ }
  return null;
}

/**
 * Fetch the authoritative UTC start time for a YouTube livestream/VOD.
 *
 * Uses: GET https://www.googleapis.com/youtube/v3/videos
 *         ?part=liveStreamingDetails&id=VIDEO_ID&key=API_KEY
 *
 * Returns Unix epoch seconds (number), or null if:
 *   - YOUTUBE_API_KEY env var is not set
 *   - The video is not a livestream (no liveStreamingDetails)
 *   - The API request fails
 */
export async function fetchActualStartTime(youtubeUrl) {
  const details = await fetchLiveStreamingDetails(youtubeUrl);
  return details?.actualStartTime ?? null;
}

/**
 * Fetch full liveStreamingDetails for a YouTube video.
 * Returns { actualStartTime, actualEndTime } where each value is unix epoch
 * seconds or null. Returns null if API key is missing, the video isn't a
 * livestream, or the request fails.
 *
 * Used by /auto-inactive to verify a host-reported "stream ended" against
 * YouTube's authoritative state — prevents transient embed errors from
 * archiving a still-live broadcast.
 */
export async function fetchLiveStreamingDetails(youtubeUrl) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return null;

  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) return null;

  try {
    const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${videoId}&key=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.warn(`[YouTubeAPI] videos.list HTTP ${res.status} for ${videoId}`);
      return null;
    }
    const data = await res.json();
    const details = data?.items?.[0]?.liveStreamingDetails;
    if (!details) return null;

    const toEpoch = (iso) => {
      if (!iso) return null;
      const ms = Date.parse(iso);
      if (!Number.isFinite(ms) || ms <= 0) return null;
      return Math.floor(ms / 1000);
    };

    return {
      actualStartTime: toEpoch(details.actualStartTime),
      actualEndTime: toEpoch(details.actualEndTime),
    };
  } catch (err) {
    console.warn(`[YouTubeAPI] Failed to fetch liveStreamingDetails for ${videoId}:`, err.message);
    return null;
  }
}
