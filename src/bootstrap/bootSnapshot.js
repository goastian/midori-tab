/**
 * PERF-105 — Snapshot de arranque.
 *
 * Un único objeto versionado y acotado con lo que necesita el primer frame:
 * tema, modo automático, densidad y tipo de fondo. Se escribe desde un
 * $subscribe del tabStore y se lee de forma síncrona en el boot sin parsear
 * el store completo (que también persiste widgets, bookmarks y caches).
 */
const BOOT_SNAPSHOT_KEY = 'midori_boot_snapshot_v1';

function readBootSnapshot() {
  try {
    const raw = localStorage.getItem(BOOT_SNAPSHOT_KEY);
    if (!raw) return null;
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
  const snapshot = {
    version: 1,
    theme: state.theme || 'light',
    autoTheme: Boolean(state.autoTheme),
    density: state.density || 'comfortable',
    backgroundType: state.background?.type || 'Unsplash',
  };
  try {
    localStorage.setItem(BOOT_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    /* localStorage puede no estar disponible en contextos restringidos */
  }
}

export { BOOT_SNAPSHOT_KEY, readBootSnapshot, writeBootSnapshot };