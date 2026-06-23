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

function isImageFile(file) {
  return Boolean(
    file &&
    typeof file.type === 'string' &&
    file.type.startsWith('image/') &&
    file.size > 0 &&
    file.size <= MAX_FILE_BYTES
  );
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

  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      store.clear();
      for (const file of files) {
        store.add({ name: file.name, type: file.type, blob: file });
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
      const request = store.count();
      request.onsuccess = () => resolve(request.result || 0);
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

    let records = [];
    try {
      records = await new Promise((resolve, reject) => {
        const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('Failed to read wallpapers'));
      });
    } catch (_) {
      records = [];
    } finally {
      db.close();
    }

    if (!records.length) {
      this.#url = '';
      return '';
    }

    const pick = records[Math.floor(Math.random() * records.length)];
    if (!pick || !pick.blob) {
      this.#url = '';
      return '';
    }

    this.#url = URL.createObjectURL(pick.blob);
    return this.#url;
  }
}
