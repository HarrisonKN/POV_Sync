/**
 * YouTube IFrame Player API helper.
 *
 * Loads the YouTube IFrame API script once. Used by the YouTubePlayer component.
 */

let apiReady = false;
let apiPromise = null;

/**
 * Load the YouTube IFrame API script. Returns a promise that resolves
 * when the API is ready. Safe to call multiple times — only loads once.
 */
export function loadYouTubeAPI() {
  if (apiReady) return Promise.resolve();

  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    // The API calls this global function when ready
    window.onYouTubeIframeAPIReady = () => {
      apiReady = true;
      resolve();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  });

  return apiPromise;
}
