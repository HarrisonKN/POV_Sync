-- Migration: add share_link to sessions
-- A single universal invite link that replaces the two separate
-- participant_link / spectator_link share URLs. The new /room/:code
-- entry point lets the joiner choose their own role.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS share_link TEXT;

-- Backfill existing rows so nothing breaks for sessions that pre-date this migration
UPDATE sessions
SET share_link = substring(md5(random()::text || id::text), 1, 10)
WHERE share_link IS NULL;

-- Enforce non-null and uniqueness going forward
ALTER TABLE sessions ALTER COLUMN share_link SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_share_link_idx ON sessions (share_link);
