/**
 * YouTube IFrame Player API helper.
 *
 * Loads the YouTube IFrame API script once, then provides a factory
 * to create player instances. Used by the Viewer components.
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

/**
 * Create a YouTube player instance in the given DOM element.
 *
 * @param {string} elementId — ID of the DOM element to replace with the player
 * @param {string} videoId — YouTube video ID
 * @param {object} opts — Optional overrides (width, height, playerVars, events)
 * @returns {YT.Player}
 */
export function createPlayer(elementId, videoId, opts = {}) {
  const {
    width = '100%',
    height = '100%',
    playerVars = {},
    events = {},
  } = opts;

  return new window.YT.Player(elementId, {
    videoId,
    width,
    height,
    playerVars: {
      autoplay: 1,
      controls: 0,
      modestbranding: 1,
      rel: 0,
      iv_load_policy: 3,  // hide annotations
      playsinline: 1,
      ...playerVars,
    },
    events,
  });
}
