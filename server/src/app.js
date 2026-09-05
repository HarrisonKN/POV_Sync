/**
 * app.js — Express application factory.
 *
 * Deliberately free of anything that assumes a long-lived process:
 *   - no `listen()`
 *   - no WebSocket server
 *   - no static file serving
 *   - no in-memory cross-request state that correctness depends on
 *
 * This lets the exact same app run in three places:
 *   1. `node server/src/index.js`      — local dev / any Node host
 *   2. `netlify/functions/api.mjs`     — Netlify Functions (via serverless-http)
 *   3. tests
 */
import express from 'express';
import cors from 'cors';
import sessionRoutes from './routes/sessions.js';
import feedbackRoutes from './routes/feedback.js';
import { loadServerEnv } from './lib/loadEnv.js';
import { createExpressRateLimit } from './lib/rateLimit.js';

loadServerEnv();

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3002',
  'http://127.0.0.1:3002',
  'http://localhost:8888',   // netlify dev
  'http://127.0.0.1:8888',
];

function buildAllowedOrigins() {
  const configured = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // Netlify injects URL (production) and DEPLOY_PRIME_URL (branch/deploy preview)
  const netlifyOrigins = [process.env.URL, process.env.DEPLOY_PRIME_URL].filter(Boolean);

  return new Set([...defaultOrigins, ...configured, ...netlifyOrigins]);
}

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // trust first proxy hop (Netlify / Cloudflare)

  const allowedOrigins = buildAllowedOrigins();

  function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    // Netlify deploy previews: https://deploy-preview-42--site-name.netlify.app
    if (process.env.NETLIFY && /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/i.test(origin)) {
      return true;
    }
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

  // Netlify rewrites /api/* to /.netlify/functions/api/:splat. Depending on how
  // the request arrives (rewrite vs. direct function URL vs. `netlify dev`) the
  // path may or may not still carry the function prefix. Normalise it so the
  // route table below only ever has to know about /api/*.
  app.use((req, _res, next) => {
    const prefix = '/.netlify/functions/api';
    if (req.url.startsWith(prefix)) {
      const rest = req.url.slice(prefix.length) || '/';
      req.url = rest.startsWith('/api') ? rest : `/api${rest === '/' ? '' : rest}`;
    }
    next();
  });

  // API responses are never cacheable and never framed.
  app.use('/api', (_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cache-Control', 'no-store');
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
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // API routes
  app.use('/api', apiRateLimit);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/feedback', feedbackRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  // Catch malformed JSON bodies — return consistent JSON error shape
  app.use((err, _req, res, next) => {
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON in request body' });
    }
    if (err?.message === 'Origin not allowed') {
      return res.status(403).json({ error: 'Origin not allowed' });
    }
    return next(err);
  });

  return app;
}

export default createApp;
