import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useActiveSession } from '../hooks/useActiveSession';

export default function Navbar() {
  const { user, profile, loading, signInWithGoogle, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const { activeSession } = useActiveSession();
  const location = useLocation();

  // Don't show the "Return to Session" pill when already on that session's page
  const onSessionPage = location.pathname.startsWith('/session/');
  const showReturnPill = activeSession && !onSessionPage;

  return (
    <nav className="border-b border-pov-border/50 bg-pov-bg/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        {/* Logo + nav links */}
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="w-7 h-7 rounded-lg bg-pov-accent/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-pov-accent" fill="currentColor" viewBox="0 0 20 20">
                <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
              </svg>
            </div>
            <span className="text-base font-bold tracking-tight text-pov-text group-hover:text-pov-accent transition-colors">
              POV<span className="text-pov-accent">Sync</span>
            </span>
          </Link>

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

          <Link
            to="/setup"
            className="text-xs text-pov-muted hover:text-pov-text transition-colors hidden sm:inline flex-shrink-0"
          >
            Setup Guide
          </Link>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            aria-label="Toggle theme"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-pov-muted hover:text-pov-text hover:bg-pov-surface transition-colors"
          >
            {isDark ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          {loading ? (
            <div className="w-8 h-8 rounded-full bg-pov-border animate-pulse" />
          ) : user ? (
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link
                to="/profile"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity rounded-lg px-2 py-1.5 hover:bg-pov-surface"
              >
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="w-7 h-7 rounded-full ring-2 ring-pov-border"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-pov-accent/15 flex items-center justify-center text-xs font-mono text-pov-accent">
                    {(profile?.display_name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                  </div>
                )}
                <span className="text-sm text-pov-muted hidden sm:inline">
                  {profile?.display_name || user.email}
                </span>
              </Link>
              <button
                onClick={signOut}
                className="text-xs text-pov-muted hover:text-pov-text rounded-lg px-2 sm:px-3 py-1.5 hover:bg-pov-surface transition-colors"
              >
                <span className="hidden sm:inline">Sign out</span>
                <span className="sm:hidden">✕</span>
              </button>
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
