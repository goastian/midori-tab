// Apply the saved theme before Vue loads. Extension pages cannot use inline JS.
(() => {
  const root = document.documentElement;
  let settle;
  const hold = () => {
    if (!root.hasAttribute('data-resizing')) root.setAttribute('data-resizing', '');
    clearTimeout(settle);
    settle = setTimeout(() => root.removeAttribute('data-resizing'), 200);
  };
  addEventListener('resize', hold, { passive: true });
  document.addEventListener('visibilitychange', hold);
  function saved(key, limit) {
    try {
      const raw = localStorage.getItem(key);
      return raw && raw.length <= limit ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  let snapshot;
  try {
    const raw = localStorage.getItem('midori_boot_snapshot_v1');
    if (raw && new Blob([raw]).size <= 4096) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1) snapshot = parsed;
    }
  } catch { /* Use the default theme when storage is unavailable. */ }
  if (!snapshot) {
    try {
      const raw = localStorage.getItem('tabStore');
      if (raw && raw.length <= 16384) snapshot = JSON.parse(raw);
    } catch { /* Legacy preferences may not be available. */ }
  }

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

  const background = snapshot?.background || saved('tabStore', 16384)?.background;
  const type = background?.type || snapshot?.backgroundType || 'Unsplash';
  if (type === 'Solid' && !background?.default && CSS.supports('color', background?.color || '')) {
    root.style.setProperty('--midori-start-color', background.color);
  }
  if (type === 'Gradient' && background?.default) {
    const palettes = {
      light: { orange: '#ff7b7f, #ff595e, #e0484c', green: '#8dc63f, #d4ff88', deal: '#0984e3, #00cec9', purple: '#be1c7d, #f78fc3' },
      dark: { orange: '#e0484c, #ff595e, #8b2c2f', green: '#8dc63f, #3a5311', deal: '#0984e3, #004a7c', purple: '#be1c7d, #4b1037' },
    };
    const name = typeof background.class === 'string' ? background.class.replace(/^bg-/, '') : '';
    if (palettes[theme][name]) root.style.setProperty('--midori-start-background', `linear-gradient(135deg, ${palettes[theme][name]})`);
  }
  if (!['Unsplash', 'MarketplaceWallpaper'].includes(type)) return;
  const cache = saved('midori_wallpaper_previews_v1', 512 * 1024);
  if (cache?.version !== 1 || !Array.isArray(cache.entries)) return;
  let selected;
  if (type === 'Unsplash') {
    const payload = saved('unsplash_cache_images', 75000);
    const list = Array.isArray(payload) ? payload : payload?.value;
    if (Array.isArray(list) && list.length) {
      const selectedIndex = Math.max(0, Number(localStorage.getItem('unsplash_cache_index')) || 0) % list.length;
      const meta = list[selectedIndex];
      if (meta?.url) selected = { type, key: meta.url, url: meta.url, selectedIndex, meta };
    }
  } else {
    const key = background?.previewUrl || background?.imageUrl || background?.downloadUrl;
    if (key) selected = { type, key, url: key };
  }
  const entry = selected && cache.entries.find(item => item?.key === selected.key);
  if (typeof entry?.dataUrl !== 'string' || entry.dataUrl.length > 128 * 1024
    || !/^data:image\/(?:jpeg|webp|png);base64,[a-z\d+/=]+$/i.test(entry.dataUrl)) return;
  window.__midoriEarlyWallpaper = { ...selected, dataUrl: entry.dataUrl };
  root.style.setProperty('--midori-start-background', `url("${entry.dataUrl}")`);
  const logos = saved('midori_wallpaper_logo_v1', 8192);
  const logo = Array.isArray(logos) && logos.find(item => item?.key === selected.key
    && item.width === innerWidth && item.height === innerHeight && item.theme === theme
    && item.density === root.dataset.density);
  if (logo && ['light', 'green'].includes(logo.tone)) {
    root.dataset.logoTone = logo.tone;
    root.dataset.logoOutline = String(Boolean(logo.outline));
  }
})();
