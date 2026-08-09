import { readBootSnapshot } from './bootSnapshot.js';

function resolveInitialTheme() {
  const snapshot = readBootSnapshot();
  if (snapshot) {
    let theme = snapshot.theme || 'light';
    if (snapshot.autoTheme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return { theme, density: snapshot.density || 'comfortable' };
  }

  try {
    const raw = localStorage.getItem('tabStore');
    if (!raw) {
      return null;
    }

    const state = JSON.parse(raw);
    if (!state || typeof state !== 'object') {
      return null;
    }

    let theme = state.theme || 'light';
    if (state.autoTheme) {
      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    return { theme, density: state.density || 'comfortable' };
  } catch {
    return null;
  }
}

export default function applyInitialTheme() {
  const resolved = resolveInitialTheme();
  if (resolved) {
    document.documentElement.setAttribute('data-theme', resolved.theme);
    document.documentElement.setAttribute('data-density', resolved.density);
  }
}