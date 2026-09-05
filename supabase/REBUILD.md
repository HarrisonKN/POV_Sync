# POV Sync — Supabase Rebuild Guide

Everything needed to recreate the deleted Supabase project from scratch.
Total time: ~15 minutes. Follow in order.

---

## Step 1 — Create the project

1. Go to https://supabase.com/dashboard → **New project**
2. Fill in:
   - **Name:** `pov-sync`
   - **Database password:** generate one and save it in your password manager
   - **Region:** pick the one closest to your users (the privacy page says EU/US — `East US` or `West EU` both match)
   - **Plan:** Free is fine
3. Wait ~2 minutes for provisioning.

---

## Step 2 — Run the schema

1. Dashboard → **SQL Editor** → **New query**
2. Open [supabase/rebuild.sql](rebuild.sql), copy the **entire** file, paste, **Run**.
3. Expect `Success. No rows returned.`

This creates all 5 tables, all indexes and constraints, all 14 RLS policies,
the `handle_new_user` signup trigger, and adds `streams` + `sessions` to the
realtime publication. It is idempotent — safe to run again.

> `rebuild.sql` replaces `schema.sql` **and** every `2026*.sql` migration.
> Do not run the old files as well; they are kept only for history.

### Already have a project?

`rebuild.sql` is idempotent, so re-running the current version is the simplest
way to pick up later changes — including `sessions.control_delegate_id`, which
the Netlify migration added. If you'd rather apply just that one change, run
[20260905_control_delegation.sql](20260905_control_delegation.sql) instead.
Either is sufficient; don't do both.

### Verify it worked

New query → paste [supabase/verify.sql](verify.sql) → Run.
All 8 checks must return `OK`. If any says MISSING, re-run `rebuild.sql`.

---

## Step 3 — Enable Google sign-in

