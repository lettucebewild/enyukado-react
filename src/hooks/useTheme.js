import { useSyncExternalStore } from 'react';

// Light / dark theme. The choice is saved in localStorage and applied as
// <html data-theme="dark">. index.html also applies it before React loads so
// there is no light flash on refresh.
const KEY = 'enyukado-theme';
const listeners = new Set();

function read() {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}

let current = read();
document.documentElement.setAttribute('data-theme', current);

export function setTheme(next) {
  current = next;
  try { localStorage.setItem(KEY, next); } catch { /* private mode: just don't persist */ }
  const root = document.documentElement;
  // Brief class so colors glide between themes instead of snapping.
  root.classList.add('theme-anim');
  root.setAttribute('data-theme', next);
  setTimeout(() => root.classList.remove('theme-anim'), 450);
  listeners.forEach((l) => l());
}

function subscribe(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => current, () => 'light');
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
