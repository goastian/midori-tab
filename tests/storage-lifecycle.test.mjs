import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
globalThis.localStorage = createLocalStorage();

const storage = await import('../src/services/StorageService.js');
const { watchJson } = await import('../src/services/storageWatch.js');
const { flushAllPending, flushDebounced, remove, setJsonDebounced, WRITER_ID } = storage;
const isQuotaError = error => /quota|exceeds \d+ bytes/i.test(`${error?.name || ''} ${error?.message || ''}`);

function createLocalStorage() {
  const state = new Map();
  return {
    getItem: key => (state.has(key) ? state.get(key) : null),
    setItem: (key, value) => state.set(key, String(value)),
    removeItem: key => state.delete(key),
    clear: () => state.clear(),
  };
}

function installExtension({ failWrites = () => false } = {}) {
  const state = {};
  const writes = [];
  const changeListeners = new Set();
  globalThis.localStorage.clear();
  delete globalThis.browser;
  globalThis.chrome = {
    runtime: {},
    storage: {
      onChanged: { addListener: fn => changeListeners.add(fn), removeListener: fn => changeListeners.delete(fn) },
      local: {
        get: (key, callback) => callback({ [key]: state[key] }),
        set(payload, callback) {
          if (failWrites(payload)) { globalThis.chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }; callback(); delete globalThis.chrome.runtime.lastError; return; }
          Object.assign(state, payload);
          writes.push(payload);
          callback();
        },
        remove(key, callback) { delete state[key]; callback(); },
      },
    },
  };
  return { state, writes, changeListeners };
}

const never = Symbol('pending');
const settlesSoon = async promise => Promise.race([promise.then(() => 'resolved', error => error), new Promise(resolve => setTimeout(() => resolve(never), 50))]);

test('hiding or closing the page writes every edit still waiting for its debounce', async () => {
  const extension = installExtension();
  const first = setJsonDebounced('midori_test_todos', [{ text: 'last edit' }], { delayMs: 60_000 });
  const second = setJsonDebounced('midori_test_notes', 'draft', { delayMs: 60_000 });
  assert.equal(extension.state.midori_test_todos, undefined);
  document.visibilityState = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  document.visibilityState = 'visible';
  await Promise.all([first, second]);
  assert.deepEqual(extension.state.midori_test_todos.value, [{ text: 'last edit' }]);
  assert.equal(extension.state.midori_test_notes.value, 'draft');

  setJsonDebounced('midori_test_todos', [{ text: 'after pagehide' }], { delayMs: 60_000 });
  window.dispatchEvent(new Event('pagehide'));
  await flushDebounced('midori_test_todos', [{ text: 'after pagehide' }]);
  assert.deepEqual(extension.state.midori_test_todos.value, [{ text: 'after pagehide' }]);
  await remove('midori_test_todos');
  await remove('midori_test_notes');
});

test('debounce, flush and remove never leave a promise pending', async () => {
  installExtension();
  const key = 'midori_test_settle';
  const superseded = setJsonDebounced(key, [1], { delayMs: 60_000 });
  const latest = setJsonDebounced(key, [1, 2], { delayMs: 60_000 });
  await flushDebounced(key, [1, 2, 3]);
  assert.equal(await settlesSoon(superseded), 'resolved');
  assert.equal(await settlesSoon(latest), 'resolved');

  const cancelled = setJsonDebounced(key, [4], { delayMs: 60_000 });
  await remove(key);
  const outcome = await settlesSoon(cancelled);
  assert.notEqual(outcome, never, 'remove must settle writes it cancels');
  assert.equal(outcome.name, 'AbortError');

  const timed = setJsonDebounced(key, [5], { delayMs: 0 });
  assert.equal(await settlesSoon(timed), 'resolved');
  const early = setJsonDebounced(key, [6], { delayMs: 60_000 });
  flushAllPending();
  assert.equal(await settlesSoon(early), 'resolved');
  await remove(key);
});

test('a failed write rejects, keeps the edit in the mirror and recovers on the next success', async () => {
  let failing = true;
  const extension = installExtension({ failWrites: () => failing });
  const events = [];
  window.addEventListener('midori:storage-error', event => events.push(event.type));
  window.addEventListener('midori:storage-recovered', event => events.push(event.type));
  const key = 'midori_test_failure';

  await assert.rejects(flushDebounced(key, ['kept'], { userData: true }), /quota/i);
  assert.deepEqual(JSON.parse(localStorage.getItem(key)).value, ['kept'], 'The edit must survive in the mirror');
  assert.equal(extension.state[key], undefined);
  assert.equal(window.__midoriStorageError, true);
  const prevented = [];
  const beforeUnload = Object.assign(new Event('beforeunload', { cancelable: true }), {});
  window.dispatchEvent(beforeUnload);
  prevented.push(beforeUnload.defaultPrevented);
  assert.deepEqual(prevented, [true], 'Closing with unsaved user data must ask for confirmation');

  failing = false;
  await flushDebounced(key, ['kept'], { userData: true });
  assert.deepEqual(extension.state[key].value, ['kept']);
  assert.equal(window.__midoriStorageError, false);
  assert.deepEqual(events, ['midori:storage-error', 'midori:storage-recovered']);
  const afterRecovery = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(afterRecovery);
  assert.equal(afterRecovery.defaultPrevented, false);
  await remove(key);
});

test('a payload over its limit is rejected and nothing is written', async () => {
  const extension = installExtension();
  const key = 'midori_test_limit';
  await assert.rejects(flushDebounced(key, 'x'.repeat(100), { maxBytes: 50 }), error => isQuotaError(error));
  assert.equal(extension.state[key], undefined);
  assert.equal(isQuotaError(new Error('QuotaExceededError')), true);
  assert.equal(isQuotaError(new Error('network')), false);
});

test('watchJson reports other tabs only, once, and ignores stale payloads', async () => {
  const extension = installExtension();
  const key = 'midori_test_watch';
  const seen = [];
  const stop = watchJson(key, (value, payload) => seen.push([value, payload.updatedAt]));
  const remote = (value, updatedAt, origin = 'other-tab') => ({ __midoriStorageVersion: 1, value, updatedAt, origin });
  const announce = payload => {
    for (const listener of extension.changeListeners) listener({ [key]: { newValue: payload } }, 'local');
  };

  await flushDebounced(key, ['mine']);
  announce(JSON.parse(localStorage.getItem(key)));
  assert.equal(JSON.parse(localStorage.getItem(key)).origin, WRITER_ID);
  assert.deepEqual(seen, [], 'Own writes must not be reported');

  const newest = remote(['theirs'], Date.now() + 5000);
  localStorage.setItem(key, JSON.stringify(newest));
  announce(newest);
  announce(newest);
  window.dispatchEvent(Object.assign(new Event('storage'), { key, newValue: JSON.stringify(newest), storageArea: localStorage }));
  assert.deepEqual(seen, [[['theirs'], newest.updatedAt]], 'The same payload must be delivered once');

  announce(remote(['older'], newest.updatedAt - 100));
  assert.equal(seen.length, 1, 'A payload older than the mirror is stale');
  stop();
  assert.equal(extension.changeListeners.size, 0, 'The last unsubscribe must release the shared listeners');
  await remove(key);
});
