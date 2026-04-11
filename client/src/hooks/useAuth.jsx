import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(null);
  const profileFetchedRef = useRef(null); // track which userId we've fetched for

  useEffect(() => {
    // Safety: ensure loading is false after 4 seconds no matter what
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 4000);

    // IMPORTANT: onAuthStateChange callback must NOT be async.
    // Supabase blocks the auth state machine if the callback returns a pending promise.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[Auth] onAuthStateChange:', event, session?.user?.id ?? 'no user');
        setUser(session?.user ?? null);
        setAccessToken(session?.access_token ?? null);

        if (session?.user) {
          // Defer profile fetch to avoid blocking the auth state machine
          // Only fetch if we haven't already fetched for this user
          if (profileFetchedRef.current !== session.user.id) {
            profileFetchedRef.current = session.user.id;
            fetchProfile(session.user.id);
          } else {
            // Already fetched profile for this user, just clear loading
            setLoading(false);
          }
        } else {
          setProfile(null);
          profileFetchedRef.current = null;
          setLoading(false);
        }
      }
    );

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  async function fetchProfile(userId) {
    console.log('[Auth] Fetching profile for', userId);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist yet — DB trigger creates it on first login
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const { data: retryData } = await supabase
          .from('users')
          .select('*')
          .eq('id', userId)
          .single();
        setProfile(retryData);
      } else if (error) {
        console.error('[Auth] Error fetching profile:', error);
      } else {
        console.log('[Auth] Profile loaded:', data?.display_name);
        setProfile(data);
      }
    } catch (err) {
      console.error('[Auth] Error fetching profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) console.error('Google sign-in error:', error);
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error('Sign-out error:', error);
    setUser(null);
    setProfile(null);
  }

  async function getAccessToken() {
    // First try the cached token (avoids hanging getSession calls)
    if (accessToken) return accessToken;
    // Fallback: try getSession with a timeout
    try {
      const result = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('getSession timeout')), 3000)),
      ]);
      const token = result.data?.session?.access_token ?? null;
      if (token) setAccessToken(token);
      return token;
    } catch (err) {
      console.error('[Auth] getAccessToken failed:', err);
      return null;
    }
  }

  const value = {
    user,
    profile,
    loading,
    signInWithGoogle,
    signOut,
    getAccessToken,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
