import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { supabase } from '../lib/supabase';
import SessionResumeCard from '../components/SessionResumeCard';

const MAX_AVATAR_PIPS = 4;
const TABS = ['All', 'Hosted', 'Joined', 'VODs'];

export default function Profile() {
  const { userId } = useParams();
  const { user, profile: ownProfile } = useAuth();
  const { activeSession } = useActiveSession();

  const [profile, setProfile] = useState(null);
  const [hostedSessions, setHostedSessions] = useState([]);
  const [participatedSessions, setParticipatedSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  const isOwnProfile = !userId || userId === user?.id;
  const targetUserId = userId || user?.id;

  useEffect(() => {
    async function fetchProfile() {
      if (!targetUserId) { setLoading(false); return; }

      try {
        setHostedSessions([]);
        setParticipatedSessions([]);

        if (isOwnProfile && ownProfile) {
          setProfile(ownProfile);
        } else {
          const { data } = await supabase
            .from('users')
            .select('*')
            .eq('id', targetUserId)
            .single();
          setProfile(data);
        }

        const { data: hosted } = await supabase
          .from('sessions')
          .select('*, streams(id, display_name, user_id, is_active, left_at, users(avatar_url, display_name))')
          .eq('host_id', targetUserId)
          .order('created_at', { ascending: false });
        setHostedSessions(hosted || []);

        const { data: streamRows } = await supabase
          .from('streams')
          .select('session_id')
          .eq('user_id', targetUserId);

        if (streamRows?.length > 0) {
          const sessionIds = [...new Set(streamRows.map((s) => s.session_id))];
          const { data: participated } = await supabase
            .from('sessions')
            .select('*, streams(id, display_name, user_id, is_active, left_at, users(avatar_url, display_name))')
            .in('id', sessionIds)
            .order('created_at', { ascending: false });
          setParticipatedSessions(participated || []);
        } else {
          setParticipatedSessions([]);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [targetUserId, isOwnProfile, ownProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-pov-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-lg mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold mb-4">Profile Not Found</h1>
      </div>
    );
  }

  /* ── derived data ────────────────────────────────────────── */

  const allSessions = (() => {
    const map = new Map();
    hostedSessions.forEach((s) => map.set(s.id, s));
    participatedSessions.forEach((s) => { if (!map.has(s.id)) map.set(s.id, s); });
    return [...map.values()].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  })();

  const vodSessions = allSessions.filter((s) => s.status === 'ended');
  const liveSessions = allSessions.filter((s) => s.status === 'live');
  const latestVod = vodSessions[0] || null;

  const filteredSessions =
    activeTab === 'All' ? allSessions
    : activeTab === 'Hosted' ? hostedSessions
    : activeTab === 'Joined' ? participatedSessions
    : vodSessions;

  const memberSince = profile.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 animate-in">
      {/* ── Profile header — horizontal layout ──────────── */}
      <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-6 mb-4 sm:mb-6">
        <div className="flex items-center gap-4 sm:gap-5">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl ring-2 ring-pov-accent/20 flex-shrink-0"
            />
          ) : (
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl bg-pov-accent/15 flex items-center justify-center text-xl sm:text-2xl font-mono text-pov-accent flex-shrink-0">
              {(profile.display_name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate">{profile.display_name}</h1>
            <div className="flex items-center gap-2 sm:gap-3 mt-1 text-xs sm:text-sm text-pov-muted">
              {isOwnProfile && <span className="truncate">{profile.email}</span>}
              {memberSince && <span className="text-[10px] sm:text-xs hidden sm:inline">· Member since {memberSince}</span>}
            </div>
          </div>

          {/* Stats inline on large screens */}
          <div className="hidden sm:flex items-center gap-4">
            <StatPill label="Sessions" value={allSessions.length} />
            <StatPill label="Hosted" value={hostedSessions.length} />
            <StatPill label="VODs" value={vodSessions.length} />
            {liveSessions.length > 0 && (
              <StatPill label="Live" value={liveSessions.length} accent />
            )}
          </div>
        </div>

        {isOwnProfile && activeSession && (
          <div className="mt-4">
            <SessionResumeCard
              session={activeSession}
              to={user?.id === activeSession.host_id ? `/session/${activeSession.id}` : `/session/${activeSession.id}?pov=${user.id}`}
              title="You have a live session running"
              subtitle="Jump back in from your profile if you navigated away."
              compact
            />
          </div>
        )}

        {/* Stats row on mobile */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-5 sm:hidden">
          <StatCard label="Total Sessions" value={allSessions.length} />
          <StatCard label="Hosted" value={hostedSessions.length} />
          <StatCard label="VODs" value={vodSessions.length} accent={vodSessions.length > 0} />
        </div>
      </div>

      {/* ── Live-now banner ───────────────────────────────── */}
      {liveSessions.length > 0 && (
        <div className="bg-pov-success/10 border border-pov-success/20 rounded-xl px-4 sm:px-5 py-4 mb-6 animate-in">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-mono text-pov-success flex items-center gap-2">
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
              Currently Live
            </p>
            {isOwnProfile && activeSession && (
              <Link
                to={`/session/${activeSession.id}`}
                className="text-xs font-mono text-pov-success hover:underline"
              >
                Return to current session →
              </Link>
            )}
          </div>
          <div className="space-y-1.5">
            {liveSessions.map((s) => (
              <Link
                key={s.id}
                to={`/session/${s.id}?pov=${targetUserId}`}
                className="flex items-center justify-between gap-3 text-sm text-pov-text hover:text-pov-accent transition-colors rounded-lg px-2 py-1 hover:bg-pov-success/10"
              >
                <span className="truncate">
                  {(s.streams || []).map((st) => st.display_name).join(', ') || 'Session'}
                </span>
                <span className="text-[10px] text-pov-muted font-mono ml-2 flex-shrink-0">
                  {(s.streams || []).length} POV{(s.streams || []).length !== 1 ? 's' : ''}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent VOD spotlight ───────────────────────────── */}
      {latestVod && (
        <div className="bg-pov-accent/10 border border-pov-accent/20 rounded-xl px-4 sm:px-5 py-4 mb-6 animate-in">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-mono text-pov-accent flex items-center gap-2">
              <span>📼</span>
              Latest VOD
            </p>
            <Link
              to={`/session/${latestVod.id}?pov=${targetUserId}`}
              className="text-xs font-mono text-pov-accent hover:underline"
            >
              Open replay →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="text-sm text-pov-text font-medium truncate">
                {(latestVod.streams || []).map((st) => st.display_name).join(', ') || 'Archived session'}
              </p>
              <p className="text-xs text-pov-muted mt-1">
                Saved {latestVod.ended_at ? new Date(latestVod.ended_at).toLocaleString() : 'recently'}
                {' '}· {latestVod.streams?.length || 0} POV{(latestVod.streams?.length || 0) !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/session/${latestVod.id}?pov=${targetUserId}`}
                className="inline-flex items-center justify-center text-xs font-semibold bg-pov-accent text-white rounded-lg px-3 py-2 hover:bg-pov-accent/90 transition-colors"
              >
                Watch VOD
              </Link>
              <button
                onClick={() => setActiveTab('VODs')}
                className="inline-flex items-center justify-center text-xs font-mono text-pov-accent border border-pov-accent/20 rounded-lg px-3 py-2 hover:bg-pov-accent/10 transition-colors"
              >
                View all VODs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab bar ──────────────────────────────────── */}
      <div className="flex gap-1 mb-4 sm:mb-5 border-b border-pov-border overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors relative ${
              activeTab === tab
                ? 'text-pov-accent'
                : 'text-pov-muted hover:text-pov-text'
            }`}
          >
            {tab}
            {activeTab === tab && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-pov-accent rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* ── Session grid ───────────────────────────────────── */}
      {filteredSessions.length > 0 ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 animate-in-stagger">
          {filteredSessions.map((session) => (
            <SessionCard key={session.id} session={session} targetUserId={targetUserId} />
          ))}
        </div>
      ) : (
        <EmptyState tab={activeTab} isOwnProfile={isOwnProfile} />
      )}
    </div>
  );
}

/* ── Stat pill (inline, for desktop header) ─────────────────── */

function StatPill({ label, value, accent }) {
  return (
    <div className="text-center px-4 py-2 bg-pov-bg rounded-lg border border-pov-border/50">
      <p className={`text-lg font-bold font-mono ${accent ? 'text-pov-success' : 'text-pov-text'}`}>{value}</p>
      <p className="text-[10px] text-pov-muted uppercase tracking-wider">{label}</p>
    </div>
  );
}

/* ── Stat card (mobile) ─────────────────────────────────────── */

function StatCard({ label, value, accent }) {
  return (
    <div className="bg-pov-bg border border-pov-border/50 rounded-lg px-4 py-3 text-center">
      <p className={`text-xl font-bold font-mono ${accent ? 'text-pov-success' : 'text-pov-text'}`}>
        {value}
      </p>
      <p className="text-[10px] text-pov-muted uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────── */

function EmptyState({ tab, isOwnProfile }) {
  const messages = {
    All: isOwnProfile
      ? { text: 'No sessions yet.', action: 'Create your first session', to: '/' }
      : { text: 'No sessions found.' },
    Hosted: isOwnProfile
      ? { text: "You haven't hosted any sessions.", action: 'Host one now', to: '/' }
      : { text: 'No hosted sessions.' },
    Joined: isOwnProfile
      ? { text: "You haven't joined any sessions yet.", action: 'Ask a friend for an invite link' }
      : { text: 'No joined sessions.' },
    VODs: isOwnProfile
      ? { text: 'No saved VODs yet.', action: 'End a live session to archive it here.' }
      : { text: 'No VODs found.' },
  };
  const msg = messages[tab] || messages.All;

  return (
    <div className="text-center py-16 text-pov-muted">
      <p className="text-sm mb-2">{msg.text}</p>
      {msg.action && msg.to && (
        <Link to={msg.to} className="text-sm text-pov-accent hover:underline">{msg.action} →</Link>
      )}
      {msg.action && !msg.to && (
        <p className="text-xs text-pov-muted/60">{msg.action}</p>
      )}
    </div>
  );
}

/* ── Session card (grid version) ────────────────────────────── */

function SessionCard({ session, targetUserId }) {
  const allStreams = session.streams || [];
  const streams = session.status === 'live'
    ? allStreams.filter((stream) => stream.is_active !== false)
    : allStreams;
  const isLive  = session.status === 'live';
  const isVod   = session.status === 'ended';
  const [povExpanded, setPovExpanded] = useState(false);

  const href = `/session/${session.id}?pov=${targetUserId}`;
  const pips = streams.slice(0, MAX_AVATAR_PIPS);
  const extra = streams.length - MAX_AVATAR_PIPS;

  const dateStr = new Date(session.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className={`bg-pov-surface border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
      isLive ? 'border-pov-success/30 hover:border-pov-success/50' : 'border-pov-border hover:border-pov-muted'
    }`}>
      <Link to={href} className="block p-4 group">
        {/* Avatar pips + badge */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex -space-x-1.5 flex-shrink-0">
            {pips.map((stream) =>
              stream.users?.avatar_url ? (
                <img
                  key={stream.id}
                  src={stream.users.avatar_url}
                  alt={stream.users.display_name ?? stream.display_name}
                  title={stream.users.display_name ?? stream.display_name}
                  className="w-7 h-7 rounded-full border-2 border-pov-surface object-cover"
                />
              ) : (
                <div
                  key={stream.id}
                  title={stream.display_name}
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
          <span
            className={`text-[10px] font-mono px-2 py-0.5 rounded ${
              isLive
                ? 'bg-pov-success/15 text-pov-success'
                : 'bg-pov-muted/10 text-pov-muted'
            }`}
          >
            {isLive ? '● LIVE' : 'VOD'}
          </span>
        </div>

        {/* Info */}
        <p className="text-sm text-pov-text font-medium group-hover:text-pov-accent transition-colors truncate mb-1">
          {streams.length} POV{streams.length !== 1 ? 's' : ''} · {dateStr}
        </p>
        {streams.length > 0 && (
          <p className="text-[11px] text-pov-muted font-mono truncate">
            {streams.map((s) => s.display_name).join(', ')}
          </p>
        )}

        {isLive && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-pov-success">
            <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success" />
            Rejoin live session
          </div>
        )}

        {isVod && (
          <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-mono text-pov-accent">
            <span>📼</span>
            Watch VOD
          </div>
        )}
      </Link>

      {/* VOD per-POV switcher */}
      {isVod && streams.length > 1 && (
        <div className="border-t border-pov-border/50">
          <button
            onClick={() => setPovExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-mono text-pov-muted hover:text-pov-text transition-colors"
          >
            <span>Watch a specific POV</span>
            <span>{povExpanded ? '▲' : '▼'}</span>
          </button>

          {povExpanded && (
            <div className="px-3 pb-3 flex flex-wrap gap-1.5">
              {streams.map((stream) => {
                const povHref = `/session/${session.id}?pov=${stream.user_id}`;
                const isOwner = stream.user_id === targetUserId;
                return (
                  <Link
                    key={stream.id}
                    to={povHref}
                    className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-lg border transition-colors ${
                      isOwner
                        ? 'border-pov-accent/50 text-pov-accent bg-pov-accent/10 hover:bg-pov-accent/20'
                        : 'border-pov-border text-pov-muted hover:border-pov-muted hover:text-pov-text'
                    }`}
                  >
                    {stream.users?.avatar_url && (
                      <img src={stream.users.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                    )}
                    {stream.display_name}
                    {isOwner && <span className="text-[9px] opacity-70">· you</span>}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
