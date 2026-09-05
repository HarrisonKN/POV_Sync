/**
 * Netlify Edge Function: per-session OpenGraph tags for share links.
 *
 * Link-preview crawlers fetch the raw HTML and never run the React app, so a
 * pure SPA would show the same generic card for every room. This runs at the
 * edge, lets the normal SPA response render, then splices the session's own
 * title/description into <head> before it goes out.
 *
 * Every failure path returns the untouched page — a missing session, a slow
 * Supabase, or an unset env var degrades to the site-wide default card rather
 * than to an error.
 */
import { buildOgMetaTags, renderSessionOgMeta } from '../../server/src/lib/ogMeta.js';

const LINK_COLUMN_BY_PREFIX = {
  watch: 'spectator_link',
  room: 'share_link',
};

const SUPABASE_TIMEOUT_MS = 1500;

async function fetchSession(supabaseUrl, anonKey, linkColumn, code) {
  const query = new URLSearchParams({
    select: 'id,title,status,streams!streams_session_id_fkey(display_name,is_active)',
    [linkColumn]: `eq.${code}`,
    limit: '1',
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/sessions?${query}`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
  });

  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] ?? null : null;
}

export default async function ogMeta(request, context) {
  const response = await context.next();

  try {
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response;
    }

    const [, prefix, rawCode] = new URL(request.url).pathname.split('/');
    const linkColumn = LINK_COLUMN_BY_PREFIX[prefix];
    const code = decodeURIComponent(rawCode || '');
    if (!linkColumn || !/^[A-Za-z0-9_-]{1,64}$/.test(code)) return response;

    const supabaseUrl = Netlify.env.get('SUPABASE_URL') || Netlify.env.get('VITE_SUPABASE_URL');
    const anonKey = Netlify.env.get('SUPABASE_ANON_KEY') || Netlify.env.get('VITE_SUPABASE_ANON_KEY');
    if (!supabaseUrl || !anonKey) return response;

    const session = await fetchSession(supabaseUrl.replace(/\/+$/, ''), anonKey, linkColumn, code);
    if (!session) return response;

    const html = await response.text();
    const tags = buildOgMetaTags(renderSessionOgMeta(session));

    // The body grew, so the inherited length/encoding headers no longer describe it.
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');

    return new Response(html.replace('</head>', `    ${tags}\n  </head>`), {
      status: response.status,
      headers,
    });
  } catch (err) {
    console.error('[og-meta] falling back to the default card:', err?.message ?? err);
    return response;
  }
}

export const config = {
  path: ['/watch/*', '/room/*'],
};
