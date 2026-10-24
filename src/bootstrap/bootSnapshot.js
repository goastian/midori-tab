/**
 * PERF-105 — Snapshot de arranque.
 *
 * Un único objeto versionado y acotado con lo que necesita el primer frame:
 * tema, modo automático, densidad y tipo de fondo. Se escribe desde un
 * $subscribe del tabStore y se lee de forma síncrona en el boot sin parsear
 * el store completo (que también persiste widgets, bookmarks y caches).
 */
const BOOT_SNAPSHOT_KEY = 'midori_boot_snapshot_v1';
const MAX_SNAPSHOT_BYTES = 4096;

function readBootSnapshot() {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw || new Blob([raw]).size > MAX_SNAPSHOT_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (!snapshot || typeof snapshot !== 'object' || snapshot.version !== 1) {
      return null;
    }
    return snapshot;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot) {
  try {
    const encode = () => JSON.stringify(snapshot);
    let raw = encode();
    if (new Blob([raw]).size > MAX_SNAPSHOT_BYTES) {
      const variant = document.documentElement.dataset.theme || snapshot.theme;
      snapshot.themeVars = { [variant]: snapshot.themeVars?.[variant] || {} };
      raw = encode();
    }
    if (new Blob([raw]).size > MAX_SNAPSHOT_BYTES) {
      for (const key of ['previewUrl', 'imageUrl', 'downloadUrl']) delete snapshot.background?.[key];
      raw = encode();
    }
    if (new Blob([raw]).size <= MAX_SNAPSHOT_BYTES) localStorage.setItem(BOOT_SNAPSHOT_KEY, raw);
  } catch { /* Storage may be unavailable. */ }
}

function writeBootSnapshot(state) {
  const previous = readBootSnapshot();
  const imageKey = ['previewUrl', 'imageUrl', 'downloadUrl'].find(key => state.background?.[key]);
  const snapshot = {
    version: 1,
    theme: state.theme || 'light',
    autoTheme: Boolean(state.autoTheme),
    density: state.density || 'comfortable',
    backgroundType: state.background?.type || 'Unsplash',
    background: Object.fromEntries(['type', 'default', 'color', 'class', imageKey]
      .filter(key => typeof state.background?.[key] === 'boolean'
        || (typeof state.background?.[key] === 'string' && state.background[key].length <= 1200
          && !state.background[key].startsWith('blob:')))
      .map(key => [key, state.background[key]])),
    themeId: previous?.themeId || 'midori',
    themeVars: previous?.themeVars || {},
  };
  saveSnapshot(snapshot);
}

function writeThemeBootVars(variant, vars, themeId = 'midori') {
  if (!['light', 'dark'].includes(variant)) return;
  const safe = {};
  for (const [key, value] of Object.entries(vars || {})) {
    if (/^--(?:color|surface|theme)-[a-z0-9-]{1,32}$/.test(key)
      && typeof value === 'string' && value.length <= 100
      && /^[#(),.%\w\s+-]+$/.test(value)) safe[key] = value;
  }
  const previous = readBootSnapshot() || { version: 1, theme: variant, autoTheme: false, density: 'comfortable', backgroundType: 'Unsplash' };
  const sameTheme = previous.themeId === themeId;
  const snapshot = { ...previous, themeId, themeVars: { ...(sameTheme ? previous.themeVars : {}), [variant]: safe } };
  saveSnapshot(snapshot);
}

export { BOOT_SNAPSHOT_KEY, MAX_SNAPSHOT_BYTES, readBootSnapshot, writeBootSnapshot, writeThemeBootVars };
