/**
 * Spectator — data-fetching wrapper for unauthenticated viewers.
 * All UI/playback logic lives in SessionRoom.
 */
import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import SessionRoom from './SessionRoom';
import SessionSkeleton from '../components/SessionSkeleton';
import ErrorState from '../components/ErrorState';

export default function Spectator() {
  const { code } = useParams();

  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ── Fetch session via public API ──────────────────────────────────────────
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/watch/${code}`);
        if (!res.ok) throw new Error('Session not found');
        const data = await res.json();
        setSession(data.session);
        setStreams(data.session.streams || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchSession();
  }, [code]);

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`spectator-${session.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'streams', filter: `session_id=eq.${session.id}` },
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
        { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${session.id}` },
        (payload) => { setSession(payload.new); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]);

  if (loading) return <SessionSkeleton />;

  if (error) {
    return (
      <ErrorState
        icon="View"
        title="Room not found"
        message={error}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  return (
    <SessionRoom
      role="spectator"
      session={session}
      streams={streams}
      onStreamsChange={setStreams}
    />
  );
}
