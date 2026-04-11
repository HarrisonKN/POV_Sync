-- POV Sync: VOD/archive schema update
-- Run this in Supabase SQL Editor.

-- Sessions: track when the VOD is ready for replay.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS vod_ready_at timestamptz;

-- Streams: keep departed POVs as archived rows instead of deleting them.
ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

-- Backfill existing rows so live filtering works immediately.
UPDATE public.streams
SET is_active = true
WHERE is_active IS NULL;
