-- ============================================================
-- POV Sync — FULL DATABASE REBUILD
-- Paste this whole file into: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent). Consolidates schema.sql + every migration through 2026-04-23.
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABLES
-- ------------------------------------------------------------

-- 1a. users — mirrors auth.users with app-specific profile fields
CREATE TABLE IF NOT EXISTS public.users (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url   text,
  created_at   timestamptz DEFAULT now()
);

-- 1b. follows — social graph
CREATE TABLE IF NOT EXISTS public.follows (
  follower_id  uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx  ON public.follows (follower_id, created_at DESC);

-- 1c. feedback_submissions
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email         text,
  display_name  text,
  feedback_type text NOT NULL,
  message       text NOT NULL,
  page_path     text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx ON public.feedback_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_type_idx       ON public.feedback_submissions (feedback_type, created_at DESC);

ALTER TABLE public.feedback_submissions
  DROP CONSTRAINT IF EXISTS feedback_submissions_feedback_type_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_message_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_type_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_message_length_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_email_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_display_name_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_page_path_check,
  DROP CONSTRAINT IF EXISTS feedback_submissions_user_agent_check;

ALTER TABLE public.feedback_submissions
  ADD CONSTRAINT feedback_submissions_type_check
    CHECK (feedback_type IN ('suggestion', 'bug', 'general')),
  ADD CONSTRAINT feedback_submissions_message_length_check
    CHECK (char_length(trim(message)) BETWEEN 10 AND 1000
           AND position('<' in message) = 0 AND position('>' in message) = 0),
  ADD CONSTRAINT feedback_submissions_email_check
    CHECK (email IS NULL OR (char_length(email) <= 254
           AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')),
  ADD CONSTRAINT feedback_submissions_display_name_check
    CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 80
           AND position('<' in display_name) = 0 AND position('>' in display_name) = 0)),
  ADD CONSTRAINT feedback_submissions_page_path_check
    CHECK (page_path IS NULL OR (char_length(page_path) <= 200
           AND page_path ~ '^/[A-Za-z0-9/_?&=+#.%:-]*$')),
  ADD CONSTRAINT feedback_submissions_user_agent_check
    CHECK (user_agent IS NULL OR char_length(user_agent) <= 512);

-- 1d. sessions
CREATE TABLE IF NOT EXISTS public.sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          uuid NOT NULL REFERENCES public.users(id),
  participant_link text UNIQUE NOT NULL,
  spectator_link   text UNIQUE NOT NULL,
  share_link       text,          -- universal /room/:code invite code (NOT NULL enforced below)
  title            text,
  status           text CHECK (status IN ('live', 'ended')) DEFAULT 'live',
  anchor_stream_id uuid,          -- FK added after streams exists
  created_at       timestamptz DEFAULT now(),
  ended_at         timestamptz,
  vod_ready_at     timestamptz,   -- set once final VOD offsets are computed
  control_delegate_id uuid REFERENCES public.users(id) ON DELETE SET NULL
                                 -- participant currently holding the room controls
);

-- Columns added by later migrations (no-ops on a fresh build)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS vod_ready_at timestamptz,
  ADD COLUMN IF NOT EXISTS title        text,
  ADD COLUMN IF NOT EXISTS share_link   text,
  ADD COLUMN IF NOT EXISTS control_delegate_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

UPDATE public.sessions
SET share_link = substring(md5(random()::text || id::text), 1, 10)
WHERE share_link IS NULL;

ALTER TABLE public.sessions ALTER COLUMN share_link SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_share_link_idx ON public.sessions (share_link);

-- 1e. streams
CREATE TABLE IF NOT EXISTS public.streams (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id         uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id            uuid NOT NULL REFERENCES public.users(id),
  display_name       text NOT NULL,
  youtube_url        text NOT NULL,          -- YouTube watch URL or Twitch channel URL
  platform           text DEFAULT 'youtube', -- 'youtube' | 'twitch'
  offset_seconds     float DEFAULT 0,
  is_anchor          boolean DEFAULT false,
  youtube_start_time float,                  -- unix seconds from YT IFrame getVideoStartTime()
  is_active          boolean DEFAULT true,
  joined_at          timestamptz DEFAULT now(),
  left_at            timestamptz
);

ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS platform  text DEFAULT 'youtube',
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS left_at   timestamptz;

