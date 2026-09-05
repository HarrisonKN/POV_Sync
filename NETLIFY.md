# Deploying POV Sync to Netlify

## What changed, and why

Netlify serves static files and short-lived functions. It has **no WebSocket
support and no long-running processes**, so the previous backend could not be
lifted onto it as-is:

| Was | Now |
| --- | --- |
| `ws` server on `/ws` pushing `SYNC_OFFSETS` every 4s | Each client derives offsets locally from the `streams` rows it already receives over Supabase Realtime |
| `syncManager` — per-session start times in process memory | `streams.youtube_start_time` in Postgres (already persisted before; now it's the only source) |
| `controlState` Map — who holds the room controls | `sessions.control_delegate_id` column |
| `broadcastToSession()` for `SESSION_ENDED` / `STREAM_REMOVED` / `STREAM_UPDATED` / `ANCHOR_*` | The same facts are row changes on `sessions` / `streams`, which every client was already subscribed to |
| Express serving `client/dist` + SPA fallback | Netlify CDN + the `/*` → `/index.html` rewrite |
| Express injecting per-session OG tags | `netlify/edge-functions/og-meta.js` |
| Express API on a always-on port | `netlify/functions/api.mjs` (the same Express app via `serverless-http`) |

Two upshots worth knowing:

- **Delegation and sync state are now durable.** They used to be lost on every
  server restart or deploy; they now survive both, and a late joiner reads the
  current state off the row instead of waiting for the next broadcast.
- **Offsets are computed per client** rather than centrally. The formula is
  unchanged (`offset = streamStart − anchorStart`), and every client works from
  the same rows, so they agree.

## One-time setup

### 1. Run the database migration

In the Supabase SQL editor, run:

```
supabase/20260905_control_delegation.sql
```

This adds `sessions.control_delegate_id`. Everything else the app needs is
already in place — including Realtime on `public.sessions` and `public.streams`,
which this design now depends on. Confirm with `supabase/verify.sql` if you want
to check the whole schema.

### 2. Create the Netlify site

Point Netlify at this repo. `netlify.toml` already declares the build command,
publish directory, functions directory, redirects, and headers — leave the UI
fields blank so they don't override it.

### 3. Set environment variables

Site configuration → Environment variables. All of these must be available at
**build** time (the `VITE_*` ones get inlined into the bundle):

| Variable | Required | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Used by the function and the edge function |
| `SUPABASE_ANON_KEY` | yes | |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Function only — never exposed to the browser |
| `VITE_SUPABASE_URL` | yes | Inlined into the client bundle |
| `VITE_SUPABASE_ANON_KEY` | yes | Inlined into the client bundle |
| `YOUTUBE_API_KEY` | no | Without it, start times fall back to client-computed values |
| `VITE_SITE_URL` | no | Only for a custom domain; otherwise Netlify's `URL` is used |
| `CORS_ORIGINS` | no | Extra API origins; Netlify's own URLs are allowed automatically |

### 4. Update Supabase auth URLs

Authentication → URL Configuration: set the Site URL to your Netlify URL and add
`https://<your-site>.netlify.app/**` to the redirect allowlist. Add the
deploy-preview pattern too if you use previews.

## Local development

```bash
npm install          # installs all three workspaces
npm run dev          # Vite on :5173 + Express on :3002
```

`npm run dev` still uses the standalone Node server, which serves the identical
Express app. To exercise the real Netlify pipeline — function, edge function,
redirects and headers included:

```bash
npm run dev:netlify  # netlify dev, on :8888
```

## Things to know

- **The 21 MB `purplebackground.mp4`** ships in the bundle. It uploads and
  serves fine, but it's the single biggest thing on the site and the `.webm`
  next to it is 1.7 MB. Worth revisiting if load time matters.
- **Rate limiting is best-effort.** `server/src/lib/rateLimit.js` counts in
  process memory, and each function instance has its own. Limits still blunt a
  single-client flood but no longer apply globally. Supabase RLS remains the
  actual authorization boundary. If you need real limits, move the counters into
  Postgres or a Netlify-compatible KV.
- **Function timeout is 10s** on the free tier. The routes that call the YouTube
  API (`/`, `/:id/streams`, `/:id/backfill-start-times`) now await those lookups
  instead of firing them off after the response — serverless freezes the
  container the moment a response is sent, so background work silently never
  ran. Each lookup is capped by `YOUTUBE_LOOKUP_TIMEOUT_MS` (3.5s default).
- **Deploying elsewhere still works.** `server/src/index.js` runs the same app on
  any Node host; nothing in this migration is Netlify-only except `netlify.toml`
  and the `netlify/` directory.
