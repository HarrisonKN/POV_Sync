-- POV Sync — Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Users table (mirrors auth.users with app-specific fields)
CREATE TABLE IF NOT EXISTS public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text UNIQUE NOT NULL,
  display_name text NOT NULL,
  avatar_url  text,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT follows_no_self_follow CHECK (follower_id <> following_id)
);

CREATE INDEX IF NOT EXISTS follows_following_id_idx ON public.follows (following_id, created_at DESC);
CREATE INDEX IF NOT EXISTS follows_follower_id_idx ON public.follows (follower_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  email text,
  display_name text,
  feedback_type text NOT NULL,
  message text NOT NULL,
  page_path text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx ON public.feedback_submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_type_idx ON public.feedback_submissions (feedback_type, created_at DESC);

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
  ADD CONSTRAINT feedback_submissions_type_check CHECK (feedback_type IN ('suggestion', 'bug', 'general')),
  ADD CONSTRAINT feedback_submissions_message_length_check CHECK (char_length(trim(message)) BETWEEN 10 AND 1000 AND position('<' in message) = 0 AND position('>' in message) = 0),
  ADD CONSTRAINT feedback_submissions_email_check CHECK (email IS NULL OR (char_length(email) <= 254 AND email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$')),
  ADD CONSTRAINT feedback_submissions_display_name_check CHECK (display_name IS NULL OR (char_length(display_name) BETWEEN 1 AND 80 AND position('<' in display_name) = 0 AND position('>' in display_name) = 0)),
  ADD CONSTRAINT feedback_submissions_page_path_check CHECK (page_path IS NULL OR (char_length(page_path) <= 200 AND page_path ~ '^/[A-Za-z0-9/_?&=+#.%:-]*$')),
  ADD CONSTRAINT feedback_submissions_user_agent_check CHECK (user_agent IS NULL OR char_length(user_agent) <= 512);

-- 2. Sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id          uuid NOT NULL REFERENCES public.users(id),
  participant_link text UNIQUE NOT NULL,
  spectator_link   text UNIQUE NOT NULL,
  title            text,  -- optional session title
  status           text CHECK (status IN ('live', 'ended')) DEFAULT 'live',
  anchor_stream_id uuid,  -- FK added after streams table exists
  created_at       timestamptz DEFAULT now(),
  ended_at         timestamptz,
  vod_ready_at     timestamptz   -- Set once the final VOD offsets have been computed
);

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS vod_ready_at timestamptz;

-- 3. Streams table
CREATE TABLE IF NOT EXISTS public.streams (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES public.users(id),
  display_name        text NOT NULL,
  youtube_url         text NOT NULL,
  platform            text DEFAULT 'youtube',  -- 'youtube' or 'twitch'
  offset_seconds      float DEFAULT 0,
  is_anchor           boolean DEFAULT false,
  youtube_start_time  float,   -- Unix timestamp (seconds) from YT IFrame API getVideoStartTime()
                               -- Used as Layer 1 sync: exact offset = streamStartTime - anchorStartTime
                               -- Persisted so VOD recalculation works after server restart
  is_active           boolean DEFAULT true,
  joined_at           timestamptz DEFAULT now(),
  left_at             timestamptz
);

ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

UPDATE public.streams
SET is_active = true
WHERE is_active IS NULL;

-- 4. Add the deferred FK from sessions → streams for anchor
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_anchor_stream_id_fkey
  FOREIGN KEY (anchor_stream_id)
  REFERENCES public.streams(id)
  ON DELETE SET NULL;

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streams  ENABLE ROW LEVEL SECURITY;

-- Users: anyone can read, only the user themselves can update
CREATE POLICY "Users are viewable by everyone"
  ON public.users FOR SELECT
  USING (true);

CREATE POLICY "Users can update own record"
  ON public.users FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Follows are viewable by everyone"
  ON public.follows FOR SELECT
  USING (true);

CREATE POLICY "Users can follow from own account"
  ON public.follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND follower_id <> following_id);

CREATE POLICY "Users can unfollow from own account"
  ON public.follows FOR DELETE
  USING (auth.uid() = follower_id);

CREATE POLICY "Anyone can submit feedback"
  ON public.feedback_submissions FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- Sessions: anyone can read (spectator links are public), authenticated users can insert
CREATE POLICY "Sessions are viewable by everyone"
  ON public.sessions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create sessions"
  ON public.sessions FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Host can update own session"
  ON public.sessions FOR UPDATE
  USING (auth.uid() = host_id);

-- Streams: anyone can read, authenticated users can insert their own
CREATE POLICY "Streams are viewable by everyone"
  ON public.streams FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can add their stream"
  ON public.streams FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Stream owner or session host can update"
  ON public.streams FOR UPDATE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT host_id FROM public.sessions WHERE id = session_id
    )
  );

-- Streams: owner can delete their own, or session host can delete any
CREATE POLICY "Stream owner or session host can delete"
  ON public.streams FOR DELETE
  USING (
    auth.uid() = user_id
    OR auth.uid() IN (
      SELECT host_id FROM public.sessions WHERE id = session_id
    )
  );

-- ============================================================
-- Auto-create user profile on first login
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', NEW.raw_user_meta_data ->> 'picture', '')
  );
  RETURN NEW;
END;
$$;

-- Trigger: fires when a new auth.users row is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Enable Realtime for streams table (so viewers see joins live)
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.streams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
