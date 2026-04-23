import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { supabase } from '../lib/supabase';
import SessionResumeCard from '../components/SessionResumeCard';
import FollowButton from '../components/FollowButton';
import { fetchFollowLists, fetchProfileSessions, followUser, unfollowUser } from '../lib/social';
import ProfileSkeleton from '../components/ProfileSkeleton';
import ConfirmModal from '../components/ConfirmModal';

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
  const [network, setNetwork] = useState({
    followers: [],
    following: [],
    followerCount: 0,
    followingCount: 0,
    viewerFollowsTarget: false,
  });
  const [followBusy, setFollowBusy] = useState(false);

  const isOwnProfile = !userId || userId === user?.id;
  const targetUserId = userId || user?.id;

  const loadNetwork = useCallback(async () => {
    if (!targetUserId) return;
    const summary = await fetchFollowLists(targetUserId, user?.id);
    setNetwork(summary);
  }, [targetUserId, user?.id]);

  useEffect(() => {
    async function fetchProfile() {
      if (!targetUserId) { setLoading(false); return; }

      try {
        setHostedSessions([]);
        setParticipatedSessions([]);

        const profilePromise = isOwnProfile && ownProfile
          ? Promise.resolve(ownProfile)
          : supabase
              .from('users')
              .select('*')
              .eq('id', targetUserId)
              .single()
              .then(({ data }) => data);

        const [profileData, sessionData, followSummary] = await Promise.all([
          profilePromise,
          fetchProfileSessions(targetUserId),
          fetchFollowLists(targetUserId, user?.id),
        ]);

        setProfile(profileData);
        setHostedSessions(sessionData.hostedSessions);
        setParticipatedSessions(sessionData.participatedSessions);
        setNetwork(followSummary);
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [targetUserId, isOwnProfile, ownProfile, user?.id]);

  const handleFollowToggle = useCallback(async () => {
    if (!user?.id || !targetUserId || isOwnProfile) return;

    setFollowBusy(true);
    try {
      if (network.viewerFollowsTarget) {
        await unfollowUser(user.id, targetUserId);
      } else {
        await followUser(user.id, targetUserId);
      }

      await loadNetwork();
    } catch (err) {
      console.error('Error updating follow state:', err);
    } finally {
      setFollowBusy(false);
    }
  }, [isOwnProfile, loadNetwork, network.viewerFollowsTarget, targetUserId, user?.id]);

  if (loading) {
    return <ProfileSkeleton />;
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
            {!isOwnProfile && user && (
              <div className="mt-3 sm:hidden">
                <FollowButton
                  busy={followBusy}
                  isFollowing={network.viewerFollowsTarget}
                  onClick={handleFollowToggle}
                />
              </div>
            )}
          </div>

          {/* Stats inline on large screens */}
          <div className="hidden sm:flex flex-wrap items-center justify-end gap-3">
            <StatPill label="Sessions" value={allSessions.length} />
            <StatPill label="Hosted" value={hostedSessions.length} />
            <StatPill label="VODs" value={vodSessions.length} />
            <StatPill label="Followers" value={network.followerCount} />
            <StatPill label="Following" value={network.followingCount} />
            {liveSessions.length > 0 && (
              <StatPill label="Live" value={liveSessions.length} accent />
            )}
            {!isOwnProfile && user && (
              <FollowButton
                busy={followBusy}
                isFollowing={network.viewerFollowsTarget}
                onClick={handleFollowToggle}
              />
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
        <div className="grid grid-cols-2 gap-2 sm:gap-3 mt-4 sm:mt-5 sm:hidden">
          <StatCard label="Total Sessions" value={allSessions.length} />
          <StatCard label="Hosted" value={hostedSessions.length} />
          <StatCard label="VODs" value={vodSessions.length} accent={vodSessions.length > 0} />
          <StatCard label="Followers" value={network.followerCount} />
          <StatCard label="Following" value={network.followingCount} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 mb-6 animate-in">
        <NetworkCard
          title="Followers"
          count={network.followerCount}
          profiles={network.followers}
          emptyText={isOwnProfile ? 'When people follow you, they show up here.' : 'No followers yet.'}
        />
        <NetworkCard
          title="Following"
          count={network.followingCount}
          profiles={network.following}
          emptyText={isOwnProfile ? 'Follow creators to build your rediscoverable feed.' : `${profile.display_name} is not following anyone yet.`}
        />
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
              <span>VOD</span>
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
            <SessionCard
              key={session.id}
              session={session}
              targetUserId={targetUserId}
              isOwner={isOwnProfile}
              onDeleted={(id) => {
                setHostedSessions((prev) => prev.filter((s) => s.id !== id));
                setParticipatedSessions((prev) => prev.filter((s) => s.id !== id));
              }}
            />
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

function NetworkCard({ title, count, profiles, emptyText }) {
  return (
    <div className="bg-pov-surface border border-pov-border rounded-xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-wider text-pov-muted">{title}</p>
          <p className="text-sm text-pov-muted mt-1">{count} total</p>
        </div>
      </div>

      {profiles.length > 0 ? (
        <div className="space-y-2">
          {profiles.slice(0, 6).map((entry) => (
            <Link
              key={entry.id}
              to={`/profile/${entry.id}`}
              className="flex items-center gap-3 rounded-lg border border-pov-border/60 bg-pov-bg/50 px-3 py-2.5 hover:border-pov-accent/20 transition-colors"
            >
              {entry.avatar_url ? (
                <img src={entry.avatar_url} alt="" className="w-10 h-10 rounded-lg object-cover ring-1 ring-pov-border/60" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-pov-accent/15 flex items-center justify-center text-sm font-mono text-pov-accent">
                  {(entry.display_name?.[0] ?? '?').toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-pov-text">{entry.display_name}</p>
                <p className="text-[11px] text-pov-muted">Open profile</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-pov-border px-4 py-6 text-center text-sm text-pov-muted">
          {emptyText}
        </div>
      )}
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

function SessionCard({ session, targetUserId, isOwner = false, onDeleted }) {
  const { user } = useAuth();
  const allStreams = session.streams || [];
  const streams = session.status === 'live'
    ? allStreams.filter((stream) => stream.is_active !== false)
    : allStreams;
  const isLive  = session.status === 'live';
  const isVod   = session.status === 'ended';
  const [povExpanded, setPovExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef(null);

  const href = `/session/${session.id}?pov=${targetUserId}`;
  const pips = streams.slice(0, MAX_AVATAR_PIPS);
  const extra = streams.length - MAX_AVATAR_PIPS;

  const dateStr = new Date(session.created_at).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to delete session');
      }
      onDeleted?.(session.id);
    } catch (err) {
      setDeleteError(err.message);
      setConfirmOpen(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
    <ConfirmModal
      open={confirmOpen}
      title="Delete session?"
      message={`This will permanently delete this session and all its POVs. This cannot be undone.`}
      confirmLabel={deleting ? 'Deleting…' : 'Delete'}
      destructive
      onConfirm={handleDelete}
      onCancel={() => setConfirmOpen(false)}
    />
    <div className={`bg-pov-surface border rounded-xl overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md ${
      isLive ? 'border-pov-success/30 hover:border-pov-success/50' : 'border-pov-border hover:border-pov-muted'
    }`}>
      {deleteError && (
        <div className="px-4 pt-3 text-xs text-red-400 font-mono">{deleteError}</div>
      )}
      <Link to={href} className="block p-4 group">
        {/* Avatar pips + badge + options menu */}
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
          <div className="flex items-center gap-1.5">
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                isLive
                  ? 'bg-pov-success/15 text-pov-success'
                  : 'bg-pov-muted/10 text-pov-muted'
              }`}
            >
              {isLive ? '● LIVE' : 'VOD'}
            </span>
            {isOwner && isVod && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
                  className="p-1 rounded-md text-pov-muted hover:text-pov-text hover:bg-pov-border/40 transition-colors"
                  aria-label="Session options"
                >
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.2" />
                    <circle cx="8" cy="8" r="1.2" />
                    <circle cx="8" cy="13" r="1.2" />
                  </svg>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-1 z-20 min-w-[140px] bg-pov-surface border border-pov-border rounded-xl shadow-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen(false); setConfirmOpen(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      Delete session
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
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
            <span>VOD</span>
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
    </>
  );
}
