/**
 * index.js — standalone Node server.
 *
 * Used for `npm run dev:server` and for any host that runs a long-lived Node
 * process. On Netlify the same Express app is served by
 * `netlify/functions/api.mjs` instead, and the static/OG concerns below are
 * handled by the CDN and `netlify/edge-functions/og-meta.js`.
 *
 * The API surface is identical in both cases — `createApp()` is the only
 * definition of it.
 */
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createApp } from './app.js';
import { loadServerEnv } from './lib/loadEnv.js';
import { supabaseAdmin } from './lib/supabase.js';
import { buildOgMetaTags, renderSessionOgMeta } from './lib/ogMeta.js';

loadServerEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createApp();
const PORT = process.env.PORT || 3002;
const clientDistPath = path.join(__dirname, '../../client/dist');
const indexHtmlPath = path.join(clientDistPath, 'index.html');

// Security headers for the HTML/asset responses this process serves itself.
// On Netlify these come from netlify.toml instead.
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();

  const extraAncestors = (process.env.ALLOWED_FRAME_ANCESTORS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const frameAncestors = ["'self'", ...extraAncestors].join(' ');

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://player.twitch.tv https://static.twitchcdn.net https://embed.twitch.tv",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.twitch.tv",
    "img-src 'self' data: https: blob:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "object-src 'none'",
    "base-uri 'self'",
    `frame-ancestors ${frameAncestors}`,
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Serve the built React frontend
app.use(express.static(clientDistPath));

// ── OpenGraph meta tags for share links ──────────────────────────────────────
// Social platforms fetch the raw HTML without running JS, so the per-session
// title/description has to be injected server-side.
async function serveWithOgMeta(req, res, next, linkColumn) {
  try {
    if (!fs.existsSync(indexHtmlPath)) return next(); // dev mode — no built HTML

    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id, title, status, streams!streams_session_id_fkey(display_name, is_active)')
      .eq(linkColumn, req.params.code)
      .single();

    if (!session) return next(); // fall through to the SPA

    const html = fs.readFileSync(indexHtmlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html');
    res.send(html.replace('</head>', `    ${buildOgMetaTags(renderSessionOgMeta(session))}\n  </head>`));
  } catch (err) {
    console.error('[OG] Error injecting meta tags:', err.message);
    next(); // fall through to the normal SPA response
  }
}

app.get('/watch/:code', (req, res, next) => serveWithOgMeta(req, res, next, 'spectator_link'));
app.get('/room/:code', (req, res, next) => serveWithOgMeta(req, res, next, 'share_link'));

// SPA fallback — any non-API route serves index.html so React Router handles it
app.get('*', (req, res) => {
  res.sendFile(indexHtmlPath);
});

const server = app.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

  server.close(() => {
    console.log('[Server] HTTP server closed — exiting');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
