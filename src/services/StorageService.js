const DEFAULT_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 600;
const timers = new Map();

function getExtensionStorage() {
  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  return api?.storage?.local || null;
}

function storageGet(storage, key) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = storage.get(key, (result) => {
        const lastError = typeof chrome !== 'undefined' ? chrome.runtime?.lastError : null;
        if (lastError) reject(new Error(lastError.message));
        else resolve(result);
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      } else if (storage.get.length < 2) {
        resolve(maybePromise);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function storageSet(storage, payload) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = storage.set(payload, () => {
        const lastError = typeof chrome !== 'undefined' ? chrome.runtime?.lastError : null;
        if (lastError) reject(new Error(lastError.message));
        else resolve();
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      } else if (storage.set.length < 2) {
        resolve(maybePromise);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function storageRemove(storage, key) {
  return new Promise((resolve, reject) => {
    try {
      const maybePromise = storage.remove(key, () => {
        const lastError = typeof chrome !== 'undefined' ? chrome.runtime?.lastError : null;
        if (lastError) reject(new Error(lastError.message));
        else resolve();
      });
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      } else if (storage.remove.length < 2) {
        resolve(maybePromise);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function wrapPayload(value, version = DEFAULT_VERSION) {
  return {
    __midoriStorageVersion: version,
    value,
    updatedAt: Date.now(),
  };
}

function unwrapPayload(payload, fallback) {
  if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'value')) {
    return payload.value;
  }
  return payload ?? fallback;
}

function readLocalStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return unwrapPayload(JSON.parse(raw), fallback);
  } catch {
    try {
      return localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }
}

function writeLocalStorage(key, value, version = DEFAULT_VERSION) {
  localStorage.setItem(key, JSON.stringify(wrapPayload(value, version)));
}

export async function getJson(key, fallback = null) {
  const storage = getExtensionStorage();
  if (storage?.get) {
    try {
      const result = await storageGet(storage, key);
      return unwrapPayload(result?.[key], fallback);
    } catch {
      return readLocalStorage(key, fallback);
    }
  }
  return readLocalStorage(key, fallback);
}

export async function quotaSafeSet(key, value, options = {}) {
  const version = options.version || DEFAULT_VERSION;
  const maxBytes = Number(options.maxBytes) || 0;
  const payload = wrapPayload(value, version);

  if (maxBytes > 0 && new Blob([JSON.stringify(payload)]).size > maxBytes) {
    throw new Error(`Storage payload for ${key} exceeds ${maxBytes} bytes.`);
  }

  const storage = getExtensionStorage();
  if (storage?.set) {
    try {
      await storageSet(storage, { [key]: payload });
      return true;
    } catch (error) {
      console.warn(`[StorageService] chrome.storage write failed for ${key}:`, error);
    }
  }

  writeLocalStorage(key, value, version);
  return true;
}

export function setJsonDebounced(key, value, options = {}) {
  const delay = Number(options.delayMs) >= 0 ? Number(options.delayMs) : DEFAULT_DEBOUNCE_MS;
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      timers.delete(key);
      quotaSafeSet(key, value, options).then(resolve, reject);
    }, delay);
    timers.set(key, timer);
  });
}

export async function flushDebounced(key, value, options = {}) {
  const previous = timers.get(key);
  if (previous) {
    clearTimeout(previous);
    timers.delete(key);
  }
  return quotaSafeSet(key, value, options);
}

export async function remove(key) {
  const previous = timers.get(key);
  if (previous) {
    clearTimeout(previous);
    timers.delete(key);
  }

  const storage = getExtensionStorage();
  if (storage?.remove) {
    try {
      await storageRemove(storage, key);
    } catch {
      /* fall through to localStorage cleanup */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export default {
  getJson,
  setJsonDebounced,
  flushDebounced,
  quotaSafeSet,
  remove,
};
