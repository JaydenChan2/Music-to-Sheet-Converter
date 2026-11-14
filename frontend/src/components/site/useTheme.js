import { useCallback, useEffect, useState } from 'react';

// index.html sets data-theme before first paint; this hook keeps it in sync.
// With no saved choice, the site follows the system setting live.
const KEY = 'theme';
const META = { light: '#ffffff', dark: '#08090b' };

function saved() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[theme]);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => {
      if (saved()) return;
      const next = e.matches ? 'dark' : 'light';
      apply(next);
      setTheme(next);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      apply(next);
      try {
        localStorage.setItem(KEY, next);
      } catch {
        // storage unavailable - the choice lasts for this visit only
      }
      return next;
    });
  }, []);

  return [theme, toggle];
}
