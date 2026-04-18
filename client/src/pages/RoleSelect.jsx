import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { useAuth } from '../hooks/useAuth';
import ErrorState from '../components/ErrorState';

export default function RoleSelect() {
  const { code } = useParams();
  const navigate = useNavigate();
  const { user, profile, signInWithGoogle } = useAuth();
  const location = useLocation();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchSession() {
      try {
        const res = await fetch(`/api/sessions/room/${code}`);
        if (!res.ok) throw new Error('Session not found');
        const data = await res.json();
        setSession(data.session);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (code) fetchSession();
  }, [code]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex gap-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 bg-pov-accent rounded-full animate-pulse"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <ErrorState
        icon="🔗"
        title="Invalid invite link"
        message={error || 'This link does not match any session.'}
        helper="Ask your host for an updated link, or enter a join code on the home page."
        secondary={{ label: '← Home', to: '/' }}
      />
    );
  }

  const isLive = session.status === 'live';
  const isEnded = session.status === 'ended';
  const activeStreams = (session.streams || []).filter((s) => s.is_active !== false);
  const hostStream = activeStreams.find((s) => s.user_id === session.host_id);
  const hostName = hostStream?.display_name ?? 'Host';
  const participantCount = activeStreams.length;
  const isFull = participantCount >= 5;

  const displayName = profile?.display_name || user?.email?.split('@')[0] || null;

  // Auto-forward: if user just signed in via OAuth redirect (hash fragment present)
  // and the session is joinable, skip the role-select screen and go straight to join.
  const [autoForwarded, setAutoForwarded] = useState(false);
  useEffect(() => {
    if (autoForwarded) return;
    // Supabase OAuth returns with #access_token=... in the URL
    const hasOAuthReturn = window.location.hash.includes('access_token');
    if (hasOAuthReturn && user && session && session.status === 'live') {
      const active = (session.streams || []).filter((s) => s.is_active !== false);
      if (active.length < 5 && session.participant_link) {
        setAutoForwarded(true);
        // Clean hash fragment from URL
        window.history.replaceState(null, '', window.location.pathname);
        navigate(`/join/${session.participant_link}`, { replace: true });
      }
    }
  }, [user, session, autoForwarded, navigate]);

  function joinAsSpectator() {
    navigate(`/watch/${session.spectator_link}`);
  }

  function joinAsParticipant() {
    if (!user) {
      // Not signed in — trigger Google sign-in and come back to this room page.
      // After sign-in, Supabase redirects here; the user will be authenticated
      // and can click Join again (or we auto-redirect — see effect below).
      signInWithGoogle(`${window.location.origin}/room/${code}`);
      return;
    }
    navigate(`/join/${session.participant_link}`);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16"
    >
      {/* Session header */}
      <div className="mb-8 text-center">
        <span className={`inline-flex text-[10px] font-mono uppercase tracking-wider px-3 py-1 rounded-full border mb-3 ${
          isLive
            ? 'text-pov-success bg-pov-success/10 border-pov-success/20'
            : 'text-pov-warning bg-pov-warning/10 border-pov-warning/20'
        }`}>
          {isLive ? 'Live session' : 'VOD session'}
        </span>
        <h1 className="text-2xl sm:text-3xl font-bold font-mono text-pov-text mb-2">
          {session.title || 'POV Session'}
        </h1>
        <p className="text-sm text-pov-muted">
          Hosted by <span className="text-pov-text font-medium">{hostName}</span>
          {' · '}
          {participantCount} POV{participantCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Who's in the room */}
      {activeStreams.length > 0 && (
        <div className="mb-8 bg-pov-surface border border-pov-border rounded-xl px-4 py-3">
          <p className="text-[10px] font-mono uppercase tracking-wider text-pov-muted mb-2">In the room</p>
          <div className="flex flex-wrap gap-2">
            {activeStreams.map((s) => (
              <span
                key={s.id}
                className="text-xs font-mono bg-pov-bg border border-pov-border rounded-full px-3 py-1 text-pov-text flex items-center gap-1.5"
              >
                {s.is_anchor && <span className="text-pov-accent text-[10px]">⚓</span>}
                {s.display_name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Role choice cards */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Watch as spectator */}
        <motion.button
          type="button"
          whileHover={{ y: -3, scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={joinAsSpectator}
          className="glass-card text-left rounded-2xl border border-pov-border p-5 hover:border-white/18 transition-colors"
        >
          <div className="mb-3 text-2xl">👁</div>
          <h2 className="text-base font-bold font-mono text-pov-text mb-1">Watch</h2>
          <p className="text-xs text-pov-muted leading-relaxed mb-4">
            Watch all POVs in read-only mode. No account required.
            {isEnded && ' The session is saved as a VOD.'}
          </p>
          <span className="inline-flex text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border text-pov-muted border-pov-border">
            No login needed
          </span>
        </motion.button>

        {/* Join as participant */}
        <motion.button
          type="button"
          whileHover={!isEnded && !isFull ? { y: -3, scale: 1.01 } : {}}
          whileTap={!isEnded && !isFull ? { scale: 0.98 } : {}}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          onClick={!isEnded && !isFull ? joinAsParticipant : undefined}
          disabled={isEnded || isFull}
          className={`glass-card text-left rounded-2xl border p-5 transition-colors ${
            isEnded || isFull
              ? 'border-pov-border opacity-50 cursor-not-allowed'
              : 'border-pov-border hover:border-pov-accent/40'
          }`}
        >
          <div className="mb-3 text-2xl">🎥</div>
          <h2 className="text-base font-bold font-mono text-pov-text mb-1">Join as Participant</h2>
          {isEnded ? (
            <p className="text-xs text-pov-muted leading-relaxed mb-4">
              This session has ended. You can still watch as a spectator.
            </p>
          ) : isFull ? (
            <p className="text-xs text-pov-muted leading-relaxed mb-4">
              This session is full (5 participants max). Watch as a spectator instead.
            </p>
          ) : (
            <p className="text-xs text-pov-muted leading-relaxed mb-4">
              Stream your own POV alongside the others. Requires a YouTube or Twitch link.
              {user && displayName && (
                <span className="block mt-1 text-pov-text/70">
                  Joining as <span className="font-medium text-pov-text">{displayName}</span>
                </span>
              )}
            </p>
          )}
          {!isEnded && !isFull && (
            <span className={`inline-flex text-[10px] font-mono uppercase tracking-wider px-2.5 py-1 rounded-full border ${
              user
                ? 'text-pov-success border-pov-success/30 bg-pov-success/10'
                : 'text-pov-muted border-pov-border'
            }`}>
              {user ? 'Signed in' : 'Sign-in required'}
            </span>
          )}
        </motion.button>
      </div>

      <p className="mt-6 text-center text-[10px] text-pov-muted/50 font-mono">
        {session.share_link}
      </p>
    </motion.div>
  );
}
