/**
 * Viewer — data-fetching wrapper for authenticated participants and hosts.
 * All UI/playback logic lives in SessionRoom.
 */
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import SessionRoom from './SessionRoom';
import SessionSkeleton from '../components/SessionSkeleton';
import ErrorState from '../components/ErrorState';

export default function Viewer() {
  const { sessionId } = useParams();
  const location = useLocation();
  const { user } = useAuth();

  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch session + streams ────────────────────────────────────────────────
  useEffect(() => {
    async function fetchSession() {
      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) throw sessionError;
        setSession(sessionData);

        const { data: streamsData, error: streamsError } = await supabase
          .from('streams')
          .select('*')
          .eq('session_id', sessionId)
          .order('joined_at', { ascending: true });

        if (streamsError) throw streamsError;
        setStreams(streamsData || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchSession();
  }, [sessionId]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`viewer-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'streams', filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setStreams((prev) => prev.some((s) => s.id === payload.new.id) ? prev : [...prev, payload.new]);
          } else if (payload.eventType === 'UPDATE') {
            setStreams((prev) => prev.map((s) => (s.id === payload.new.id ? payload.new : s)));
          } else if (payload.eventType === 'DELETE') {
            setStreams((prev) => prev.filter((s) => s.id !== payload.old.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
        (payload) => { setSession(payload.new); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

  if (loading) return <SessionSkeleton />;

  if (error) {
    return (
      <ErrorState
        icon="📺"
        title="Session not found"
        message={error}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  const role = user?.id === session?.host_id ? 'host' : 'participant';

  return (
    <SessionRoom
      role={role}
      session={session}
      streams={streams}
      onStreamsChange={setStreams}
    />
  );
}
