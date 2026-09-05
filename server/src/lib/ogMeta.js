/**
 * ogMeta.js — build the per-session OpenGraph/Twitter tags for share links.
 *
 * Kept free of Node built-ins and of any Supabase import so the Deno-based
 * Netlify edge function can import this exact file and produce byte-identical
 * markup to the standalone Node server.
 */

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {{ title?: string, status?: string, streams?: Array<{display_name?: string, is_active?: boolean}> }} session
 * @returns {{ title: string, description: string }}
 */
export function renderSessionOgMeta(session) {
  const isLive = session?.status === 'live';

  // A stream row without `is_active` selected (the /watch query omits it) must
  // still count, so only an explicit `false` excludes one.
  const names = (session?.streams || [])
    .filter((stream) => stream.is_active !== false)
    .map((stream) => stream.display_name)
    .filter(Boolean)
    .join(', ');

  return {
    title: session?.title || `POV Sync — ${isLive ? 'Live' : 'VOD'} Session`,
    description: names
      ? `Watch ${names} in multi-POV sync`
      : `A ${isLive ? 'live' : 'saved'} multi-POV session on POV Sync`,
  };
}

/**
 * Render the tags as an HTML fragment ready to splice in before `</head>`.
 * The base template already carries site-wide og:* tags; these come later in
 * the document and therefore win for the crawlers that take the last value.
 */
export function buildOgMetaTags({ title, description }) {
  const t = escapeHtml(title);
  const d = escapeHtml(description);

  return [
    `<meta property="og:title" content="${t}" />`,
    `<meta property="og:description" content="${d}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${t}" />`,
    `<meta name="twitter:description" content="${d}" />`,
  ].join('\n    ');
}
