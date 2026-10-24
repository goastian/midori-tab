const CACHE_KEY = 'midori_wallpaper_previews_v1';
const MAX_BYTES = 512 * 1024;
const MAX_ENTRY_BYTES = 128 * 1024;
const MAX_ENTRIES = 8;

function readEntries() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw || raw.length > MAX_BYTES || new Blob([raw]).size > MAX_BYTES) return [];
    const cache = JSON.parse(raw);
    if (cache?.version !== 1 || !Array.isArray(cache.entries)) return [];
    return cache.entries.filter(entry => typeof entry?.key === 'string' && entry.key.length <= 4096
      && typeof entry.dataUrl === 'string' && entry.dataUrl.length <= MAX_ENTRY_BYTES
      && /^data:image\/(?:jpeg|webp);base64,[a-z\d+/=]+$/i.test(entry.dataUrl));
  } catch { return []; }
}

export function readWallpaperPreview(key) {
  return readEntries().find(entry => entry.key === key)?.dataUrl || '';
}

export async function cacheWallpaperPreview(key, image) {
  if (!key || key.length > 4096 || !image?.naturalWidth || !image?.naturalHeight) return;
  try {
    const cached = readWallpaperPreview(key);
    if (cached) {
      const preview = new Image();
      preview.src = cached;
      try { await preview.decode(); return; } catch { removeWallpaperPreview(key); }
    }
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    let size = 1024;
    let dataUrl = '';
    while (size >= 256) {
      const scale = Math.min(1, size / Math.max(image.naturalWidth, image.naturalHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.74);
      if (dataUrl.length <= MAX_ENTRY_BYTES) break;
      size = Math.floor(size * 0.7);
    }
    if (!dataUrl || dataUrl.length > MAX_ENTRY_BYTES) return;
    const entries = readEntries().filter(entry => entry.key !== key);
    entries.push({ key, dataUrl, updatedAt: Date.now() });
    let raw = JSON.stringify({ version: 1, entries });
    while (entries.length > MAX_ENTRIES || new Blob([raw]).size > MAX_BYTES) {
      entries.shift();
      raw = JSON.stringify({ version: 1, entries });
    }
    localStorage.setItem(CACHE_KEY, raw);
  } catch { /* Cross-origin pixels or unavailable storage must not affect the visible image. */ }
}

export function removeWallpaperPreview(key) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1,
      entries: readEntries().filter(entry => entry.key !== key) }));
  } catch { /* Optional preview cache. */ }
}

export function removeWallpaperPreviews(prefix) {
  try {
    const entries = readEntries().filter(entry => !entry.key.startsWith(prefix));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ version: 1, entries }));
  } catch { /* Optional preview cache. */ }
}

function previewSource(key) {
  try {
    const url = new URL(key);
    if (url.hostname !== 'images.unsplash.com') return key;
    url.searchParams.set('w', '1024');
    return url.href;
  } catch { return key; }
}

/**
 * Stores the first-frame preview of a wallpaper that has not been shown yet,
 * so the next new tab can paint it before the full image is requested.
 */
export async function prewarmWallpaperPreview(key, signal) {
  if (!key || signal?.aborted || navigator.connection?.saveData || readWallpaperPreview(key)) return false;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.fetchPriority = 'low';
  const onAbort = () => { image.src = ''; };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    image.src = previewSource(key);
    await image.decode();
    if (signal?.aborted) return false;
    await cacheWallpaperPreview(key, image);
    return Boolean(readWallpaperPreview(key));
  } catch { return false; }
  finally { signal?.removeEventListener('abort', onAbort); }
}
