import { flushDebounced, getJson, setJsonDebounced } from './StorageService.js';
import { mirrorPayload, mirrorTimestamp, watchJson } from './storageWatch.js';
import { deepEqual } from './listMerge.js';

const SAVED_VISIBLE_MS = 1800;
const MAX_MERGE_ATTEMPTS = 3;

function clone(value) {
  return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function isQuotaError(error) {
  return /quota|exceeds \d+ bytes/i.test(`${error?.name || ''} ${error?.message || ''}`);
}

/** Timestamp of the payload held by extension storage itself, ignoring the mirror. */
async function storedTimestamp(key) {
  const area = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local;
  if (!area?.get) return 0;
  const result = globalThis.browser?.storage?.local
    ? await area.get(key)
    : await new Promise(resolve => area.get(key, resolve));
  return Number(result?.[key]?.updatedAt) || 0;
}

function describe(error) {
  return error?.message || String(error);
}

/**
 * One persisted record shared by every New Tab: strict hydration, saving that never runs before
 * the first read succeeded, observable load/save state and merging of changes made elsewhere.
 *
 * getValue()/setValue(value) connect it to the owner's reactive state.
 * normalize(raw) upgrades stored data; merge(base, local, remote) may be asynchronous.
 * onState({ load, save, error, conflicts }) receives every change of state.
 * save: idle | saving | saved | failed. load: idle | loading | ready | error.
 */
export function createSyncedRecord({
  key, maxBytes, delayMs = 700, coalesceMs = 0, empty, normalize = value => value,
  merge, getValue, setValue, onState,
}) {
  const state = { load: 'idle', save: 'idle', error: null, conflicts: 0 };
  let base = null;
  let generation = 0;
  let loadToken = 0;
  let idleTimer = null;
  let coalesceTimer = null;
  let disposed = false;
  let pendingRemote = null;
  let remoteQueue = Promise.resolve();
  let stopWatching = null;
  let syncedAt = 0;
  let queuedJson = null;
  let dirty = false;

  const publish = patch => {
    Object.assign(state, patch);
    onState?.({ ...state });
  };

  function settled(mine, error) {
    if (mine !== generation || disposed) return !error;
    queuedJson = null;
    if (!error) dirty = false;
    if (error) {
      publish({ save: 'failed', error: { kind: isQuotaError(error) ? 'quota' : 'write', message: describe(error) } });
      return false;
    }
    base = clone(getValue());
    publish({ save: 'saved', error: null });
    idleTimer = setTimeout(() => publish({ save: 'idle' }), SAVED_VISIBLE_MS);
    return true;
  }

  function mergeRemote(raw) {
    const remote = normalize(raw);
    const local = clone(getValue());
    const merged = merge(clone(base), local, remote);
    const finish = result => ({ ...result, remote, local });
    return typeof merged?.then === 'function' ? merged.then(finish) : finish(merged);
  }

  function adopt({ value, conflicts, remote, local }) {
    base = clone(remote);
    syncedAt = mirrorTimestamp(key);
    if (!deepEqual(value, local)) setValue(value);
    if (conflicts.length) publish({ conflicts: state.conflicts + conflicts.length });
  }

  function commit(immediate) {
    clearTimeout(idleTimer);
    clearTimeout(coalesceTimer);
    coalesceTimer = null;
    const mine = ++generation;
    dirty = true;
    publish({ save: 'saving', error: null });
    // Another tab wrote since this one last synchronised (its event has not arrived yet): merge it
    // first, synchronously from the mirror, so this write cannot replace it.
    const foreign = mirrorTimestamp(key) > syncedAt ? mirrorPayload(key) : null;
    if (foreign && 'value' in foreign && merge) {
      const result = mergeRemote(foreign.value);
      if (typeof result.then !== 'function') adopt(result);
    }
    const options = { delayMs, maxBytes, userData: true };
    const value = getValue();
    queuedJson = JSON.stringify(value);
    const request = immediate ? flushDebounced(key, value, options) : setJsonDebounced(key, value, options);
    syncedAt = mirrorTimestamp(key);
    return request.then(() => settled(mine, null), error => settled(mine, error));
  }

  async function applyRemote(raw) {
    if (disposed || state.load !== 'ready' || !merge) return;
    let result = null;
    for (let attempt = 0; attempt < MAX_MERGE_ATTEMPTS && !result; attempt += 1) {
      const merged = await mergeRemote(raw);
      // The user may have edited while an asynchronous merge was loading; merge again.
      if (deepEqual(merged.local, getValue())) result = merged;
    }
    if (!result || disposed) return;
    adopt(result);
    // A queued write may still carry the stale value; replace it unless it already is the result.
    const needsWrite = queuedJson === null
      ? !deepEqual(result.value, result.remote)
      : JSON.stringify(result.value) !== queuedJson;
    if (needsWrite) void commit(false);
  }

  function onRemote(raw) {
    if (disposed) return;
    if (state.load !== 'ready') { pendingRemote = { raw }; return; }
    remoteQueue = remoteQueue.then(() => applyRemote(raw)).catch(error => console.warn(`[Midori] Could not merge ${key}`, error));
  }

  async function load() {
    if (disposed) return false;
    const token = ++loadToken;
    stopWatching ||= watchJson(key, onRemote);
    publish({ load: 'loading', error: null });
    let raw;
    try {
      raw = await getJson(key, null, { strictRead: true });
    } catch (error) {
      if (token === loadToken && !disposed) publish({ load: 'error', error: { kind: 'read', message: describe(error) } });
      return false;
    }
    if (disposed || token !== loadToken) return false;
    const value = normalize(raw === null ? empty() : raw);
    base = clone(value);
    syncedAt = mirrorTimestamp(key);
    setValue(value);
    publish({ load: 'ready' });
    // Upgrades (stable ids, revisions) must reach storage or every tab would invent its own.
    // A write that failed earlier survives in the mirror; copy it back to extension storage.
    const healing = raw !== null && mirrorTimestamp(key) > await storedTimestamp(key).catch(() => Infinity);
    if (raw !== null && (healing || !deepEqual(raw, value))) void commit(true);
    if (pendingRemote) {
      const { raw: remote } = pendingRemote;
      pendingRemote = null;
      onRemote(remote);
    }
    return true;
  }

  /** Call after every local change. */
  function touch() {
    if (state.load !== 'ready' || disposed) return Promise.resolve(false);
    if (coalesceMs > 0) {
      clearTimeout(coalesceTimer);
      clearTimeout(idleTimer);
      coalesceTimer = setTimeout(() => { coalesceTimer = null; void commit(false); }, coalesceMs);
      if (state.save !== 'saving') publish({ save: 'saving', error: null });
      return Promise.resolve(true);
    }
    return commit(false);
  }

  /** Writes now whatever is still unsaved; resolves immediately when nothing is. */
  function flush() {
    if (state.load !== 'ready' || disposed) return Promise.resolve(false);
    if (!dirty && !coalesceTimer) return Promise.resolve(true);
    return commit(true);
  }

  function retry() {
    return state.load === 'ready' ? commit(true) : load();
  }

  function dispose() {
    disposed = true;
    loadToken += 1;
    clearTimeout(idleTimer);
    clearTimeout(coalesceTimer);
    stopWatching?.();
    stopWatching = null;
  }

  return { state, load, touch, flush, retry, dispose };
}
