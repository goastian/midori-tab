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

function writeBootSnapshot(state) {
  const previous = readBootSnapshot();
  const snapshot = {
    version: 1,
    theme: state.theme || 'light',
    autoTheme: Boolean(state.autoTheme),
    density: state.density || 'comfortable',
    backgroundType: state.background?.type || 'Unsplash',
    themeId: previous?.themeId || 'midori',
    themeVars: previous?.themeVars || {},
  };
  try {
    const raw = JSON.stringify(snapshot);
    if (new Blob([raw]).size <= MAX_SNAPSHOT_BYTES) localStorage.setItem(BOOT_SNAPSHOT_KEY, raw);
  } catch {
    /* localStorage puede no estar disponible en contextos restringidos */
  }
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
  try {
    const raw = JSON.stringify(snapshot);
    if (new Blob([raw]).size <= MAX_SNAPSHOT_BYTES) localStorage.setItem(BOOT_SNAPSHOT_KEY, raw);
  } catch { /* storage may be unavailable */ }
}

export { BOOT_SNAPSHOT_KEY, MAX_SNAPSHOT_BYTES, readBootSnapshot, writeBootSnapshot, writeThemeBootVars };
