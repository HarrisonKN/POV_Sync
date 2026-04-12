import { memo } from 'react';
import YouTubePlayer from './YouTubePlayer';
import TwitchPlayer from './TwitchPlayer';
import { detectPlatform } from '../../../shared/helpers.js';

/**
 * Platform-aware stream player — renders YouTubePlayer or TwitchPlayer
 * based on the stream's platform (auto-detected from URL or explicit prop).
 *
 * Props:
 *  - streamUrl: the stream URL (YouTube or Twitch)
 *  - platform: optional explicit platform ('youtube' | 'twitch')
 *              If omitted, auto-detected from streamUrl
 *  - isMain: whether this player is the main stage (controls audio)
 *  - onReady: callback(playerAPI)
 *  - onStateChange: callback(state)
 *  - className: wrapper classes
 */
function StreamPlayer({
  streamUrl,
  platform: explicitPlatform,
  isMain = false,
  onReady,
  onStateChange,
  className = '',
}) {
  const platform = explicitPlatform || detectPlatform(streamUrl);

  if (platform === 'twitch') {
    return (
      <TwitchPlayer
        twitchUrl={streamUrl}
        isMain={isMain}
        onReady={onReady}
        onStateChange={onStateChange}
        className={className}
      />
    );
  }

  // Default: YouTube
  return (
    <YouTubePlayer
      youtubeUrl={streamUrl}
      isMain={isMain}
      onReady={onReady}
      onStateChange={onStateChange}
      className={className}
    />
  );
}

export default memo(StreamPlayer);
