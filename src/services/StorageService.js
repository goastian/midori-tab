const DEFAULT_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 600;
const timers = new Map();
const queues = new Map();

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

function snapshotJsonValue(value) {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? null : JSON.parse(serialized);
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
    getPayloadTimestamp(secondary) >= getPayloadTimestamp(primary) ? secondary : primary,
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

export async function getJson(key, fallback = null, options = {}) {
  const localPayload = readLocalStoragePayload(key);
  const storage = getExtensionStorage();
  if (storage?.get) {
    try {
      const result = await storageGet(storage, key);
      return pickNewestPayload(result?.[key], localPayload, fallback);
    } catch (error) {
      if (options.strictRead && localPayload === undefined) {
        reportFailure(key, error);
        throw error;
      }
      return unwrapPayload(localPayload, fallback);
    }
  }
  return unwrapPayload(localPayload, fallback);
}

export async function verifyJsonStored(key, expected) {
  const storage = getExtensionStorage();
  const payload = storage?.get
    ? (await storageGet(storage, key))?.[key]
    : readLocalStoragePayload(key);
  return isWrappedPayload(payload)
    && JSON.stringify(payload.value) === JSON.stringify(expected);
}

export async function quotaSafeSet(key, value, options = {}) {
  try {
    const payload = preparePayload(key, value, options);
    writeMirror(key, payload);
    return await enqueue(key, () => writeExtension(key, payload));
  } catch (error) {
    reportFailure(key, error);
    throw error;
  }
}

function preparePayload(key, value, options = {}) {
  const maxBytes = Number(options.maxBytes) || 0;
  const payload = wrapPayload(snapshotJsonValue(value), options.version || DEFAULT_VERSION);
  payload.updatedAt = Math.max(payload.updatedAt, getPayloadTimestamp(readLocalStoragePayload(key)) + 1);
  const serialized = JSON.stringify(payload);
  if (maxBytes > 0 && new Blob([serialized]).size > maxBytes) {
    throw new Error(`Storage payload for ${key} exceeds ${maxBytes} bytes.`);
  }
  return payload;
}

function writeMirror(key, payload) {
  try {
    localStorage.setItem(key, JSON.stringify(payload));
    return true;
  } catch (error) {
    if (!getExtensionStorage()?.set) throw error;
    return false;
  }
}

async function writeExtension(key, payload) {
  const storage = getExtensionStorage();
  if (!storage?.set) return true;
  await storageSet(storage, { [key]: payload });
  return true;
}

function enqueue(key, task) {
  const operation = (queues.get(key) || Promise.resolve()).then(task);
  const tail = operation.then(() => {}, () => {});
  queues.set(key, tail);
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key);
  });
  return operation;
}

function reportFailure(key, error) {
  console.error(`[StorageService] Could not save ${key}:`, error);
  if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
    window.__midoriStorageError = true;
    window.dispatchEvent(new CustomEvent('midori:storage-error', {
      detail: { key, message: error?.message || String(error) },
    }));
  }
}

function observed(promise) {
  promise.catch(() => {});
  return promise;
}

function settlePending(pending, result, error) {
  for (const waiter of pending.waiters) {
    if (error) waiter.reject(error);
    else waiter.resolve(result);
  }
}

export function setJsonDebounced(key, value, options = {}) {
  const delay = Number(options.delayMs) >= 0 ? Number(options.delayMs) : DEFAULT_DEBOUNCE_MS;
  let payload;
  try {
    payload = preparePayload(key, value, options);
    writeMirror(key, payload);
  } catch (error) {
    reportFailure(key, error);
    return observed(Promise.reject(error));
  }
  const previous = timers.get(key);
  if (previous) clearTimeout(previous.timer);

  const pending = {
    payload,
    waiters: previous?.waiters || [],
    timer: null,
  };
  const result = observed(new Promise((resolve, reject) => pending.waiters.push({ resolve, reject })));
  pending.timer = setTimeout(() => {
    if (timers.get(key) !== pending) return;
    timers.delete(key);
    enqueue(key, () => writeExtension(key, pending.payload)).then(
      value => settlePending(pending, value),
      error => { reportFailure(key, error); settlePending(pending, null, error); },
    );
  }, delay);
  timers.set(key, pending);
  return result;
}

export async function flushDebounced(key, value, options = {}) {
  let payload;
  try {
    payload = preparePayload(key, value, options);
    writeMirror(key, payload);
  } catch (error) {
    reportFailure(key, error);
    throw error;
  }
  const pending = timers.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    timers.delete(key);
  }
  try {
    const result = await enqueue(key, () => writeExtension(key, payload));
    if (pending) settlePending(pending, result);
    return result;
  } catch (error) {
    reportFailure(key, error);
    if (pending) settlePending(pending, null, error);
    throw error;
  }
}

export async function remove(key) {
  const pending = timers.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    timers.delete(key);
    settlePending(pending, null, new DOMException('Storage write cancelled by remove', 'AbortError'));
  }
  try {
    return await enqueue(key, async () => {
      const storage = getExtensionStorage();
      if (storage?.remove) await storageRemove(storage, key);
      localStorage.removeItem(key);
    });
  } catch (error) {
    reportFailure(key, error);
    throw error;
  }
}

export default {
  getJson,
  setJsonDebounced,
  flushDebounced,
  quotaSafeSet,
  remove,
};
