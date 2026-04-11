import { memo } from 'react';
import { extractYouTubeVideoId } from '../../../shared/helpers.js';

/**
 * Static YouTube thumbnail — no iframe, no playback, no postMessage spam.
 * Uses YouTube's thumbnail CDN (img.youtube.com) for a lightweight preview.
 *
 * Props:
 *  - youtubeUrl: full YouTube URL
 *  - quality: 'default' | 'mqdefault' | 'hqdefault' | 'sddefault' | 'maxresdefault'
 *  - className: wrapper classes
 */
function YouTubeThumbnail({ youtubeUrl, quality = 'mqdefault', className = '' }) {
  const videoId = extractYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    return (
      <div
        className={`flex items-center justify-center bg-pov-surface text-pov-muted text-xs font-mono ${className}`}
      >
        Invalid URL
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <img
        src={`https://img.youtube.com/vi/${videoId}/${quality}.jpg`}
        alt="Stream thumbnail"
        className="w-full h-full object-cover"
        loading="lazy"
        draggable={false}
      />
      {/* Subtle play icon overlay */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
          <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

export default memo(YouTubeThumbnail);
