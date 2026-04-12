import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Returns the user's active live session (if any) so we can show a
 * "Return to Session" banner from anywhere in the app.
 *
 * Returns: { activeSession, loading }
 *   activeSession: { id, streams: [{ display_name }] } | null
 */
export function useActiveSession() {
  const { user } = useAuth();
  const location = useLocation();
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setActiveSession(null);
      return;
    }

    let cancelled = false;

    async function check() {
      setLoading(true);
      try {
        // 1) Find sessions user hosts that are live
        const { data: hosted } = await supabase
          .from('sessions')
          .select('id, host_id, streams!streams_session_id_fkey(id, display_name)')
          .eq('host_id', user.id)
          .eq('status', 'live')
          .limit(1);

        if (!cancelled && hosted?.length > 0) {
          setActiveSession(hosted[0]);
          setLoading(false);
          return;
        }

        // 2) Find sessions user participates in that are live
        const { data: streamRows } = await supabase
          .from('streams')
          .select('session_id, sessions!inner(id, status, host_id, streams!streams_session_id_fkey(id, display_name))')
          .eq('user_id', user.id)
          .eq('sessions.status', 'live')
          .limit(1);

        if (!cancelled && streamRows?.length > 0) {
          setActiveSession(streamRows[0].sessions);
        } else if (!cancelled) {
          setActiveSession(null);
        }
      } catch (err) {
        console.error('[useActiveSession]', err);
        if (!cancelled) setActiveSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    check();

    return () => { cancelled = true; };
  }, [user, location.pathname]); // Re-check on navigation

  return { activeSession, loading };
}
