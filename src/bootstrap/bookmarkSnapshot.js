const KEY = 'midori_bookmark_snapshot_v1';
const MAX_BYTES = 12 * 1024;

export function readBookmarkSnapshot() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || raw.length > MAX_BYTES || new Blob([raw]).size > MAX_BYTES) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot.version !== 1 || !Array.isArray(snapshot.categories)
      || !snapshot.categories.includes(snapshot.activeTab) || !Array.isArray(snapshot.items)) return null;
    return snapshot;
  } catch { return null; }
}

export function writeBookmarkSnapshot(categories, activeTab, items) {
  const snapshot = { version: 1, categories, activeTab,
    items: items.slice(0, 24).map(({ title, url, domain }) => ({ title, url, domain })) };
  try {
    const raw = JSON.stringify(snapshot);
    if (new Blob([raw]).size <= MAX_BYTES) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch { /* optional first-frame cache */ }
}
