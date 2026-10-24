import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.window = new EventTarget();
globalThis.document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const mirror = new Map();
globalThis.localStorage = {
  getItem: key => (mirror.has(key) ? mirror.get(key) : null),
  setItem: (key, value) => mirror.set(key, String(value)),
  removeItem: key => mirror.delete(key),
};

const { createSyncedRecord } = await import('../src/services/syncedRecord.js');
const { mergeById } = await import('../src/services/listMerge.js');
const { stableId } = await import('../src/services/itemIds.js');

function installExtension({ readFails = false, writeFails = false, readDelay = null } = {}) {
  const env = { state: {}, writes: [], listeners: new Set(), readFails, writeFails, readDelay, reads: 0 };
  mirror.clear();
  delete globalThis.browser;
  globalThis.chrome = {
    runtime: {},
    storage: {
      onChanged: { addListener: fn => env.listeners.add(fn), removeListener: fn => env.listeners.delete(fn) },
      local: {
        get(key, callback) {
          env.reads += 1;
          const answer = () => {
            if (env.readFails) { globalThis.chrome.runtime.lastError = { message: 'read failed' }; callback(); delete globalThis.chrome.runtime.lastError; return; }
            callback({ [key]: env.state[key] });
          };
          if (env.readDelay) env.readDelay.then(answer); else answer();
        },
        set(payload, callback) {
          if (env.writeFails) { globalThis.chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }; callback(); delete globalThis.chrome.runtime.lastError; return; }
          Object.assign(env.state, payload);
          env.writes.push(JSON.parse(JSON.stringify(payload)));
          callback();
        },
        remove(key, callback) { delete env.state[key]; callback(); },
      },
    },
  };
  return env;
}

function createTodos(env, overrides = {}) {
  let items = [];
  const states = [];
  const normalize = raw => {
    const seen = new Map();
    return (Array.isArray(raw) ? raw : []).map(entry => ({
      id: entry.id || stableId('t', entry.text, seen), text: String(entry.text ?? ''), done: Boolean(entry.done), rev: entry.rev || 1,
      ...(entry.conflictOf ? { conflictOf: entry.conflictOf } : {}),
    }));
  };
  const record = createSyncedRecord({
    key: 'midori_test_record', maxBytes: 10_000, delayMs: 20, empty: () => [], normalize,
    merge: (base, local, remote) => mergeById(base, local, remote),
    getValue: () => items, setValue: value => { items = value; }, onState: state => states.push(state), ...overrides,
  });
  return { record, states, get items() { return items; }, set items(value) { items = value; } };
}

const payload = (value, updatedAt, origin = 'other-tab') => ({ __midoriStorageVersion: 1, value, updatedAt, origin });
const announce = (env, key, newValue) => { for (const listener of env.listeners) listener({ [key]: { newValue } }, 'local'); };
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

test('a read failure blocks every write and retrying loads without losing the stored items', async () => {
  const env = installExtension({ readFails: true });
  const todos = createTodos(env);
  assert.equal(await todos.record.load(), false);
  assert.equal(todos.record.state.load, 'error');
  assert.equal(todos.record.state.error.kind, 'read');

  assert.equal(await todos.record.touch(), false, 'Nothing may be saved before the first successful read');
  assert.equal(await todos.record.flush(), false, 'Closing while unloaded must not write an empty list');
  assert.deepEqual(env.writes, []);

  env.readFails = false;
  env.state.midori_test_record = payload([{ id: 'a', text: 'kept', done: false }], 5);
  assert.equal(await todos.record.retry(), true);
  assert.deepEqual(todos.items.map(item => item.text), ['kept']);
  todos.record.dispose();
});

test('closing during the first read never writes', async () => {
  let release;
  const env = installExtension({ readDelay: new Promise(resolve => { release = resolve; }) });
  env.state.midori_test_record = payload([{ id: 'a', text: 'stored', done: false }], 5);
  const todos = createTodos(env);
  const loading = todos.record.load();
  await todos.record.flush();
  todos.record.dispose();
  release();
  assert.equal(await loading, false, 'A disposed record must not publish stale data');
  assert.deepEqual(env.writes, []);
  assert.deepEqual(todos.items, []);
});