The app only uses **Google OAuth** (`signInWithOAuth({ provider: 'google' })` in
[client/src/hooks/useAuth.jsx](../client/src/hooks/useAuth.jsx#L90)). No email/password, no other providers.

### 3a. Google Cloud Console

1. https://console.cloud.google.com → select or create a project
2. **APIs & Services → OAuth consent screen**
   - User type: **External** → Create
   - App name: `POV Sync`, support email: your email
   - Scopes: the defaults (`email`, `profile`, `openid`) are all that's needed
   - Publish the app (or add yourself as a test user while testing)
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `POV Sync Supabase`
   - **Authorized JavaScript origins:** leave empty. `signInWithOAuth` does a
     top-level redirect to Supabase, which then redirects to Google — the
     browser never calls Google from your origin, so this field does not apply.
     (Filling it in is harmless, just unnecessary.)
   - **Authorized redirect URIs** — the one field that matters. It must be your
     *Supabase* callback, **including the `/auth/v1/callback` path** — not your
     app URL, and not the bare Supabase origin:
     ```
     https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback
     ```
     Copy it verbatim from Supabase → Authentication → Sign In / Providers →
     Google, where it's shown as **Callback URL (for OAuth)**. Pasting just
     `https://<ref>.supabase.co` produces `redirect_uri_mismatch` on every
     sign-in, and a stale `<ref>` from a previous Supabase project does the same.
   - Create → copy the **Client ID** and **Client secret**

### 3b. Supabase

1. Dashboard → **Authentication → Sign In / Providers → Google**
2. Toggle **Enable Sign in with Google**
3. Paste the **Client ID** and **Client Secret** from 3a
4. Copy the **Callback URL (for OAuth)** shown there back into Google's
   Authorized redirect URIs if you haven't already → **Save**

### 3c. URL configuration

Dashboard → **Authentication → URL Configuration**

- **Site URL:**
  ```
  https://<your-site>.netlify.app
  ```
  (use `http://localhost:5173` if you're only running locally for now)

- **Redirect URLs** — add all of these. The app passes deep links as
  `redirectTo` ([RoleSelect.jsx](../client/src/pages/RoleSelect.jsx#L113) sends
  `/room/:code`), so the wildcards are required, and the bare origins are needed
  because `signInWithGoogle()` otherwise passes `window.location.origin` with no
  trailing slash:
  ```
  https://<your-site>.netlify.app
  https://<your-site>.netlify.app/**
  http://localhost:5173
  http://localhost:5173/**
  http://localhost:8888
  http://localhost:8888/**
  ```
  The `localhost` entries are what make `npm run dev` (5173) and
  `npm run dev:netlify` (8888) able to sign in — production URLs alone are not
  enough. Add `https://deploy-preview-*--<your-site>.netlify.app/**` too if you
  sign in from Netlify deploy previews.

  Leave the Site URL without a trailing slash so it matches the origin the app
  sends.

Save.

---

## Step 4 — Copy the API keys

Dashboard → **Project Settings → API Keys**

You need three values:

| Value | Where to find it | Used by |
|---|---|---|
| Project URL | Settings → **Data API** → Project URL | client + server |
| `anon` / publishable key | Settings → API Keys | client + server |
| `service_role` / secret key | Settings → API Keys → reveal | **server only** |

> New projects show `sb_publishable_…` / `sb_secret_…` keys. This project runs
> `@supabase/supabase-js` v2.49, which works with either format. If you prefer
> the old JWT-style keys, they're under the **Legacy API keys** tab — either is fine,
> just be consistent.

⚠️ The `service_role` / secret key bypasses RLS. It goes in server env only —
never in `client/.env`, never committed.

---

## Step 5 — Update your env files

Three files reference the old dead project (`pqxbpqpcvkxfwdszbilf`). Replace all of them.

> How the server resolves env ([server/src/lib/loadEnv.js](../server/src/lib/loadEnv.js)):
> it loads `server/.env`, `server/.env.local`, then the root `.env` — **first value wins**.
> So a stale key left in `server/.env` will silently shadow a corrected one in the root `.env`.
> Update both.

**`.env`** (repo root)
```env
# Server
SUPABASE_URL=https://<YOUR-PROJECT-REF>.supabase.co
SUPABASE_ANON_KEY=<your anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<your service_role / secret key>
PORT=3002
YOUTUBE_API_KEY=<keep your existing YouTube Data API v3 key>
```

**`server/.env`**
```env
# Server
SUPABASE_URL=https://<YOUR-PROJECT-REF>.supabase.co
SUPABASE_ANON_KEY=<your anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<your service_role / secret key>
PORT=3002
YOUTUBE_API_KEY=<keep your existing YouTube Data API v3 key>

# Optional (production)
# CORS_ORIGINS=https://<your-site>.netlify.app
# ALLOWED_FRAME_ANCESTORS=
# API_RATE_LIMIT_MAX=120
```

**`client/.env`**
```env
# Client
VITE_SUPABASE_URL=https://<YOUR-PROJECT-REF>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon / publishable key>
```

> The client gets the anon/publishable key **only** — it's exposed in the browser
> bundle, which is safe precisely because RLS is on.

### If deployed on Netlify

Set the same variables in Site configuration → **Environment variables**, then
trigger a redeploy. Note that `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are
inlined into the bundle, so they must be present at **build** time — changing
them requires a rebuild, not just a restart. See [NETLIFY.md](../NETLIFY.md) for
the full variable list.

---

## Step 6 — Run and smoke-test

```powershell
npm run dev
```

Then walk through this checklist at http://localhost:5173:

1. **Sign in with Google** → redirects back signed in.
2. Run in SQL Editor: `SELECT id, email, display_name, avatar_url FROM public.users;`
   → your row exists. *If empty, the Step 2 trigger didn't install — re-run `rebuild.sql`.*
3. **Create a session** with a YouTube stream URL → lands in the session room.
   → `SELECT id, share_link, status FROM public.sessions;` shows a row with a
   non-null `share_link`.
4. Open the **share link** (`/room/<code>`) in a private window → role picker appears.
5. **Join as a participant** from a second account → the first window shows the
   new POV appear without a refresh. *That confirms realtime works (Step 2 §4).*
6. **End the session** → status flips to `ended`.
7. Submit the **feedback modal** → `SELECT * FROM public.feedback_submissions;` shows it.
   *(Message must be 10–1000 chars and contain no `<` or `>` — that's a CHECK constraint.)*
8. With two accounts in a live room, **delegate controls** from the host to the
   participant → the participant's window gains the controls without a refresh,
   and `SELECT id, control_delegate_id FROM public.sessions;` shows their user id.
   *That confirms realtime on `sessions` works — the app relies on it for
   delegation now that there is no WebSocket.*

---

## What is NOT in Supabase (nothing to restore)

- **No storage buckets.** Avatars come straight from the Google `picture` claim as a URL.
- **No edge functions.** All server logic is the Express app in [server/src/](../server/src/),
  served either by `server/src/index.js` or by the Netlify function that wraps it.
  (`netlify/edge-functions/og-meta.js` runs on Netlify, not on Supabase.)
- **No database webhooks or cron jobs.**
- **No secrets stored in Supabase Vault.**

So the SQL in Step 2 plus the auth config in Step 3 is genuinely the whole backend.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Missing VITE_SUPABASE_URL...` thrown at startup | `client/.env` not updated, or Vite not restarted | Update it and restart `npm run dev` — Vite only reads env at boot |
| Login redirects to `localhost:3000` or the site root instead of your deep link | Redirect URL not allow-listed | Add the `/**` wildcard entries in Step 3c |
| `redirect_uri_mismatch` from Google | Google's redirect URI is missing the `/auth/v1/callback` path, points at your app instead of Supabase, or carries a `<ref>` from an old Supabase project | Copy the callback verbatim from Supabase → Authentication → Sign In / Providers → Google into Google Cloud Console (Step 3a) |
| Sign-in works in production but not on `localhost` | `http://localhost:5173/**` missing from the redirect allowlist | Add the localhost entries in Step 3c |
| Signed in, but the app shows no profile | Signup trigger missing | Re-run `rebuild.sql`; §5 backfills existing auth users |
| `new row violates row-level security policy` | Server used the anon key where it needs the user's JWT, or key is wrong | Confirm all three keys in `server/.env` are from the new project |
| `Could not find a relationship ... streams_session_id_fkey` | FK named differently | Re-run `rebuild.sql` — the app's embedded selects depend on that exact constraint name |
| Participants don't appear until refresh | Realtime publication missing | Re-run `rebuild.sql` §4, or Dashboard → Database → Publications → enable `streams` + `sessions` |
| Delegated controls never reach the participant | `sessions` missing from the realtime publication, or `control_delegate_id` column missing | Re-run `rebuild.sql`; confirm with checks 2 and 8 of `verify.sql` |

---

## File reference

| File | Purpose |
|---|---|
| [rebuild.sql](rebuild.sql) | **Use this.** Complete, idempotent, one-shot rebuild. |
| [verify.sql](verify.sql) | 8 post-rebuild sanity checks. |
| `schema.sql`, `2026*.sql` | Historical — superseded by `rebuild.sql`. Don't run. |
