// Apply the saved theme before Vue loads. Extension pages cannot use inline JS.
(() => {
  const root = document.documentElement;
  let snapshot;
  try {
    const raw = localStorage.getItem('midori_boot_snapshot_v1');
    if (raw && new Blob([raw]).size <= 4096) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1) snapshot = parsed;
    }
  } catch { /* Use the default theme when storage is unavailable. */ }

  let theme = snapshot?.theme === 'dark' ? 'dark' : 'light';
  if (snapshot?.autoTheme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  root.dataset.theme = theme;
  root.dataset.density = snapshot?.density === 'compact' ? 'compact' : 'comfortable';
  const vars = snapshot?.themeVars?.[theme];
  if (vars && typeof vars === 'object') {
    for (const [key, value] of Object.entries(vars)) {
      if (/^--[a-z0-9-]{1,40}$/.test(key) && typeof value === 'string' && value.length <= 100) {
        root.style.setProperty(key, value);
      }
    }
  }
})();
