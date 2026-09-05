-- Control delegation moves from server memory to the session row.
--
-- The old WebSocket server held "who currently holds the controls" in a
-- Map<sessionId, ...>. That state cannot survive on a serverless host (every
-- request may hit a fresh instance), and it was also lost on every deploy or
-- restart. Storing it on the session makes it durable, and clients pick the
-- change up through the realtime subscription they already have on `sessions`.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS control_delegate_id uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- A delegate is only meaningful while the session is live.
UPDATE public.sessions
SET control_delegate_id = NULL
WHERE status = 'ended' AND control_delegate_id IS NOT NULL;
