import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { supabase } from '../lib/supabase';
import ErrorState from '../components/ErrorState';
import SessionResumeCard from '../components/SessionResumeCard';
import SessionRoomHeader from '../components/SessionRoomHeader';

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
  const { activeSession } = useActiveSession();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [streams, setStreams] = useState([]);
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');

  function handleCodeSubmit(e) {
    e.preventDefault();
    const parsed = parseJoinCode(codeInput);
    if (!parsed) { setCodeError('Please enter a join code'); return; }
    navigate(`/join/${parsed}`);
  }

  // Fetch session info
  useEffect(() => {
    if (!code) return;
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
    if (!code || !session?.id) return;
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
  const activeStreams = session?.status === 'live'
    ? streams.filter((s) => s.is_active !== false)
    : streams;
  const alreadyJoined = user && activeStreams.some((s) => s.user_id === user.id);

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

  if (!code) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] items-start">
          <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6 shadow-sm">
            <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-2">Join a session</p>
            <h1 className="text-2xl sm:text-3xl font-bold font-mono mb-2">Enter a join code or participant link</h1>
            <p className="text-sm text-pov-muted mb-6 max-w-lg">
              If your host sent you a participant link, paste it here.
              Otherwise, enter the short join code from Discord, chat, or text.
            </p>
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <input
                type="text"
                value={codeInput}
                autoFocus
                onChange={(e) => { setCodeInput(e.target.value); setCodeError(''); }}
                placeholder="Join code or participant link"
                className="w-full bg-pov-bg border border-pov-border rounded-xl px-4 py-3 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors font-mono"
              />
              {codeError && (
                <p className="text-xs text-pov-danger">{codeError}</p>
              )}
              <button
                type="submit"
                className="w-full bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors"
              >
                Continue →
              </button>
            </form>
          </div>

          <div className="space-y-4">
            {activeSession && (
              <SessionResumeCard
                session={activeSession}
                to={user?.id === activeSession.host_id ? `/session/${activeSession.id}` : `/session/${activeSession.id}?pov=${user.id}`}
                title="You already have a live session"
                subtitle="Jump back in instead of starting over."
                compact
              />
            )}

            <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
              <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">How it works</p>
              <div className="space-y-3 text-sm text-pov-muted leading-relaxed">
                <p>1. Paste the join code or participant link.</p>
                <p>2. Sign in if needed.</p>
                <p>3. Add your YouTube stream URL once you’re live.</p>
                <p>4. You’ll enter the shared room right away.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link to="/setup" className="text-xs font-mono text-pov-accent hover:underline">Need setup help? Open the guide →</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <ErrorState
        icon="🔗"
        title="Invalid join link"
        message={error}
        helper="Try pasting the participant link again, or ask your host to resend the join code."
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
        helper="If you meant to join live, go back to the participant link for the current session."
        action={{
          label: 'Watch VOD',
          onClick: () => navigate(`/watch/${session.spectator_link}`),
        }}
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  if (activeStreams.length >= 5 && !alreadyJoined) {
    return (
      <ErrorState
        icon="🛋️"
        title="Session is full"
        message="This session already has 5 participants, the maximum allowed."
        helper="You can still join as a spectator, or ask the host to remove a participant before trying again."
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  // Must be logged in to join as participant
  if (!user) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr] items-start">
          <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
            <h1 className="text-2xl font-bold font-mono mb-2">Join Session</h1>
            <p className="text-sm text-pov-muted mb-6 max-w-lg">
              Sign in to join as a participant and submit your stream.
            </p>
            <button
              onClick={signInWithGoogle}
              className="bg-pov-accent hover:bg-pov-accent/80 text-white font-semibold rounded-xl px-8 py-3 text-sm transition-colors"
            >
              Sign in with Google
            </button>
          </div>

          <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
            <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">Before you join</p>
            <ul className="space-y-2 text-sm text-pov-muted leading-relaxed">
              <li>• Start your YouTube stream first.</li>
              <li>• Keep OBS pointed at the live scene you want to share.</li>
              <li>• Use the participant link from your host, not the spectator link.</li>
              <li>• You can always come back here if you navigate away.</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr] items-start">
        <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6 shadow-sm">
          <SessionRoomHeader
            title="You’re entering a shared room"
            session={session}
            hostLabel={session?.streams?.find((s) => s.user_id === session?.host_id)?.display_name ?? 'Host'}
            roleLabel="Participant view"
            roleTone="participant"
            statusLabel={session?.status === 'live' ? 'Live session' : 'VOD session'}
            statusTone={session?.status === 'live' ? 'live' : 'vod'}
            secondaryLabel="Your POV joins the same room state as everyone else"
            className="mb-4"
          />

          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <h1 className="text-2xl font-bold font-mono mb-2">Join Session</h1>
              <p className="text-sm text-pov-muted max-w-lg">
                Submit your YouTube stream URL to join this session.
              </p>
            </div>
            <span className="hidden sm:inline-flex text-[10px] font-mono text-pov-muted bg-pov-bg border border-pov-border rounded-full px-3 py-1">
              5 participant max
            </span>
          </div>

          {/* Who's already here — updates in real time */}
          {activeStreams.length > 0 && (
            <div className="mb-6">
              <h2 className="text-xs font-mono text-pov-muted mb-2 uppercase tracking-wider">
                Already joined ({activeStreams.length}/5)
              </h2>
              <div className="space-y-1">
                {activeStreams.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 text-sm text-pov-text bg-pov-bg border border-pov-border rounded-lg px-3 py-2"
                  >
                    <span>{s.is_anchor ? '⚓' : '🟢'}</span>
                    <span className="truncate">{s.display_name}</span>
                    {s.user_id === session?.host_id && (
                      <span className="text-[10px] text-pov-muted font-mono ml-auto flex-shrink-0">HOST</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-5">
            <div>
              <label htmlFor="display-name" className="block text-xs font-mono text-pov-muted mb-1.5">
                Display Name
              </label>
              <input
                id="display-name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-pov-bg border border-pov-border rounded-xl px-4 py-3 text-sm text-pov-text focus:outline-none focus:border-pov-accent transition-colors"
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
                className="w-full bg-pov-bg border border-pov-border rounded-xl px-4 py-3 text-sm text-pov-text placeholder:text-pov-muted/50 focus:outline-none focus:border-pov-accent transition-colors"
              />
            </div>

            {error && (
              <div className="text-sm text-pov-danger bg-pov-danger/10 border border-pov-danger/20 rounded-xl px-4 py-3">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-pov-accent hover:bg-pov-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-6 py-3 text-sm transition-colors"
            >
              {submitting ? 'Joining...' : 'Join Session'}
            </button>
          </form>
        </div>

        <div className="space-y-4">
          {activeSession && (
            <SessionResumeCard
              session={activeSession}
              to={user?.id === activeSession.host_id ? `/session/${activeSession.id}` : `/session/${activeSession.id}?pov=${user.id}`}
              title="You already have a live session"
              subtitle="Use this if you were already in a session and came here by mistake."
              compact
            />
          )}

          <div className="bg-pov-surface border border-pov-border rounded-2xl p-5 sm:p-6">
            <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">Helpful reminders</p>
            <ul className="space-y-2 text-sm text-pov-muted leading-relaxed">
              <li>• You need to be live on YouTube before you submit.</li>
              <li>• The participant link is for streamers; the spectator link is read-only.</li>
              <li>• If you leave the page, the navbar can take you back to any active live session.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