test('save state follows the real result and a failed save can be retried with the edit intact', async () => {
  const env = installExtension();
  const todos = createTodos(env);
  await todos.record.load();
  todos.items = [...todos.items, { id: 'x', text: 'new', done: false, rev: 1 }];
  env.writeFails = true;
  assert.equal(await todos.record.touch(), false);
  assert.equal(todos.record.state.save, 'failed');
  assert.equal(todos.record.state.error.kind, 'quota');
  assert.equal(JSON.parse(localStorage.getItem('midori_test_record')).value[0].text, 'new', 'The mirror keeps the edit');

  env.writeFails = false;
  assert.equal(await todos.record.retry(), true);
  assert.equal(todos.record.state.save, 'saved');
  assert.equal(env.state.midori_test_record.value[0].text, 'new');
  assert.deepEqual(todos.states.map(state => state.save).filter((value, index, list) => value !== list[index - 1]), ['idle', 'saving', 'failed', 'saving', 'saved']);
  todos.record.dispose();
});

test('stored data without ids is upgraded once and written back', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ text: 'old', done: true }, { text: 'old', done: false }], 5, 'v1');
  const todos = createTodos(env);
  await todos.record.load();
  await tick(30);
  assert.deepEqual(todos.items.map(item => [item.text, item.done]), [['old', true], ['old', false]], 'Content and order are preserved');
  assert.equal(new Set(todos.items.map(item => item.id)).size, 2);
  assert.equal(env.state.midori_test_record.value[0].id, todos.items[0].id, 'Upgraded ids must reach storage');
  todos.record.dispose();
});

test('a change saved by another tab is merged without overwriting a local edit', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'b', text: 'two', done: false, rev: 1 }], 5);
  const todos = createTodos(env);
  await todos.record.load();
  todos.items = todos.items.map(item => (item.id === 'a' ? { ...item, done: true, rev: 2 } : item));
  const remote = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'b', text: 'two', done: false, rev: 1 }, { id: 'c', text: 'three', done: false, rev: 1 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  await tick(5);
  assert.deepEqual(todos.items.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(todos.items[0].done, true, 'The local edit stays');
  await tick(60);
  const written = env.state.midori_test_record.value;
  assert.deepEqual(written.map(item => item.id), ['a', 'b', 'c']);
  assert.equal(written[0].done, true, 'The merged list is written back');
  todos.record.dispose();
});

test('remote edits arriving while loading are applied afterwards', async () => {
  let release;
  const env = installExtension({ readDelay: new Promise(resolve => { release = resolve; }) });
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env);
  const loading = todos.record.load();
  const remote = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'z', text: 'early', done: false, rev: 1 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  release();
  await loading;
  await tick(5);
  assert.deepEqual(todos.items.map(item => item.id), ['a', 'z']);
  await tick(60);
  todos.record.dispose();
});

test('an unchanged list merged with the other tab does not echo a write back', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env);
  await todos.record.load();
  const remote = payload([{ id: 'a', text: 'one', done: true, rev: 2 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  await tick(60);
  assert.equal(todos.items[0].done, true);
  assert.deepEqual(env.writes, [], 'Adopting the other tab must not ping-pong');
  todos.record.dispose();
});

test('a pending local write is replaced by the merged list instead of overwriting the other tab', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env, { delayMs: 200 });
  await todos.record.load();
  todos.items = [...todos.items, { id: 'mine', text: 'mine', done: false, rev: 1 }];
  void todos.record.touch();
  const remote = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'theirs', text: 'theirs', done: false, rev: 1 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  await tick(300);
  assert.deepEqual(env.state.midori_test_record.value.map(item => item.id).sort(), ['a', 'mine', 'theirs']);
  todos.record.dispose();
});

test('an asynchronous merge is repeated when the user edits while it loads', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  let calls = 0;
  let todos;
  todos = createTodos(env, {
    merge: async (base, local, remote) => {
      calls += 1;
      await tick(10);
      if (calls === 1) todos.items = [...todos.items, { id: 'typed', text: 'typed meanwhile', done: false, rev: 1 }];
      return mergeById(base, local, remote);
    },
  });
  await todos.record.load();
  const remote = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'r', text: 'remote', done: false, rev: 1 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  await tick(120);
  assert.equal(calls, 2);
  assert.deepEqual(todos.items.map(item => item.id).sort(), ['a', 'r', 'typed']);
  todos.record.dispose();
});

