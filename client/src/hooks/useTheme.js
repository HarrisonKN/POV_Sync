import { useState, useEffect, useCallback } from 'react';

/**
 * Manages dark / light theme via a class on <html>.
 * Persists to localStorage under 'pov-theme'.
 */
export function useTheme() {
  const [theme, setThemeState] = useState(() => {
    // Already applied by inline script in index.html, just read it
    if (typeof window !== 'undefined') {
      return localStorage.getItem('pov-theme') || 'dark';
    }
    return 'dark';
  });

  const setTheme = useCallback((next) => {
    const value = typeof next === 'function' ? next(theme) : next;
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(value);
    localStorage.setItem('pov-theme', value);
    setThemeState(value);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  return { theme, setTheme, toggle, isDark: theme === 'dark' };
}
