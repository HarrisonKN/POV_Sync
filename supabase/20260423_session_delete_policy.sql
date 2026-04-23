-- Allow session hosts to delete their own ended sessions
CREATE POLICY "Host can delete own ended sessions"
  ON public.sessions
  FOR DELETE
  USING (auth.uid() = host_id AND status = 'ended');
