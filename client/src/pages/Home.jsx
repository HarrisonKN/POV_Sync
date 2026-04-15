import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { supabase } from '../lib/supabase';
import SessionResumeCard from '../components/SessionResumeCard';
import FollowButton from '../components/FollowButton';
import HomeSkeleton from '../components/HomeSkeleton';
import {
  fetchFollowLists,
  fetchProfileSessions,
  fetchSessionsForUsers,
  followUser,
  searchUsersByName,
  unfollowUser,
} from '../lib/social';

/* ── helpers ────────────────────────────────────────────────── */

function parseJoinCode(input) {
  const trimmed = input.trim();
  const match = trimmed.match(/\/join\/([^/?#]+)/);
  if (match) return match[1];
  return trimmed;
}

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  const days = Math.floor(seconds / 86400);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function duration(start, end) {
  const ms = new Date(end || Date.now()) - new Date(start);
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function memberSince(dateStr) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

/* ── component ──────────────────────────────────────────────── */

export default function Home() {
  const { user, profile, signInWithGoogle, getAccessToken } = useAuth();
  const { activeSession } = useActiveSession();
  const navigate = useNavigate();

  // Panel toggles
  const [activePanel, setActivePanel] = useState(null); // 'create' | 'join' | null
  const [showSocial, setShowSocial] = useState(false); // collapsed by default

  // Create form
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [sessionTitle, setSessionTitle] = useState('');

  // Join form
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');

  // Data
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [liveSessions, setLiveSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [publicLiveCount, setPublicLiveCount] = useState(0);
  const [followingProfiles, setFollowingProfiles] = useState([]);
  const [followingSessions, setFollowingSessions] = useState([]);
  const [followingIds, setFollowingIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [socialError, setSocialError] = useState('');
  const [socialBusyUserId, setSocialBusyUserId] = useState(null);

  const followingIdSet = useMemo(() => new Set(followingIds), [followingIds]);
  const followingLiveSessions = useMemo(
    () => followingSessions.filter((session) => session.status === 'live').slice(0, 6),
    [followingSessions]
  );
  const followingRecentSessions = useMemo(
    () => followingSessions.filter((session) => session.status !== 'live').slice(0, 6),
    [followingSessions]
  );

  const loadFollowingState = useCallback(async () => {
    if (!user?.id) return;

    setSocialError('');
    const followSummary = await fetchFollowLists(user.id, user.id);
    setFollowingIds(followSummary.followingIds);
    setFollowingProfiles(followSummary.following.slice(0, 8));

    if (!followSummary.followingIds.length) {
      setFollowingSessions([]);
      return;
    }

    const sessions = await fetchSessionsForUsers(followSummary.followingIds);
    setFollowingSessions(sessions);
  }, [user?.id]);

  /* ── Fetch data ────────────────────────────────────────── */

  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      try {
        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'live');
        setPublicLiveCount(count ?? 0);

        const { hostedSessions, participatedSessions } = await fetchProfileSessions(user.id);

        const map = new Map();
        [...hostedSessions, ...participatedSessions].forEach((s) => { if (!map.has(s.id)) map.set(s.id, s); });
        const all = [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setLiveSessions(all.filter((s) => s.status === 'live'));
        setRecentSessions(all.filter((s) => s.status !== 'live').slice(0, 8));
        await loadFollowingState();
      } catch (err) {
        console.error('Error loading dashboard:', err);
        setSocialError('Could not load your following feed yet.');
      } finally {
        setDashboardLoading(false);
      }
    })();
  }, [loadFollowingState, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setSearchError('');
      setSearchLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');

      try {
        const results = await searchUsersByName(trimmed, user.id);
        if (!cancelled) {
          setSearchResults(results);
        }
      } catch (err) {
        console.error('User search failed:', err);
        if (!cancelled) {
          setSearchResults([]);
          setSearchError('Search is unavailable right now.');
        }
      } finally {
        if (!cancelled) {
          setSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [searchQuery, user?.id]);

  /* ── Auto-expand social section when followed users are live */

  useEffect(() => {
    if (followingLiveSessions.length > 0) {
      setShowSocial(true);
    }
  }, [followingLiveSessions.length]);

  /* ── Keyboard shortcut: Ctrl+K to toggle join ──────────── */

  const handleKeyDown = useCallback((e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      setActivePanel((v) => v === 'join' ? null : 'join');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [user, handleKeyDown]);

  /* ── handlers ──────────────────────────────────────────── */

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError('');
    if (!youtubeUrl.trim()) { setCreateError('Paste your stream URL (YouTube or Twitch)'); return; }
    setCreateLoading(true);
    try {
      const token = await getAccessToken();
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          youtubeUrl: youtubeUrl.trim(),
          displayName: profile?.display_name || user.email,
          ...(sessionTitle.trim() && { title: sessionTitle.trim() }),
        }),
      });
      if (!res.ok) {
        let msg = `Server error (${res.status})`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      navigate(`/session/${data.session.id}`, {
        state: { participantLink: data.participantLink, spectatorLink: data.spectatorLink },
      });
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreateLoading(false);
    }
  }

  function handleJoin(e) {
    e.preventDefault();
    const code = parseJoinCode(joinInput);
    if (!code) { setJoinError('Enter a join code or paste a participant link'); return; }
    navigate(`/join/${code}`);
  }

  function togglePanel(panel) {
    setActivePanel((v) => v === panel ? null : panel);
  }

  const handleToggleFollow = useCallback(async (targetUserId, shouldFollow) => {
    if (!user?.id || targetUserId === user.id) return;

    setSocialBusyUserId(targetUserId);
    setSocialError('');

    try {
      if (shouldFollow) {
        await followUser(user.id, targetUserId);
      } else {
        await unfollowUser(user.id, targetUserId);
      }

      await loadFollowingState();
    } catch (err) {
      console.error('Follow toggle failed:', err);
      setSocialError('Could not update follow state. Please try again.');
    } finally {
      setSocialBusyUserId(null);
    }
  }, [loadFollowingState, user?.id]);

  /* ── signed-out landing ────────────────────────────────── */

  if (!user) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex flex-col">
        {/* Hero — left-aligned, two-column feel */}
        <div className="flex-1 flex items-center relative overflow-hidden">
          {/* Accent glow blobs */}
          <div className="absolute top-1/4 right-1/4 w-[600px] h-[600px] bg-pov-accent/[0.06] rounded-full blur-[150px] pointer-events-none" />
          <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-pov-success/[0.04] rounded-full blur-[120px] pointer-events-none" />

          <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-16 grid lg:grid-cols-2 gap-8 sm:gap-12 items-center relative z-10">
            {/* Left: CTA */}
            <div className="animate-in">
              <div className="inline-flex items-center gap-2 text-xs font-mono text-pov-accent bg-pov-accent/10 border border-pov-accent/20 rounded-full px-3 py-1 mb-4 sm:mb-6">
                <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-accent" />
                Multi-POV streaming
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold tracking-tight mb-3 sm:mb-4 leading-[1.1]">
                Watch every
                <br />
                <span className="text-gradient">perspective</span>
              </h1>
              <p className="text-pov-muted text-base sm:text-lg max-w-md mb-6 sm:mb-8 leading-relaxed">
                Sync your squad's YouTube & Twitch streams in one view.
                Switch POVs instantly, never miss a play.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={signInWithGoogle}
                  className="bg-pov-accent hover:bg-pov-accent/85 text-white font-semibold rounded-xl px-8 py-3.5 text-base transition-all hover:shadow-lg hover:shadow-pov-accent/25 hover:-translate-y-0.5"
                >
                  Get Started — it’s free
                </button>
                <Link
                  to="/setup"
                  className="text-pov-muted hover:text-pov-text border border-pov-border hover:border-pov-muted rounded-xl px-6 py-3.5 text-sm font-medium transition-all text-center"
                >
                  Setup Guide
                </Link>
              </div>
            </div>

            {/* Right: Visual feature cards — visible on all screens */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 animate-in" style={{ animationDelay: '0.1s' }}>
              {[
                { icon: '📺', title: 'Multi-POV', desc: 'Up to 8 YouTube & Twitch streams synced' },
                { icon: '🔗', title: 'One-Click Join', desc: 'Share a link, squad joins instantly' },
                { icon: '⚡', title: 'Auto Sync', desc: 'UTC-based offset, zero-latency sync' },
                { icon: '🎮', title: 'Gaming First', desc: 'Built for competitive & co-op streams' },
              ].map((f) => (
                <div
                  key={f.title}
                  className="bg-pov-surface/60 backdrop-blur-sm border border-pov-border/60 rounded-xl p-5 hover:border-pov-accent/30 transition-all group"
                >
                  <span className="text-2xl mb-3 block">{f.icon}</span>
                  <p className="text-sm font-semibold text-pov-text mb-1 group-hover:text-pov-accent transition-colors">{f.title}</p>
                  <p className="text-xs text-pov-muted leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom strip — how it works (mobile-friendly) */}
        <div className="border-t border-pov-border/50 bg-pov-surface/30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
            {[
              ['01', 'Create', 'Paste your YouTube or Twitch stream link & go live'],
              ['02', 'Invite', 'Share the join code with your squad'],
              ['03', 'Sync', 'Switch between POVs, perfectly in sync'],
            ].map(([step, title, desc]) => (
              <div key={step} className="group">
                <span className="text-xs font-mono text-pov-accent/60">{step}</span>
                <p className="text-sm font-semibold text-pov-text mt-1 group-hover:text-pov-accent transition-colors">{title}</p>
                <p className="text-xs text-pov-muted mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 pb-8 sm:pb-10">
          <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-4 sm:gap-5">
            <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
              <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">Fast path</p>
              <div className="grid sm:grid-cols-2 gap-3">
                <QuickActionCard
                  title="I’m ready to host"
                  description="Sign in, then create a session once your YouTube or Twitch stream is live."
                  actionLabel="Sign in to create"
                  onClick={signInWithGoogle}
                />
                <QuickActionCard
                  title="I just need the guide"
                  description="Open the step-by-step OBS + YouTube setup guide."
                  actionLabel="Open Setup Guide"
                  to="/setup"
                />
              </div>
            </div>

            <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
              <p className="text-[10px] font-mono text-pov-muted uppercase tracking-wider mb-3">What to expect</p>
              <div className="space-y-2 text-sm text-pov-muted leading-relaxed">
                <p>• OBS streams straight to YouTube or Twitch.</p>
                <p>• POV Sync keeps active sessions easy to resume.</p>
                <p>• Mobile and desktop both get the same workflow.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ── signed-in dashboard — wide, grid-based ────────────── */

  if (dashboardLoading) {
    return <HomeSkeleton />;
  }

  const hasLive = liveSessions.length > 0;
  const hasRecent = recentSessions.length > 0;
  const hasSocialContent = followingIds.length > 0 || followingLiveSessions.length > 0 || followingRecentSessions.length > 0;
  const isEmpty = !hasLive && !hasRecent;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* ── Top bar: greeting + live badge ──────────────────── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr] items-start mb-6 sm:mb-8 animate-in">
        <div className="flex items-center justify-between gap-4">
          <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile?.display_name ? `Hey, ${profile.display_name.split(' ')[0]}` : 'Dashboard'}
          </h1>
            <p className="text-sm text-pov-muted mt-0.5">Ready to stream?</p>
          </div>
          {publicLiveCount > 0 && (
            <div className="flex items-center gap-2 text-xs font-mono text-pov-success bg-pov-success/10 border border-pov-success/20 rounded-full px-3 py-1.5 flex-shrink-0">
              <span className="live-dot w-2 h-2 rounded-full bg-pov-success" />
              {publicLiveCount} live
            </div>
          )}
        </div>

        {activeSession && (
          <SessionResumeCard
            session={activeSession}
            to={user?.id === activeSession.host_id ? `/session/${activeSession.id}` : `/session/${activeSession.id}?pov=${user.id}`}
            title="Continue your live session"
            subtitle="You already have an active live session — jump straight back in."
          />
        )}
      </div>

      {/* ── Action cards — Create is primary, Join is secondary ─ */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-[1.15fr_0.85fr] mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.03s' }}>
        {/* Create card — primary CTA */}
        <div
          className={`rounded-xl border-2 transition-all overflow-hidden relative ${
            activePanel === 'create'
              ? 'border-pov-accent/50 bg-pov-surface shadow-lg shadow-pov-accent/10'
              : 'border-pov-accent/25 bg-pov-surface hover:border-pov-accent/40 hover:shadow-md hover:shadow-pov-accent/10'
          }`}
        >
          {/* Subtle glow behind card */}
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-pov-accent/[0.08] rounded-full blur-3xl pointer-events-none" />
          <button
            onClick={() => togglePanel('create')}
            className="w-full flex items-center gap-4 p-5 sm:p-6 text-left relative z-10"
          >
            <div className="w-14 h-14 rounded-xl bg-pov-accent/15 flex items-center justify-center text-pov-accent flex-shrink-0 ring-1 ring-pov-accent/20">
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-pov-text text-base">Create Session</p>
              <p className="text-xs text-pov-muted mt-0.5">Start hosting with your YouTube or Twitch stream</p>
            </div>
          </button>

          {activePanel === 'create' && (
            <div className="px-5 pb-5 border-t border-pov-border/50 pt-4 animate-in">
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="Session title (optional)"
                    maxLength={80}
                    className="w-full bg-pov-bg border border-pov-border rounded-lg px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors"
                  />
                </div>
                <div>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="YouTube or Twitch stream URL"
                    className="w-full bg-pov-bg border border-pov-border rounded-lg px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors"
                    autoFocus
                  />
                  <p className="text-[10px] text-pov-muted/50 mt-1.5">
                    Not streaming yet?{' '}
                    <Link to="/setup" className="text-pov-accent hover:underline">Setup guide →</Link>
                  </p>
                </div>
                {createError && (
                  <p className="text-xs text-pov-danger bg-pov-danger/10 border border-pov-danger/20 rounded-lg px-3 py-2">
                    {createError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={createLoading}
                  className="w-full bg-pov-accent hover:bg-pov-accent/85 disabled:opacity-50 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all hover:shadow-md hover:shadow-pov-accent/20"
                >
                  {createLoading ? 'Creating…' : 'Go Live'}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Join card */}
        <div
          className={`rounded-xl border transition-all overflow-hidden ${
            activePanel === 'join'
              ? 'border-pov-accent/40 bg-pov-surface shadow-lg shadow-pov-accent/5'
              : 'border-pov-border bg-pov-surface hover:border-pov-accent/20'
          }`}
        >
          <button
            onClick={() => togglePanel('join')}
            className="w-full flex items-center gap-4 p-5 text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-pov-success/10 flex items-center justify-center text-pov-success flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-pov-text text-sm">Join Session</p>
                <kbd className="hidden sm:inline text-[9px] text-pov-muted/50 bg-pov-bg border border-pov-border rounded px-1.5 py-0.5 font-mono">
                  Ctrl+K
                </kbd>
              </div>
              <p className="text-xs text-pov-muted mt-0.5">Enter a code or paste an invite link</p>
            </div>
          </button>

          {activePanel === 'join' && (
            <div className="px-5 pb-5 border-t border-pov-border/50 pt-4 animate-in">
              <form onSubmit={handleJoin} className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => { setJoinInput(e.target.value); setJoinError(''); }}
                  placeholder="Join code or link"
                  className="flex-1 bg-pov-bg border border-pov-border rounded-lg px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors font-mono"
                  autoFocus
                />
                <button
                  type="submit"
                  className="bg-pov-accent hover:bg-pov-accent/85 text-white font-semibold rounded-lg px-6 py-2.5 text-sm transition-all hover:shadow-md hover:shadow-pov-accent/20 flex-shrink-0"
                >
                  Join
                </button>
              </form>
              {joinError && <p className="text-xs text-pov-danger mt-2">{joinError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Your Live Sessions — personal content first ───── */}
      {hasLive && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.04s' }}>
          <h2 className="text-xs font-mono text-pov-success uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
            Your Live Sessions
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveSessions.map((s) => (
              <LiveSessionCard key={s.id} session={s} userId={user.id} />
            ))}
          </div>
        </div>
      )}

      {/* ── Recent sessions — grid of cards ──────────────── */}
      {hasRecent && (
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.055s' }}>
          <h2 className="text-xs font-mono text-pov-muted uppercase tracking-wider mb-3">Recent Sessions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentSessions.map((s) => (
              <RecentSessionCard key={s.id} session={s} userId={user.id} />
            ))}
          </div>
        </div>
      )}

      {/* ── Get Started — visible when no sessions, even when Create/Join is open ── */}
      {isEmpty && (
        <div className="animate-in mb-6 sm:mb-8" style={{ animationDelay: '0.04s' }}>
          {/* Big CTA empty state */}
          <div className="text-center py-10 sm:py-12 mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-pov-accent/10 border border-pov-accent/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-pov-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">No sessions yet</h3>
            <p className="text-sm text-pov-muted max-w-sm mx-auto mb-6">
              Create a session with your YouTube or Twitch stream and invite your squad to watch together.
            </p>
            <button
              onClick={() => togglePanel('create')}
              className="bg-pov-accent hover:bg-pov-accent/85 text-white font-semibold rounded-xl px-8 py-3 text-sm transition-all hover:shadow-lg hover:shadow-pov-accent/25 hover:-translate-y-0.5"
            >
              Create your first session
            </button>
          </div>

          {/* Feature highlights */}
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '🎯', title: 'Perfect Sync', desc: 'UTC-based sync keeps everyone on the same frame' },
              { icon: '👥', title: 'Squad Ready', desc: 'Up to 8 POVs in a single session, switch freely' },
              { icon: '🔒', title: 'Private Sessions', desc: 'Only people with your invite link can join' },
            ].map((f) => (
              <div key={f.title} className="bg-pov-surface border border-pov-border rounded-xl p-5 text-center">
                <span className="text-2xl mb-3 block">{f.icon}</span>
                <p className="text-sm font-semibold text-pov-text mb-1">{f.title}</p>
                <p className="text-xs text-pov-muted leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Social Feed — collapsible, below personal content ── */}
      <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.07s' }}>
        {/* Section toggle header */}
        <button
          onClick={() => setShowSocial((v) => !v)}
          className="w-full flex items-center gap-3 mb-4 group text-left"
        >
          <svg
            className={`w-3.5 h-3.5 text-pov-muted transition-transform duration-200 ${showSocial ? 'rotate-0' : '-rotate-90'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          <h2 className="text-xs font-mono text-pov-muted uppercase tracking-wider group-hover:text-pov-text transition-colors">
            Social Feed
          </h2>
          {hasSocialContent && (
            <span className="text-[10px] font-mono text-pov-accent bg-pov-accent/10 rounded-full px-2 py-0.5">
              {followingIds.length} following
              {followingLiveSessions.length > 0 && ` · ${followingLiveSessions.length} live`}
            </span>
          )}
          {!hasSocialContent && (
            <span className="text-[10px] text-pov-muted/60">Find friends & see their streams</span>
          )}
        </button>

        {showSocial && (
          <div className="space-y-6 animate-in">
            {/* Following Live Now */}
            {followingLiveSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-pov-success uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
                  Following Live Now
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {followingLiveSessions.map((session) => (
                    <LiveSessionCard key={`following-live-${session.id}`} session={session} userId={user.id} />
                  ))}
                </div>
              </div>
            )}

            {/* Following VODs */}
            {followingRecentSessions.length > 0 && (
              <div>
                <h3 className="text-xs font-mono text-pov-accent uppercase tracking-wider mb-3">Following VODs</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {followingRecentSessions.map((session) => (
                    <RecentSessionCard key={`following-vod-${session.id}`} session={session} userId={user.id} />
                  ))}
                </div>
              </div>
            )}

            {/* Discover People + Following — two-column grid */}
            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-mono text-pov-accent uppercase tracking-wider">Discover People</p>
                    <p className="text-sm text-pov-muted mt-1">Find friends by display name and follow them.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search display names"
                    className="w-full bg-pov-bg border border-pov-border rounded-lg px-4 py-2.5 text-sm text-pov-text placeholder:text-pov-muted/40 focus:outline-none focus:border-pov-accent transition-colors"
                  />

                  {searchQuery.trim().length > 0 && (
                    <div className="rounded-xl border border-pov-border/60 bg-pov-bg/40 p-3">
                      {searchLoading ? (
                        <p className="text-xs text-pov-muted">Searching people…</p>
                      ) : searchError ? (
                        <p className="text-xs text-pov-danger">{searchError}</p>
                      ) : searchResults.length > 0 ? (
                        <div className="space-y-2">
                          {searchResults.map((result) => {
                            const isFollowing = followingIdSet.has(result.id);
                            return (
                              <div key={result.id} className="flex items-center justify-between gap-3 rounded-lg border border-pov-border/60 bg-pov-surface/60 px-3 py-2.5">
                                <Link to={`/profile/${result.id}`} className="min-w-0 flex flex-1 items-center gap-3">
                                  <Avatar profile={result} size="sm" />
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-pov-text hover:text-pov-accent transition-colors">{result.display_name}</p>
                                    <p className="text-[11px] text-pov-muted">Member since {memberSince(result.created_at)}</p>
                                  </div>
                                </Link>
                                <FollowButton
                                  compact
                                  busy={socialBusyUserId === result.id}
                                  isFollowing={isFollowing}
                                  onClick={() => handleToggleFollow(result.id, !isFollowing)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : searchQuery.trim().length >= 2 ? (
                        <p className="text-xs text-pov-muted">No matching people yet. Try another display name.</p>
                      ) : (
                        <p className="text-xs text-pov-muted">Type at least 2 characters to search.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-mono text-pov-success uppercase tracking-wider">Following</p>
                    <p className="text-sm text-pov-muted mt-1">People you follow power your live + VOD feed.</p>
                  </div>
                  <span className="text-[10px] font-mono text-pov-muted bg-pov-bg border border-pov-border rounded-full px-2.5 py-1">
                    {followingIds.length}
                  </span>
                </div>

                {followingProfiles.length > 0 ? (
                  <div className="space-y-2">
                    {followingProfiles.map((profileItem) => (
                      <Link
                        key={profileItem.id}
                        to={`/profile/${profileItem.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-pov-border/60 bg-pov-bg/40 px-3 py-2.5 hover:border-pov-accent/20 transition-colors"
                      >
                        <div className="min-w-0 flex items-center gap-3">
                          <Avatar profile={profileItem} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-pov-text">{profileItem.display_name}</p>
                            <p className="text-[11px] text-pov-muted">Open profile</p>
                          </div>
                        </div>
                        <span className="text-xs font-mono text-pov-accent">→</span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-pov-border px-4 py-6 text-center text-sm text-pov-muted">
                    Follow a few friends to build your feed.
                  </div>
                )}

                {socialError && (
                  <p className="mt-3 text-xs text-pov-danger">{socialError}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ profile, size = 'md' }) {
  const classes = size === 'sm' ? 'h-10 w-10 rounded-lg' : 'h-12 w-12 rounded-xl';

  if (profile.avatar_url) {
    return <img src={profile.avatar_url} alt="" className={`${classes} object-cover ring-1 ring-pov-border/50`} />;
  }

  return (
    <div className={`${classes} flex items-center justify-center bg-pov-accent/15 text-sm font-mono text-pov-accent`}>
      {(profile.display_name?.[0] ?? '?').toUpperCase()}
    </div>
  );
}

function QuickActionCard({ title, description, actionLabel, to, onClick }) {
  const content = (
    <div className="h-full rounded-lg border border-pov-border/60 bg-pov-bg/60 p-4 hover:border-pov-accent/25 transition-colors">
      <h4 className="text-sm font-semibold text-pov-text">{title}</h4>
      <p className="text-xs text-pov-muted mt-1.5 leading-relaxed">{description}</p>
      <span className="inline-flex mt-4 text-xs font-medium text-pov-accent">{actionLabel} →</span>
    </div>
  );

  if (onClick) {
    return (
      <button onClick={onClick} className="text-left">
        {content}
      </button>
    );
  }

  return <Link to={to} className="block">{content}</Link>;
}

/* ── Live session card ──────────────────────────────────────── */

function LiveSessionCard({ session, userId }) {
  const streams = (session.streams || []).filter((stream) => stream.is_active !== false);
  const isHost = session.host_id === userId;
  const hostStream = streams.find((s) => s.user_id === session.host_id);
  const hostName = hostStream?.display_name ?? hostStream?.users?.display_name ?? 'Host';
  const pips = streams.slice(0, 5);

  return (
    <Link
      to={`/session/${session.id}`}
      className="group relative bg-pov-surface border border-pov-success/30 rounded-xl p-5 hover:border-pov-success/50 transition-all overflow-hidden hover:-translate-y-0.5 hover:shadow-lg hover:shadow-pov-success/10"
    >
      {/* Green glow */}
      <div className="absolute -top-10 -right-10 w-28 h-28 bg-pov-success/[0.08] rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center gap-1.5 text-[10px] font-mono text-pov-success bg-pov-success/10 rounded-full px-2.5 py-1">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
            LIVE
          </span>
          <span className="text-[10px] font-mono text-pov-muted">{duration(session.created_at)}</span>
        </div>

        <div className="flex items-center gap-2.5 mb-3">
          <div className="flex -space-x-2">
            {pips.map((stream) =>
              stream.users?.avatar_url ? (
                <img
                  key={stream.id}
                  src={stream.users.avatar_url}
                  alt=""
                  title={stream.users.display_name ?? stream.display_name}
                  className="w-8 h-8 rounded-full border-2 border-pov-surface object-cover"
                />
              ) : (
                <div
                  key={stream.id}
                  title={stream.display_name}
                  className="w-8 h-8 rounded-full border-2 border-pov-surface bg-pov-border flex items-center justify-center text-[10px] font-mono text-pov-muted"
                >
                  {(stream.display_name?.[0] ?? '?').toUpperCase()}
                </div>
              )
            )}
          </div>
          <span className="text-sm text-pov-text font-semibold">
            {streams.length} POV{streams.length !== 1 ? 's' : ''}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-pov-muted font-mono truncate max-w-[70%]">
            {session.title || (isHost ? 'You are hosting' : `Hosted by ${hostName}`)}
          </span>
          <span className="text-xs text-pov-accent opacity-0 group-hover:opacity-100 transition-opacity font-medium">
            Rejoin →
          </span>
        </div>
      </div>
    </Link>
  );
}

/* ── Recent session card (grid card, not row) ───────────────── */

function RecentSessionCard({ session, userId }) {
  const streams = session.status === 'live'
    ? (session.streams || []).filter((stream) => stream.is_active !== false)
    : (session.streams || []);
  const pips = streams.slice(0, 4);
  const extra = streams.length - 4;
  const isHost = session.host_id === userId;

  const dateStr = new Date(session.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });

  return (
    <Link
      to={`/session/${session.id}`}
      className="group bg-pov-surface border border-pov-border rounded-xl p-5 hover:border-pov-muted transition-all hover:-translate-y-0.5 hover:shadow-md hover:shadow-pov-bg/50"
    >
      {/* Avatars */}
      <div className="flex items-center gap-2.5 mb-3">
        <div className="flex -space-x-2">
          {pips.map((stream) =>
            stream.users?.avatar_url ? (
              <img
                key={stream.id}
                src={stream.users.avatar_url}
                alt=""
                className="w-7 h-7 rounded-full border-2 border-pov-surface object-cover"
              />
            ) : (
              <div
                key={stream.id}
                className="w-7 h-7 rounded-full border-2 border-pov-surface bg-pov-border flex items-center justify-center text-[9px] font-mono text-pov-muted"
              >
                {(stream.display_name?.[0] ?? '?').toUpperCase()}
              </div>
            )
          )}
          {extra > 0 && (
            <div className="w-7 h-7 rounded-full border-2 border-pov-surface bg-pov-bg flex items-center justify-center text-[9px] font-mono text-pov-muted">
              +{extra}
            </div>
          )}
        </div>
        <span className="text-[10px] font-mono text-pov-muted/60 bg-pov-muted/10 rounded px-1.5 py-0.5">
          VOD
        </span>
      </div>

      {/* Session info */}
      <p className="text-sm text-pov-text font-medium group-hover:text-pov-accent transition-colors truncate mb-1">
        {session.title || streams.map((s) => s.display_name).join(', ') || 'Session'}
      </p>
      <p className="text-[11px] text-pov-muted font-mono">
        {streams.length} POV{streams.length !== 1 ? 's' : ''}
        <span className="mx-1.5 text-pov-border">·</span>
        {session.ended_at ? duration(session.created_at, session.ended_at) : dateStr}
        {isHost && <><span className="mx-1.5 text-pov-border">·</span>hosted</>}
      </p>
    </Link>
  );
}
