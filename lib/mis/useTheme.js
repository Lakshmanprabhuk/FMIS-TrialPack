import { useSyncExternalStore } from 'react';
import { THEMES, DEFAULT_THEME, applyTheme } from './themes';

const KEY = 'insightly-theme';
let current = DEFAULT_THEME;
let inited = false;
const subs = new Set();

function init() {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  try {
    const s = window.localStorage.getItem(KEY);
    if (s && THEMES[s]) current = s;
  } catch {
    /* storage unavailable */
  }
  applyTheme(current);
}

export function setTheme(k) {
  if (!THEMES[k]) return;
  init();
  current = k;
  try {
    window.localStorage.setItem(KEY, k);
  } catch {
    /* ignore */
  }
  applyTheme(k);
  subs.forEach((f) => f());
}

function subscribe(f) {
  init();
  subs.add(f);
  return () => subs.delete(f);
}
const snapshot = () => {
  init();
  return current;
};

// Returns [themeKey, setTheme]. Any component using it re-renders on change,
// and the CSS variables on <html> update for the whole app.
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, snapshot, () => DEFAULT_THEME);
  return [theme, setTheme];
}
