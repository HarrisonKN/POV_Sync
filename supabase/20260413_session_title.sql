-- Add optional session title column
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS title text;

-- Backfill: leave existing sessions as NULL (UI will show a sensible default)
