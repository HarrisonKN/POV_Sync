-- POV Sync — post-rebuild verification.
-- Run in the SQL Editor after rebuild.sql. Every row should say OK.

-- 1. Tables
SELECT 'tables' AS check_name,
       CASE WHEN count(*) = 5 THEN 'OK' ELSE 'MISSING: expected 5, got ' || count(*) END AS result
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('users', 'follows', 'feedback_submissions', 'sessions', 'streams');

-- 2. sessions columns
SELECT 'sessions columns' AS check_name,
       CASE WHEN count(*) = 12 THEN 'OK' ELSE 'MISSING: got ' || count(*) || ' of 12' END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'sessions'
  AND column_name IN ('id','host_id','participant_link','spectator_link','share_link',
                      'title','status','anchor_stream_id','created_at','ended_at','vod_ready_at',
                      'control_delegate_id');

-- 3. streams columns
SELECT 'streams columns' AS check_name,
       CASE WHEN count(*) = 12 THEN 'OK' ELSE 'MISSING: got ' || count(*) || ' of 12' END AS result
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'streams'
  AND column_name IN ('id','session_id','user_id','display_name','youtube_url','platform',
                      'offset_seconds','is_anchor','youtube_start_time','is_active','joined_at','left_at');

-- 4. RLS enabled everywhere
SELECT 'rls enabled' AS check_name,
       CASE WHEN bool_and(relrowsecurity) THEN 'OK' ELSE 'RLS OFF on some table' END AS result
FROM pg_class
WHERE relnamespace = 'public'::regnamespace
  AND relname IN ('users','follows','feedback_submissions','sessions','streams');

-- 5. Policy count (expect 14)
SELECT 'policies' AS check_name,
       CASE WHEN count(*) = 14 THEN 'OK' ELSE 'expected 14, got ' || count(*) END AS result
FROM pg_policies WHERE schemaname = 'public';

-- 6. FK name the app relies on for embedded selects (streams!streams_session_id_fkey)
SELECT 'streams_session_id_fkey' AS check_name,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'MISSING — embedded selects will fail' END AS result
FROM pg_constraint WHERE conname = 'streams_session_id_fkey';

-- 7. Signup trigger
SELECT 'signup trigger' AS check_name,
       CASE WHEN count(*) = 1 THEN 'OK' ELSE 'MISSING — new logins will have no profile' END AS result
FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- 8. Realtime publication
SELECT 'realtime tables' AS check_name,
       CASE WHEN count(*) = 2 THEN 'OK' ELSE 'expected 2, got ' || count(*) END AS result
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
  AND tablename IN ('streams', 'sessions');
