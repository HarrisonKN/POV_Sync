import { Link, useLocation } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useActiveSession } from '../hooks/useActiveSession';

export default function Navbar() {
  const { user, profile, loading, signInWithGoogle, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const { activeSession } = useActiveSession();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const onSessionPage  = location.pathname.startsWith('/session/');
  const onSetupPage    = location.pathname === '/setup';
  const onProfilePage  = location.pathname.startsWith('/profile');
  const showReturnPill = activeSession && !onSessionPage;

  // Close dropdown on outside click or route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <nav className="border-b border-pov-border/40 bg-pov-bg/85 backdrop-blur-md sticky top-0 z-50">
      {/* Subtle top-edge highlight for a "premium panel" feel */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-pov-accent/30 to-transparent pointer-events-none" aria-hidden="true" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">

        {/* ── Left: Logo + nav links ─────────────────────────── */}
        <div className="flex items-center gap-3 sm:gap-5 min-w-0">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-pov-accent/25 to-pov-accent/10 ring-1 ring-pov-accent/20 flex items-center justify-center shadow-sm shadow-pov-accent/10 transition-all group-hover:ring-pov-accent/40 group-hover:shadow-pov-accent/25">
              <svg className="w-4 h-4 text-pov-accent" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight text-pov-text group-hover:text-pov-accent transition-colors">
              POV<span className="text-pov-accent">Sync</span>
            </span>
          </Link>

          {/* Divider */}
          <div className="hidden sm:block w-px h-4 bg-pov-border/60 flex-shrink-0" aria-hidden="true" />

          {/* Active Session — return pill */}
          {showReturnPill && (
            <Link
              to={`/session/${activeSession.id}`}
              className="flex items-center gap-1.5 text-xs font-mono bg-pov-success/10 border border-pov-success/30 text-pov-success rounded-full px-3 py-1 hover:bg-pov-success/20 transition-colors truncate max-w-[200px] sm:max-w-none"
            >
              <span className="live-dot w-1.5 h-1.5 rounded-full bg-pov-success flex-shrink-0" />
              <span className="truncate hidden sm:inline">Return to Session</span>
              <span className="truncate sm:hidden">Live →</span>
            </Link>
          )}

          {/* Setup Guide — with active indicator */}
          <Link
            to="/setup"
            className={[
              'relative text-xs transition-colors hidden sm:inline flex-shrink-0 py-1',
              onSetupPage
                ? 'text-pov-accent font-medium'
                : 'text-pov-muted hover:text-pov-text',
            ].join(' ')}
          >
            Setup Guide
            {/* Active underline */}
            {onSetupPage && (
              <span className="absolute -bottom-[1px] inset-x-0 h-0.5 rounded-full bg-pov-accent" />
            )}
          </Link>
        </div>

        {/* ── Right: utility group + divider + identity group ── */}
        <div className="flex items-center gap-1 flex-shrink-0">

          {/* ── Utility group: theme toggle ───────────────────── */}
          <div className="flex items-center">
            <button
              onClick={toggle}
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-pov-muted hover:text-pov-text hover:bg-pov-surface/80 transition-colors"
            >
              {isDark ? (
                /* Sun */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                /* Moon */
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
          </div>

          {/* ── Divider between utility and identity ─────────── */}
          <div className="w-px h-5 bg-pov-border/50 mx-1.5 flex-shrink-0" aria-hidden="true" />

          {/* ── Identity group: avatar trigger + dropdown ──── */}
          {loading ? (
            <div className="w-8 h-8 rounded-full bg-pov-border/60 animate-pulse" />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              {/* Avatar button — toggles dropdown */}
              <button
                onClick={() => setMenuOpen(o => !o)}
                aria-haspopup="true"
                aria-expanded={menuOpen}
                aria-label="Open user menu"
                className={[
                  'flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors',
                  onProfilePage || menuOpen ? 'bg-pov-surface/70' : 'hover:bg-pov-surface/60',
                ].join(' ')}
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className={[
                      'w-7 h-7 rounded-full ring-2 transition-all',
                      onProfilePage || menuOpen ? 'ring-pov-accent' : 'ring-pov-border',
                    ].join(' ')}
                  />
                ) : (
                  <div className={[
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono text-pov-accent ring-2 transition-all',
                    onProfilePage || menuOpen ? 'bg-pov-accent/25 ring-pov-accent' : 'bg-pov-accent/15 ring-pov-border',
                  ].join(' ')}>
                    {(profile?.display_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <span className={[
                  'text-sm hidden sm:inline transition-colors',
                  onProfilePage || menuOpen ? 'text-pov-text' : 'text-pov-muted',
                ].join(' ')}>
                  {profile?.display_name || user.email}
                </span>
                {/* Chevron */}
                <svg
                  className={[
                    'w-3 h-3 text-pov-muted transition-transform duration-200 hidden sm:block',
                    menuOpen ? 'rotate-180' : '',
                  ].join(' ')}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Dropdown panel */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-2 w-52 glass-panel border border-pov-border/60 rounded-xl shadow-xl shadow-black/20 overflow-hidden z-50 animate-in">
                  {/* User identity header */}
                  <div className="px-4 py-3 border-b border-pov-border/40">
                    <p className="text-xs font-semibold text-pov-text truncate">
                      {profile?.display_name || 'Your Account'}
                    </p>
                    <p className="text-[11px] text-pov-muted truncate mt-0.5">{user.email}</p>
                  </div>

                  {/* Nav items */}
                  <div className="py-1.5">
                    <DropdownLink
                      to="/profile"
                      active={onProfilePage}
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                      }
                      label="Profile"
                    />
                    <DropdownLink
                      to="/setup"
                      active={onSetupPage}
                      icon={
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                        </svg>
                      }
                      label="Setup Guide"
                    />
                  </div>

                  {/* Divider + sign out */}
                  <div className="border-t border-pov-border/40 py-1.5">
                    <button
                      onClick={() => { setMenuOpen(false); signOut(); }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-sm text-pov-muted hover:text-pov-danger hover:bg-pov-danger/8 transition-colors text-left"
                    >
                      <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                      </svg>
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={signInWithGoogle}
              className="bg-pov-accent hover:bg-pov-accent/85 text-white text-sm font-medium rounded-lg px-4 py-2 transition-all hover:shadow-md hover:shadow-pov-accent/20"
            >
              Sign in
            </button>
          )}
        </div>

      </div>
    </nav>
  );
}

function DropdownLink({ to, icon, label, active }) {
  return (
    <Link
      to={to}
      className={[
        'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
        active
          ? 'text-pov-accent bg-pov-accent/8 font-medium'
          : 'text-pov-muted hover:text-pov-text hover:bg-pov-surface/60',
      ].join(' ')}
    >
      <span className={active ? 'text-pov-accent' : 'text-pov-muted'}>{icon}</span>
      {label}
      {active && <span className="ml-auto w-1 h-1 rounded-full bg-pov-accent flex-shrink-0" />}
    </Link>
  );
}