UPDATE public.streams SET is_active = true WHERE is_active IS NULL;

COMMENT ON COLUMN public.streams.platform    IS 'Streaming platform: youtube or twitch';
COMMENT ON COLUMN public.streams.youtube_url IS 'Stream URL — YouTube watch URL or Twitch channel URL';

CREATE INDEX IF NOT EXISTS streams_session_id_idx ON public.streams (session_id);
CREATE INDEX IF NOT EXISTS streams_user_id_idx    ON public.streams (user_id);

-- 1f. deferred FK: sessions.anchor_stream_id -> streams.id
DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sessions_anchor_stream_id_fkey'
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_anchor_stream_id_fkey
      FOREIGN KEY (anchor_stream_id) REFERENCES public.streams(id) ON DELETE SET NULL;
  END IF;
END
$fk$;

-- ------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- ------------------------------------------------------------

ALTER TABLE public.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams              ENABLE ROW LEVEL SECURITY;

-- users
DROP POLICY IF EXISTS "Users are viewable by everyone" ON public.users;
CREATE POLICY "Users are viewable by everyone"
  ON public.users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update own record" ON public.users;
CREATE POLICY "Users can update own record"
  ON public.users FOR UPDATE USING (auth.uid() = id);

-- follows
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON public.follows;
CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow from own account" ON public.follows;
CREATE POLICY "Users can follow from own account"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND follower_id <> following_id);

DROP POLICY IF EXISTS "Users can unfollow from own account" ON public.follows;
CREATE POLICY "Users can unfollow from own account"
  ON public.follows FOR DELETE USING (auth.uid() = follower_id);

-- feedback_submissions
DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback_submissions;
CREATE POLICY "Anyone can submit feedback"
  ON public.feedback_submissions FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- sessions
DROP POLICY IF EXISTS "Sessions are viewable by everyone" ON public.sessions;
CREATE POLICY "Sessions are viewable by everyone"
  ON public.sessions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create sessions" ON public.sessions;
CREATE POLICY "Authenticated users can create sessions"
  ON public.sessions FOR INSERT WITH CHECK (auth.uid() = host_id);

DROP POLICY IF EXISTS "Host can update own session" ON public.sessions;
CREATE POLICY "Host can update own session"
  ON public.sessions FOR UPDATE USING (auth.uid() = host_id);

DROP POLICY IF EXISTS "Host can delete own ended sessions" ON public.sessions;
CREATE POLICY "Host can delete own ended sessions"
  ON public.sessions FOR DELETE
  USING (auth.uid() = host_id AND status = 'ended');

-- streams
DROP POLICY IF EXISTS "Streams are viewable by everyone" ON public.streams;
CREATE POLICY "Streams are viewable by everyone"
  ON public.streams FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can add their stream" ON public.streams;
CREATE POLICY "Authenticated users can add their stream"
  ON public.streams FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Stream owner or session host can update" ON public.streams;
CREATE POLICY "Stream owner or session host can update"
  ON public.streams FOR UPDATE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = session_id)
  );

DROP POLICY IF EXISTS "Stream owner or session host can delete" ON public.streams;
CREATE POLICY "Stream owner or session host can delete"
  ON public.streams FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (SELECT host_id FROM public.sessions WHERE id = session_id)
  );

-- ------------------------------------------------------------
-- 3. AUTO-CREATE PROFILE ON SIGNUP
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name',
             NEW.raw_user_meta_data ->> 'name',
             split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url',
             NEW.raw_user_meta_data ->> 'picture', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------
-- 4. REALTIME (viewers see POVs join/leave live)
-- ------------------------------------------------------------

DO $rt$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'streams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.streams;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
  END IF;
END
$rt$;

-- ------------------------------------------------------------
-- 5. BACKFILL PROFILES for any auth users created before the trigger existed
-- ------------------------------------------------------------

INSERT INTO public.users (id, email, display_name, avatar_url)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data ->> 'full_name',
           au.raw_user_meta_data ->> 'name',
           split_part(au.email, '@', 1)),
  COALESCE(au.raw_user_meta_data ->> 'avatar_url',
           au.raw_user_meta_data ->> 'picture', '')
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;
