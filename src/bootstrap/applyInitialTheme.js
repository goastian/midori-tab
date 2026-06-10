function resolveInitialTheme() {
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

    return theme;
  } catch {
    return null;
  }
}

export default function applyInitialTheme() {
  const theme = resolveInitialTheme();
  if (theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }
}
