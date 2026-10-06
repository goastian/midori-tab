/**
 * LocalWallpaperService — lets users use wallpapers from a folder on their own
 * computer for the New Tab background, as an alternative to Unsplash.
 *
 * The browser cannot persist arbitrary filesystem access across sessions in a
 * cross-browser way (the File System Access API is Chromium-only and unavailable
 * in Firefox), so instead the user selects a folder/images once and the chosen
 * images are stored as Blobs in IndexedDB. On each New Tab we pick a random
 * stored image and expose it as an object URL.
 *
 * Privacy: images never leave the device. They are only read locally and kept in
 * the extension's own IndexedDB.
 */

const DB_NAME = 'midori-local-wallpapers';
const STORE_NAME = 'images';
const DB_VERSION = 1;

// Keep storage bounded so a huge folder can't exhaust the quota.
const MAX_IMAGES = 30;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per image
const MAX_LIBRARY_BYTES = 80 * 1024 * 1024;
const MAX_DIMENSION = 10_000;
const MAX_PIXELS = 40_000_000;
const OUTPUT_DIMENSION = 1600;
const SMALL_DIMENSION = 960;

function isImageFile(file) {
  return Boolean(
    file &&
    typeof file.type === 'string' &&
    ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(file.type) &&
    file.size > 0 &&
    file.size <= MAX_FILE_BYTES
  );
}

async function prepareWallpaper(file) {
  let bitmap;
  let image;
  let objectUrl;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
      image = bitmap;
    } else {
      objectUrl = URL.createObjectURL(file);
      image = await new Promise((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('Invalid wallpaper image'));
        element.src = objectUrl;
      });
    }
    const width = image.width;
    const height = image.height;
    if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
      throw new Error('Wallpaper dimensions exceed the safe limit');
    }
    const encode = async maxDimension => {
      const scale = Math.min(1, maxDimension / Math.max(width, height));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));
      const canvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(targetWidth, targetHeight)
        : Object.assign(document.createElement('canvas'), { width: targetWidth, height: targetHeight });
      canvas.getContext('2d').drawImage(image, 0, 0, targetWidth, targetHeight);
      const blob = canvas.convertToBlob
        ? await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 })
        : await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.8));
      if (!blob || blob.size === 0 || blob.size > MAX_FILE_BYTES) throw new Error('Wallpaper could not be optimized');
      return { name: file.name, type: blob.type, blob, width: targetWidth, height: targetHeight };
    };
    const full = await encode(OUTPUT_DIMENSION);
    const small = Math.max(width, height) > SMALL_DIMENSION ? await encode(SMALL_DIMENSION) : null;
    return { full, small };
  } finally {
    bitmap?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

/**
 * Replace the stored local wallpapers with the provided image files.
 * Returns the number of images saved.
 */
export async function saveLocalWallpapers(fileList) {
  const files = Array.from(fileList || [])
    .filter(isImageFile)
    .slice(0, MAX_IMAGES);

  if (!files.length) return 0;

  const records = [];
  let totalBytes = 0;
  for (const [index, file] of files.entries()) {
    const variants = await prepareWallpaper(file);
    totalBytes += variants.full.blob.size + (variants.small?.blob.size || 0);
    if (totalBytes > MAX_LIBRARY_BYTES) throw new Error('Wallpaper library exceeds 80 MiB');
    records.push({ id: `full-${index}`, ...variants.full });
    if (variants.small) records.push({ id: `small-${index}`, ...variants.small });
  }
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const record of records) {
        store.add(record);
      }
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Failed to save wallpapers'));
      transaction.onabort = () => reject(transaction.error || new Error('Save aborted'));
    });
    return files.length;
  } finally {
    db.close();
  }
}

/** Count of stored local wallpapers. */
export async function countLocalWallpapers() {
  let db;
  try {
    db = await openDb();
  } catch (_) {
    return 0;
  }
  try {
    return await new Promise((resolve, reject) => {
      const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
      const request = store.getAllKeys();
      request.onsuccess = () => resolve((request.result || []).filter(key =>
        typeof key === 'number' || String(key).startsWith('full-')).length);
      request.onerror = () => reject(request.error || new Error('Failed to count wallpapers'));
    });
  } catch (_) {
    return 0;
  } finally {
    db.close();
  }
}

/** Remove every stored local wallpaper. */
export async function clearLocalWallpapers() {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('Failed to clear wallpapers'));
    });
  } finally {
    db.close();
  }
}

/**
 * Picks a random stored local wallpaper and exposes it as an object URL.
 * Mirrors the surface of UnsService so App.vue can consume it the same way.
 *
 * The returned object URL is owned by the caller, which must revoke it with
 * URL.revokeObjectURL once it is no longer displayed.
 */
export default class LocalWallpaperService {
  #url = '';

  getUrl() {
    return this.#url;
  }

  getSrcSet() {
    return '';
  }

  async setImagen() {
    let db;
    try {
      db = await openDb();
    } catch (_) {
      this.#url = '';
      return '';
    }

    let pick = null;
    try {
      pick = await new Promise((resolve, reject) => {
        const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
        const request = store.getAllKeys();
        request.onsuccess = () => {
          const keys = (request.result || []).filter(key =>
            typeof key === 'number' || String(key).startsWith('full-'));
          if (!keys.length) { resolve(null); return; }
          const fullKey = keys[Math.floor(Math.random() * keys.length)];
          const smallKey = `small-${String(fullKey).slice(5)}`;
          const selected = typeof fullKey === 'string' && window.innerWidth <= SMALL_DIMENSION
            && request.result.includes(smallKey) ? smallKey : fullKey;
          const read = store.get(selected);
          read.onsuccess = () => resolve(read.result || null);
          read.onerror = () => reject(read.error || new Error('Failed to read wallpaper'));
        };
        request.onerror = () => reject(request.error || new Error('Failed to read wallpapers'));
      });
    } catch (_) {
      pick = null;
    } finally {
      db.close();
    }

    if (!pick || !pick.blob) {
      this.#url = '';
      return '';
    }

    this.#url = URL.createObjectURL(pick.blob);
    return this.#url;
  }
}
