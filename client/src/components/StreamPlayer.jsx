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
 *  - qualityMode: playback quality preference ('highest' | 'auto')
 *  - onReady: callback(playerAPI)
 *  - onStateChange: callback(state)
 *  - className: wrapper classes
 */
function StreamPlayer({
  streamUrl,
  platform: explicitPlatform,
  isMain = false,
  qualityMode = 'highest',
  onReady,
  onStateChange,
  onError,
  className = '',
}) {
  const platform = explicitPlatform || detectPlatform(streamUrl);

  if (platform === 'twitch') {
    return (
      <TwitchPlayer
        twitchUrl={streamUrl}
        isMain={isMain}
        qualityMode={qualityMode}
        onReady={onReady}
        onStateChange={onStateChange}
        onError={onError}
        className={className}
      />
    );
  }

  // Default: YouTube
  return (
    <YouTubePlayer
      youtubeUrl={streamUrl}
      isMain={isMain}
      qualityMode={qualityMode}
      onReady={onReady}
      onStateChange={onStateChange}
      onError={onError}
      className={className}
    />
  );
}

export default memo(StreamPlayer);
