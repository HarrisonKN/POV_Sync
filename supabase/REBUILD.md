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
   - **Authorized JavaScript origins:**
     ```
     http://localhost:5173
     https://pov-sync.onrender.com
     ```
   - **Authorized redirect URIs** — this must be your *Supabase* callback,
     not your app URL. Copy it from Supabase (Step 3b shows it), it looks like:
     ```
     https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback
     ```
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
  https://pov-sync.onrender.com
  ```
  (use `http://localhost:5173` if you're only running locally for now)

- **Redirect URLs** — add all of these. The app passes deep links as
  `redirectTo` (e.g. `/room/:code`), so wildcards are required:
  ```
  http://localhost:5173
  http://localhost:5173/**
  https://pov-sync.onrender.com
  https://pov-sync.onrender.com/**
  ```

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
# CORS_ORIGINS=https://pov-sync.onrender.com
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

### If deployed on Render

Update the same variables in the Render dashboard → your service → **Environment**,
then redeploy. The static site needs `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
set **at build time**.

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

---

## What is NOT in Supabase (nothing to restore)

- **No storage buckets.** Avatars come straight from the Google `picture` claim as a URL.
- **No edge functions.** All server logic is the Express app in [server/src/](../server/src/).
- **No database webhooks or cron jobs.**
- **No secrets stored in Supabase Vault.**

So the SQL in Step 2 plus the auth config in Step 3 is genuinely the whole backend.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Missing VITE_SUPABASE_URL...` thrown at startup | `client/.env` not updated, or Vite not restarted | Update it and restart `npm run dev` — Vite only reads env at boot |
| Login redirects to `localhost:3000` or the site root instead of your deep link | Redirect URL not allow-listed | Add the `/**` wildcard entries in Step 3c |
| `redirect_uri_mismatch` from Google | Google's redirect URI must be the **Supabase** `/auth/v1/callback`, not your app | Fix in Google Cloud Console (Step 3a) |
| Signed in, but the app shows no profile | Signup trigger missing | Re-run `rebuild.sql`; §5 backfills existing auth users |
| `new row violates row-level security policy` | Server used the anon key where it needs the user's JWT, or key is wrong | Confirm all three keys in `server/.env` are from the new project |
| `Could not find a relationship ... streams_session_id_fkey` | FK named differently | Re-run `rebuild.sql` — the app's embedded selects depend on that exact constraint name |
| Participants don't appear until refresh | Realtime publication missing | Re-run `rebuild.sql` §4, or Dashboard → Database → Publications → enable `streams` + `sessions` |

---

## File reference

| File | Purpose |
|---|---|
| [rebuild.sql](rebuild.sql) | **Use this.** Complete, idempotent, one-shot rebuild. |
| [verify.sql](verify.sql) | 8 post-rebuild sanity checks. |
| `schema.sql`, `2026*.sql` | Historical — superseded by `rebuild.sql`. Don't run. |
