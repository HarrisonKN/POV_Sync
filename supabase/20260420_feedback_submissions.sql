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

CREATE INDEX IF NOT EXISTS feedback_submissions_created_at_idx
  ON public.feedback_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_submissions_type_idx
  ON public.feedback_submissions (feedback_type, created_at DESC);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Anyone can submit feedback" ON public.feedback_submissions;