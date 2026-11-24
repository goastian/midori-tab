import { adsApiBase, detectDeviceType, detectLanguage } from './adCreativeSnapshot.js';

const PREFIX = 'ads:catalog:visible:v1:';
const HIDDEN_PREFIX = 'ads:bookmarks:hidden:v1:';

export function normalizeCatalog(data, baseUrl = adsApiBase()) {
  if (data?.contract_version !== 'ads-bookmarks-v1' || !Array.isArray(data.bookmarks) || data.bookmarks.length > 128) return null;
  const keys = new Set();
  const bookmarks = [];
  try {
    const origin = new URL(baseUrl).origin;
    for (const item of data.bookmarks) {
      if (!item || !/^[a-z0-9][a-z0-9_-]{0,79}$/.test(item.key || '') || keys.has(item.key)
        || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120
        || typeof item.category !== 'string' || typeof item.default !== 'boolean' || typeof item.suggested !== 'boolean') return null;
      const url = new URL(item.url);
      const icon = new URL(item.icon_url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || icon.origin !== origin) return null;
      keys.add(item.key);
      bookmarks.push({ key: item.key, title: item.title, url: url.toString(), icon_url: icon.toString(),
        category: item.category, default: item.default, suggested: item.suggested });
    }
    return { contract_version: 'ads-bookmarks-v1', bookmarks, etag: typeof data.etag === 'string' ? data.etag : null };
  } catch { return null; }
}

function snapshotKey({ baseUrl = adsApiBase(), device_type = detectDeviceType(), language = detectLanguage() } = {}) {
  return `${PREFIX}${baseUrl}:${device_type}:${String(language).startsWith('es') ? 'es' : 'en'}`;
}

export function readCatalogSnapshot(context = {}) {
  try { return normalizeCatalog(JSON.parse(localStorage.getItem(snapshotKey(context))), context.baseUrl || adsApiBase()); }
  catch { return null; }
}

export function writeCatalogSnapshot(context, data) {
  const catalog = normalizeCatalog(data, context.baseUrl);
  if (catalog) try { localStorage.setItem(snapshotKey(context), JSON.stringify(catalog)); } catch { }
}

export function catalogCategory(bookmark, categories) {
  if (categories.includes(bookmark.category)) return bookmark.category;
  const category = bookmark.category.toLowerCase();
  if (category === 'travel') return 'Travel';
  if (['finance', 'web3', 'crypto'].includes(category)) return 'Web3';
  return 'Personal';
}

export function hiddenCatalogBookmarks() {
  try {
    const keys = JSON.parse(localStorage.getItem(HIDDEN_PREFIX + adsApiBase()) || '[]');
    return Array.isArray(keys) ? keys.filter(key => typeof key === 'string') : [];
  } catch { return []; }
}

export function hideCatalogBookmark(key) {
  const keys = [...new Set([...hiddenCatalogBookmarks(), key])];
  try { localStorage.setItem(HIDDEN_PREFIX + adsApiBase(), JSON.stringify(keys)); } catch { }
  return keys;
}
