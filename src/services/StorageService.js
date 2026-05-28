const DEFAULT_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 600;
const timers = new Map();

function hasRuntimeLastError() {
  return typeof chrome !== 'undefined' && chrome.runtime?.lastError;
}

function getExtensionStorage() {
  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  return api?.storage?.local || null;
}

function usesPromiseStorage(storage) {
  return typeof browser !== 'undefined' && storage === browser?.storage?.local;
}

function storageGet(storage, key) {
  return new Promise((resolve, reject) => {
    try {
      if (usesPromiseStorage(storage)) {
        const maybePromise = storage.get(key);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        } else {
          resolve(maybePromise);
        }
        return;
      }

      if (typeof storage.get === 'function') {
        storage.get(key, (result) => {
          const lastError = hasRuntimeLastError();
          if (lastError) reject(new Error(lastError.message));
          else resolve(result);
        });
        return;
      }

      resolve(undefined);
    } catch (error) {
      reject(error);
    }
  });
}

function storageSet(storage, payload) {
  return new Promise((resolve, reject) => {
    try {
      if (usesPromiseStorage(storage)) {
        const maybePromise = storage.set(payload);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        } else {
          resolve(maybePromise);
        }
        return;
      }

      if (typeof storage.set === 'function') {
        storage.set(payload, () => {
          const lastError = hasRuntimeLastError();
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
        return;
      }

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

function storageRemove(storage, key) {
  return new Promise((resolve, reject) => {
    try {
      if (usesPromiseStorage(storage)) {
        const maybePromise = storage.remove(key);
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        } else {
          resolve(maybePromise);
        }
        return;
      }

      if (typeof storage.remove === 'function') {
        storage.remove(key, () => {
          const lastError = hasRuntimeLastError();
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
        return;
      }

      resolve();
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

function isWrappedPayload(payload) {
  return payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'value');
}

function getPayloadTimestamp(payload) {
  return isWrappedPayload(payload) && Number.isFinite(Number(payload.updatedAt)) ? Number(payload.updatedAt) : 0;
}

function pickNewestPayload(primary, secondary, fallback) {
  if (primary === undefined && secondary === undefined) return fallback;
  if (primary === undefined) return unwrapPayload(secondary, fallback);
  if (secondary === undefined) return unwrapPayload(primary, fallback);

  return unwrapPayload(
    getPayloadTimestamp(secondary) > getPayloadTimestamp(primary) ? secondary : primary,
    fallback,
  );
}

function readLocalStoragePayload(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return undefined;
    return JSON.parse(raw);
  } catch {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? undefined : raw;
    } catch {
      return undefined;
    }
  }
}

function writeLocalStorage(key, value, version = DEFAULT_VERSION) {
  try {
    localStorage.setItem(key, JSON.stringify(wrapPayload(value, version)));
  } catch {
    /* localStorage can be unavailable in restricted extension contexts. */
  }
}

export async function getJson(key, fallback = null) {
  const localPayload = readLocalStoragePayload(key);
  const storage = getExtensionStorage();
  if (storage?.get) {
    try {
      const result = await storageGet(storage, key);
      return pickNewestPayload(result?.[key], localPayload, fallback);
    } catch {
      return unwrapPayload(localPayload, fallback);
    }
  }
  return unwrapPayload(localPayload, fallback);
}

export async function quotaSafeSet(key, value, options = {}) {
  const version = options.version || DEFAULT_VERSION;
  const maxBytes = Number(options.maxBytes) || 0;
  const payload = wrapPayload(value, version);

  if (maxBytes > 0 && new Blob([JSON.stringify(payload)]).size > maxBytes) {
    throw new Error(`Storage payload for ${key} exceeds ${maxBytes} bytes.`);
  }

  writeLocalStorage(key, value, version);

  const storage = getExtensionStorage();
  if (storage?.set) {
    try {
      await storageSet(storage, { [key]: payload });
      return true;
    } catch (error) {
      console.warn(`[StorageService] chrome.storage write failed for ${key}:`, error);
    }
  }
  return true;
}

export function setJsonDebounced(key, value, options = {}) {
  const delay = Number(options.delayMs) >= 0 ? Number(options.delayMs) : DEFAULT_DEBOUNCE_MS;
  writeLocalStorage(key, value, options.version || DEFAULT_VERSION);
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
