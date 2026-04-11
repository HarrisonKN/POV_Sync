import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

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

/* ── component ──────────────────────────────────────────────── */

export default function Home() {
  const { user, profile, signInWithGoogle, getAccessToken } = useAuth();
  const navigate = useNavigate();

  // Panel toggles
  const [activePanel, setActivePanel] = useState(null); // 'create' | 'join' | null

  // Create form
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Join form
  const [joinInput, setJoinInput] = useState('');
  const [joinError, setJoinError] = useState('');

  // Data
  const [liveSessions, setLiveSessions] = useState([]);
  const [recentSessions, setRecentSessions] = useState([]);
  const [publicLiveCount, setPublicLiveCount] = useState(0);

  /* ── Fetch data ────────────────────────────────────────── */

  useEffect(() => {
    if (!user) return;

    (async () => {
      try {
        const { count } = await supabase
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'live');
        setPublicLiveCount(count ?? 0);

        const { data: hosted } = await supabase
          .from('sessions')
          .select('id, status, created_at, ended_at, host_id, streams(id, display_name, user_id, youtube_url, users(avatar_url, display_name))')
          .eq('host_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        const { data: streamRows } = await supabase
          .from('streams')
          .select('session_id')
          .eq('user_id', user.id);

        let joined = [];
        if (streamRows?.length) {
          const ids = [...new Set(streamRows.map((s) => s.session_id))];
          const { data } = await supabase
            .from('sessions')
            .select('id, status, created_at, ended_at, host_id, streams(id, display_name, user_id, youtube_url, users(avatar_url, display_name))')
            .in('id', ids)
            .order('created_at', { ascending: false })
            .limit(10);
          joined = data || [];
        }

        const map = new Map();
        [...(hosted || []), ...joined].forEach((s) => { if (!map.has(s.id)) map.set(s.id, s); });
        const all = [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setLiveSessions(all.filter((s) => s.status === 'live'));
        setRecentSessions(all.filter((s) => s.status !== 'live').slice(0, 8));
      } catch { /* silent */ }
    })();
  }, [user]);

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
    if (!youtubeUrl.trim()) { setCreateError('Paste your YouTube stream URL'); return; }
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
          hostId: user.id,
          youtubeUrl: youtubeUrl.trim(),
          displayName: profile?.display_name || user.email,
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
                Sync your squad's YouTube streams in one view.
                Switch POVs instantly, never miss a play.
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={signInWithGoogle}
                  className="bg-pov-accent hover:bg-pov-accent/85 text-white font-semibold rounded-xl px-8 py-3.5 text-base transition-all hover:shadow-lg hover:shadow-pov-accent/25 hover:-translate-y-0.5"
                >
                  Get Started — it's free
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
                { icon: '📺', title: 'Multi-POV', desc: 'Up to 8 streams synced in one session' },
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
              ['01', 'Create', 'Paste your YouTube stream link & go live'],
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
      </div>
    );
  }

  /* ── signed-in dashboard — wide, grid-based ────────────── */

  const hasLive = liveSessions.length > 0;
  const hasRecent = recentSessions.length > 0;
  const isEmpty = !hasLive && !hasRecent && activePanel === null;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      {/* ── Top bar: greeting + live badge ──────────────────── */}
      <div className="flex items-center justify-between mb-6 sm:mb-8 animate-in">
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

      {/* ── Action cards — always visible, side by side ───── */}
      <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.03s' }}>
        {/* Create card */}
        <div
          className={`rounded-xl border transition-all overflow-hidden ${
            activePanel === 'create'
              ? 'border-pov-accent/40 bg-pov-surface shadow-lg shadow-pov-accent/5'
              : 'border-pov-border bg-pov-surface hover:border-pov-accent/20'
          }`}
        >
          <button
            onClick={() => togglePanel('create')}
            className="w-full flex items-center gap-4 p-5 text-left"
          >
            <div className="w-12 h-12 rounded-xl bg-pov-accent/10 flex items-center justify-center text-pov-accent flex-shrink-0">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-pov-text text-sm">Create Session</p>
              <p className="text-xs text-pov-muted mt-0.5">Start hosting with your YouTube stream</p>
            </div>
          </button>

          {activePanel === 'create' && (
            <div className="px-5 pb-5 border-t border-pov-border/50 pt-4 animate-in">
              <form onSubmit={handleCreate} className="space-y-3">
                <div>
                  <input
                    type="url"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
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

      {/* ── Live sessions — full-width attention-grabbing ─── */}
      {hasLive && (
        <div className="mb-8 animate-in" style={{ animationDelay: '0.06s' }}>
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
        <div className="mb-6 sm:mb-8 animate-in" style={{ animationDelay: '0.09s' }}>
          <h2 className="text-xs font-mono text-pov-muted uppercase tracking-wider mb-3">Recent Sessions</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentSessions.map((s) => (
              <RecentSessionCard key={s.id} session={s} userId={user.id} />
            ))}
          </div>
        </div>
      )}

      {/* ── Quick tips — fills space when no sessions ─────── */}
      {isEmpty && (
        <div className="animate-in" style={{ animationDelay: '0.06s' }}>
          {/* Big CTA empty state */}
          <div className="text-center py-12 mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-pov-accent/10 border border-pov-accent/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-pov-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 010 1.972l-11.54 6.347c-.75.412-1.667-.13-1.667-.986V5.653z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2">No sessions yet</h3>
            <p className="text-sm text-pov-muted max-w-sm mx-auto mb-6">
              Create a session with your YouTube stream and invite your squad to watch together.
            </p>
            <button
              onClick={() => togglePanel('create')}
              className="bg-pov-accent hover:bg-pov-accent/85 text-white font-semibold rounded-xl px-8 py-3 text-sm transition-all hover:shadow-lg hover:shadow-pov-accent/25 hover:-translate-y-0.5"
            >
              Create your first session
            </button>
          </div>

          {/* Feature highlights to fill the space */}
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
    </div>
  );
}

/* ── Live session card ──────────────────────────────────────── */

function LiveSessionCard({ session, userId }) {
  const streams = session.streams || [];
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
            {isHost ? 'You are hosting' : `Hosted by ${hostName}`}
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
  const streams = session.streams || [];
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
        {streams.map((s) => s.display_name).join(', ') || 'Session'}
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
