import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import sessionRoutes from './routes/sessions.js';
import feedbackRoutes from './routes/feedback.js';
import { setupWebSocket } from './websocket/index.js';
import { stopAllSessions } from './services/syncManager.js';
import { loadServerEnv } from './lib/loadEnv.js';
import { supabaseAdmin } from './lib/supabase.js';
import { createExpressRateLimit } from './lib/rateLimit.js';

loadServerEnv();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // trust first proxy hop (Render / Cloudflare)
const PORT = process.env.PORT || 3002;

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
];

const configuredOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  ...defaultOrigins,
  ...configuredOrigins,
]);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }
  return false;
}

const apiRateLimit = createExpressRateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_RATE_LIMIT_MAX || 120),
  keyPrefix: 'api-global',
  keyGenerator: (req) => req.ip || 'unknown',
  message: 'Too many requests',
});

// Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://www.youtube.com https://player.twitch.tv https://static.twitchcdn.net",
    "style-src 'self' 'unsafe-inline'",
    "frame-src https://www.youtube.com https://player.twitch.tv",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co wss: ws:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(cors({
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origin not allowed'));
  },
}));
app.use(express.json({ limit: '16kb' }));

// Health check — exempt from rate limiting (monitoring services)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api', apiRateLimit);
app.use('/api/sessions', sessionRoutes);
app.use('/api/feedback', feedbackRoutes);

// Catch malformed JSON bodies — return consistent JSON error shape
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  next(err);
});

// In production, serve the built React frontend
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// ── OpenGraph meta tags for spectator links ──────────────────────────────────
// Social platforms / link previews fetch the raw HTML (no JS), so we inject
// og:title / og:description into the served index.html for /watch/:code routes.
app.get('/watch/:code', async (req, res, next) => {
  try {
    const htmlPath = path.join(clientDistPath, 'index.html');
    if (!fs.existsSync(htmlPath)) return next(); // dev mode — no built HTML

    const { code } = req.params;
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id, title, status, streams!streams_session_id_fkey(display_name)')
      .eq('spectator_link', code)
      .single();

    if (!session) return next(); // fall through to SPA

    const streamNames = (session.streams || []).map((s) => s.display_name).filter(Boolean).join(', ');
    const ogTitle = session.title || `POV Sync — ${session.status === 'live' ? 'Live' : 'VOD'} Session`;
    const ogDesc = streamNames
      ? `Watch ${streamNames} in multi-POV sync`
      : `A ${session.status === 'live' ? 'live' : 'saved'} multi-POV session on POV Sync`;

    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = fs.readFileSync(htmlPath, 'utf-8');
    const metaTags = [
      `<meta property="og:title" content="${escHtml(ogTitle)}" />`,
      `<meta property="og:description" content="${escHtml(ogDesc)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${escHtml(ogTitle)}" />`,
      `<meta name="twitter:description" content="${escHtml(ogDesc)}" />`,
    ].join('\n    ');

    html = html.replace('</head>', `    ${metaTags}\n  </head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[OG] Error injecting meta tags:', err.message);
    next(); // fall through to normal SPA on error
  }
});

// ── OpenGraph meta tags for universal share links (/room/:code) ─────────────
app.get('/room/:code', async (req, res, next) => {
  try {
    const htmlPath = path.join(clientDistPath, 'index.html');
    if (!fs.existsSync(htmlPath)) return next();

    const { code } = req.params;
    const { data: session } = await supabaseAdmin
      .from('sessions')
      .select('id, title, status, streams!streams_session_id_fkey(display_name, is_active)')
      .eq('share_link', code)
      .single();

    if (!session) return next();

    const activeNames = (session.streams || [])
      .filter((s) => s.is_active !== false)
      .map((s) => s.display_name)
      .filter(Boolean)
      .join(', ');

    const ogTitle = session.title || `POV Sync — ${session.status === 'live' ? 'Live' : 'VOD'} Session`;
    const ogDesc = activeNames
      ? `Join ${activeNames} watching in multi-POV sync`
      : `A ${session.status === 'live' ? 'live' : 'saved'} multi-POV session on POV Sync`;

    const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    let html = fs.readFileSync(htmlPath, 'utf-8');
    const metaTags = [
      `<meta property="og:title" content="${escHtml(ogTitle)}" />`,
      `<meta property="og:description" content="${escHtml(ogDesc)}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary" />`,
      `<meta name="twitter:title" content="${escHtml(ogTitle)}" />`,
      `<meta name="twitter:description" content="${escHtml(ogDesc)}" />`,
    ].join('\n    ');

    html = html.replace('</head>', `    ${metaTags}\n  </head>`);
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error('[OG] Error injecting meta tags for /room/:code:', err.message);
    next();
  }
});

// SPA fallback — any non-API route serves index.html so React Router handles it
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(clientDistPath, 'index.html'));
});

// Create HTTP server and attach WebSocket
const server = createServer(app);
const wss = setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

  // 1. Stop accepting new connections
  server.close(() => {
    console.log('[Server] HTTP server closed — exiting');
    process.exit(0);
  });

  // 2. Close all WebSocket connections
  if (wss) {
    for (const client of wss.clients) {
      client.close(1001, 'server shutting down');
    }
    wss.close(() => {
      console.log('[Server] WebSocket server closed');
    });
  }

  // 3. Clean up all sync sessions (clear intervals, free memory)
  stopAllSessions();

  // 4. Force exit after 5s if something hangs
  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
