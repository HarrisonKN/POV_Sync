import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import ErrorState from '../components/ErrorState';

// Extract a bare join code from either a raw code or a full participant URL
function parseJoinCode(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#]+)/);
  if (match) return match[1];
  return trimmed;
}

export default function JoinSession() {
  const { code } = useParams();
  const { user, profile, signInWithGoogle, getAccessToken } = useAuth();
  const navigate = useNavigate();

  // ── Code-entry screen (navigated to /join with no code) ──────────────────
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');

  if (!code) {
    function handleCodeSubmit(e) {
      e.preventDefault();
      const parsed = parseJoinCode(codeInput);
      if (!parsed) { setCodeError('Please enter a join code'); return; }
      navigate(`/join/${parsed}`);
    }

    return (
      <div className="max-w-sm mx-auto px-4 py-24">
        <h1 className="text-2xl font-bold font-mono mb-2 text-center">Join a Session</h1>
        <p className="text-sm text-pov-muted text-center mb-8">
          Paste your participant link or enter the join code from your host.
        </p>
        <form onSubmit={handleCodeSubmit} className="space-y-4">
          <input
            type="text"
            value={codeInput}
            autoFocus
            onChange={(e) => { setCodeInput(e.target.value); setCodeError(''); }}
            placeholder="Join code or participant link"
            className="w-full bg-pov-bg border border-pov-border rounded px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors font-mono"
          />
          {codeError && (
            <p className="text-xs text-pov-danger">{codeError}</p>
          )}
          <button
            type="submit"
            className="w-full bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
          >
            Continue →
          </button>
        </form>
      </div>
    );
  }

  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Fetch session info
  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/join/${code}`);
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

  // Realtime: watch for new streams joining while on this page
  useEffect(() => {
    if (!session?.id) return;

    const channel = supabase
      .channel(`join-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'streams',
          filter: `session_id=eq.${session.id}`,
        },
        (payload) => {
          setStreams((prev) => {
            if (prev.some((s) => s.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.id]);

  // Pre-fill display name from profile
  useEffect(() => {
    if (profile?.display_name) {
      setDisplayName(profile.display_name);
    }
  }, [profile]);

  // Check if the current user already has a stream in this session
  const alreadyJoined = user && streams.some((s) => s.user_id === user.id);

  // If already joined, redirect straight to the viewer
  useEffect(() => {
    if (alreadyJoined && session?.id) {
      navigate(`/session/${session.id}`, { replace: true });
    }
  }, [alreadyJoined, session?.id, navigate]);

  async function handleJoin(e) {
    e.preventDefault();
    setError(null);

    if (!youtubeUrl.trim()) {
      setError('Please enter your YouTube stream URL');
      return;
    }

    setSubmitting(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/sessions/${session.id}/streams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          userId: user.id,
          youtubeUrl: youtubeUrl.trim(),
          displayName: displayName || profile?.display_name || user.email,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join session');
      }

      // Navigate to the viewer
      navigate(`/session/${session.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-pov-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !session) {
    return (
      <ErrorState
        icon="🔗"
        title="Invalid join link"
        message={error}
        action={{ label: 'Enter a code manually', onClick: () => navigate('/join') }}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  if (session?.status === 'ended') {
    return (
      <ErrorState
        icon="📼"
        title="Session has ended"
        message="This session is over, but you can still watch all the POVs as a VOD."
        action={{
          label: 'Watch VOD',
          onClick: () => navigate(`/watch/${session.spectator_link}`),
        }}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  if (streams.length >= 5 && !alreadyJoined) {
    return (
      <ErrorState
        icon="🛋️"
        title="Session is full"
        message="This session already has 5 participants, the maximum allowed."
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  // Must be logged in to join as participant
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold font-mono mb-2">Join Session</h1>
        <p className="text-sm text-pov-muted mb-8">
          Sign in to join as a participant and submit your stream.
        </p>
        <button
          onClick={signInWithGoogle}
          className="bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-lg px-8 py-3 text-sm transition-colors"
        >
          Sign in with Google
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16">
      <h1 className="text-2xl font-bold font-mono mb-2">Join Session</h1>
      <p className="text-sm text-pov-muted mb-6">
        Submit your YouTube stream URL to join this session.
      </p>

      {/* Who's already here — updates in real time */}
      {streams.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xs font-mono text-pov-muted mb-2 uppercase tracking-wider">
            Already joined ({streams.length}/5)
          </h2>
          <div className="space-y-1">
            {streams.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 text-sm text-pov-text bg-pov-surface border border-pov-border rounded px-3 py-2"
              >
                <span>{s.is_anchor ? '⚓' : '🟢'}</span>
                <span>{s.display_name}</span>
                {s.user_id === session?.host_id && (
                  <span className="text-[10px] text-pov-muted font-mono ml-auto">HOST</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleJoin} className="space-y-6">
        <div>
          <label htmlFor="display-name" className="block text-xs font-mono text-pov-muted mb-1.5">
            Display Name
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full bg-pov-bg border border-pov-border rounded px-4 py-2.5 text-sm text-pov-text focus:outline-none focus:border-pov-accent transition-colors"
          />
        </div>

        <div>
          <label htmlFor="youtube-url" className="block text-xs font-mono text-pov-muted mb-1.5">
            Your YouTube Stream URL
          </label>
          <input
            id="youtube-url"
            type="url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="w-full bg-pov-bg border border-pov-border rounded px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/50 focus:outline-none focus:border-pov-accent transition-colors"
          />
        </div>

        {error && (
          <div className="text-sm text-pov-danger bg-pov-danger/10 border border-pov-danger/20 rounded px-4 py-2.5">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-pov-accent hover:bg-pov-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-6 py-3 text-sm transition-colors"
        >
          {submitting ? 'Joining...' : 'Join Session'}
        </button>
      </form>
    </div>
  );
}
