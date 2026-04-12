-- Add platform column to streams table for multi-platform support (YouTube + Twitch)
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- 1. Add platform column (defaults to 'youtube' for existing rows)
ALTER TABLE public.streams
  ADD COLUMN IF NOT EXISTS platform text DEFAULT 'youtube';

-- 2. Rename youtube_url → stream_url to be platform-agnostic
-- NOTE: We keep the column name as youtube_url for backward compatibility
-- and add stream_url as an alias/computed column. The app code will use
-- the youtube_url column for both YouTube and Twitch URLs.
-- This avoids a breaking rename migration.

-- 3. Update the check constraint if desired (optional, informational)
-- ALTER TABLE public.streams ADD CONSTRAINT streams_platform_check CHECK (platform IN ('youtube', 'twitch'));

COMMENT ON COLUMN public.streams.platform IS 'Streaming platform: youtube or twitch';
COMMENT ON COLUMN public.streams.youtube_url IS 'Stream URL — YouTube watch URL or Twitch channel URL';