test('a save made before the other tab\'s event arrives merges it instead of overwriting it', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env);
  await todos.record.load();
  const foreign = payload([{ id: 'a', text: 'one', done: false, rev: 1 }, { id: 'theirs', text: 'theirs', done: false, rev: 1 }], Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(foreign));
  env.state.midori_test_record = foreign;
  todos.items = [...todos.items, { id: 'mine', text: 'mine', done: false, rev: 1 }];
  void todos.record.touch();
  await todos.record.flush();
  assert.deepEqual(env.state.midori_test_record.value.map(item => item.id).sort(), ['a', 'mine', 'theirs'], 'The write must carry both tabs\' items');
  assert.deepEqual(todos.items.map(item => item.id).sort(), ['a', 'mine', 'theirs']);
  todos.record.dispose();
});

test('two tabs that edit the same note before seeing each other keep both versions', async () => {
  const env = installExtension();
  const state = { note: { id: 'note-main', text: '', rev: 1, conflicts: [] } };
  const { mergeNote } = await import('../src/services/listMerge.js');
  const record = createSyncedRecord({
    key: 'midori_test_note', maxBytes: 10_000, delayMs: 5, empty: () => state.note,
    merge: mergeNote, getValue: () => state.note, setValue: value => { state.note = value; },
  });
  await record.load();
  const foreign = payload({ id: 'note-main', text: 'typed elsewhere', rev: 2, updatedAt: 3, conflicts: [] }, Date.now() + 10_000);
  localStorage.setItem('midori_test_note', JSON.stringify(foreign));
  env.state.midori_test_note = foreign;
  state.note = { ...state.note, text: 'typed here', rev: 2 };
  void record.touch();
  await record.flush();
  assert.equal(state.note.text, 'typed here', 'The text being edited stays');
  assert.deepEqual(state.note.conflicts.map(copy => copy.text), ['typed elsewhere']);
  assert.deepEqual(env.state.midori_test_note.value.conflicts.map(copy => copy.text), ['typed elsewhere'], 'The copy is persisted');
  record.dispose();
});

test('adopting an update that equals the queued write does not queue another one', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env, { delayMs: 80 });
  await todos.record.load();
  const edited = [{ id: 'a', text: 'one', done: true, rev: 2 }];
  todos.items = edited;
  void todos.record.touch();
  const remote = payload(edited, Date.now() + 10_000);
  localStorage.setItem('midori_test_record', JSON.stringify(remote));
  announce(env, 'midori_test_record', remote);
  await tick(250);
  assert.equal(env.writes.length, 1, 'One write: the queued one, not an echo of the other tab\'s identical result');
  todos.record.dispose();
});

test('flush writes only what is unsaved, so switching tabs does not rewrite settled data', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'one', done: false, rev: 1 }], 5);
  const todos = createTodos(env);
  await todos.record.load();
  assert.equal(await todos.record.flush(), true);
  assert.deepEqual(env.writes, [], 'Nothing changed, nothing is written');
  todos.items = [...todos.items, { id: 'b', text: 'two', done: false, rev: 1 }];
  void todos.record.touch();
  assert.equal(await todos.record.flush(), true);
  assert.equal(env.writes.length, 1);
  assert.equal(await todos.record.flush(), true);
  assert.equal(env.writes.length, 1, 'A second flush finds nothing unsaved');
  todos.record.dispose();
});

test('a write that failed earlier is copied from the mirror to extension storage on the next load', async () => {
  const env = installExtension();
  env.state.midori_test_record = payload([{ id: 'a', text: 'old', done: false, rev: 1 }], 10);
  localStorage.setItem('midori_test_record', JSON.stringify(payload([{ id: 'a', text: 'edited', done: false, rev: 2 }], 20, 'earlier-tab')));
  const todos = createTodos(env);
  await todos.record.load();
  await tick(10);
  assert.equal(todos.items[0].text, 'edited', 'The mirror holds the newest edit');
  assert.equal(env.state.midori_test_record.value[0].text, 'edited', 'Extension storage is repaired');
  const writes = env.writes.length;
  const again = createTodos(env);
  await again.record.load();
  await tick(10);
  assert.equal(env.writes.length, writes, 'Nothing to repair, nothing written');
  todos.record.dispose();
  again.record.dispose();
});
