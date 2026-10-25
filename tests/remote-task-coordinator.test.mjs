import assert from 'node:assert/strict';
import test from 'node:test';

let instance = 0;

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

async function createCoordinator({ ready = true, saveData = false, visible = true } = {}) {
  const window = Object.assign(new EventTarget(), {
    __midoriPerf: { marks: ready ? { 'interaction-ready': 1 } : {} },
  });
  const document = Object.assign(new EventTarget(), { visibilityState: visible ? 'visible' : 'hidden' });
  const navigator = { connection: { saveData } };
  Object.assign(globalThis, { window, document });
  Object.defineProperty(globalThis, 'navigator', { value: navigator, configurable: true, writable: true });
  const module = await import(`../src/bootstrap/remoteTaskCoordinator.js?instance=${++instance}`);
  return {
    ...module,
    navigator,
    markReady() {
      window.dispatchEvent(new CustomEvent('midori:perf-mark', { detail: { name: 'interaction-ready' } }));
    },
    setVisibility(state) {
      document.visibilityState = state;
      document.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

function controlled() {
  const gate = deferred();
  const record = { started: 0, signal: null, gate };
  record.run = signal => { record.started += 1; record.signal = signal; return gate.promise; };
  return record;
}

test('no task starts before the interaction barrier and queued tasks start when it opens', async () => {
  const queue = await createCoordinator({ ready: false });
  const task = controlled();
  const result = queue.scheduleRemoteTask('wallpaper', task.run);
  await tick(5);
  assert.equal(task.started, 0);
  assert.deepEqual({ ...queue.remoteTaskState() }, { ready: false, pending: 1, running: 0, budget: 2 });
  queue.markReady();
  await tick();
  assert.equal(task.started, 1);
  task.gate.resolve(true);
  assert.equal(await result, true);
});

test('the barrier recorded before the module loaded is honoured', async () => {
  const queue = await createCoordinator({ ready: true });
  const task = controlled();
  const result = queue.scheduleRemoteTask('news', task.run);
  await tick();
  assert.equal(task.started, 1);
  task.gate.resolve();
  assert.equal(await result, true, 'A task that returns nothing counts as completed');
});

test('at most two tasks run at once and the rest start as slots free up', async () => {
  const queue = await createCoordinator();
  const tasks = ['a', 'b', 'c', 'd'].map(() => controlled());
  const results = tasks.map((task, index) => queue.scheduleRemoteTask(`task-${index}`, task.run));
  await tick();
  assert.deepEqual(tasks.map(task => task.started), [1, 1, 0, 0]);
  assert.equal(queue.remoteTaskState().running, 2);
  tasks[0].gate.resolve(true);
  await tick();
  assert.deepEqual(tasks.map(task => task.started), [1, 1, 1, 0]);
  tasks[1].gate.resolve(true);
  tasks[2].gate.resolve(true);
  await tick();
  assert.equal(tasks[3].started, 1);
  tasks[3].gate.resolve(true);
  assert.deepEqual(await Promise.all(results), [true, true, true, true]);
  assert.equal(queue.remoteTaskState().running, 0);
});

test('data saver limits the queue to one task and the budget is read on every drain', async () => {
  const queue = await createCoordinator({ saveData: true });
  const tasks = [controlled(), controlled(), controlled()];
  const results = tasks.map((task, index) => queue.scheduleRemoteTask(`task-${index}`, task.run));
  await tick();
  assert.deepEqual(tasks.map(task => task.started), [1, 0, 0]);
  assert.equal(queue.remoteTaskState().budget, 1);
  queue.navigator.connection.saveData = false;
  tasks[0].gate.resolve(true);
  await tick();
  assert.deepEqual(tasks.map(task => task.started), [1, 1, 1], 'Turning data saver off restores the normal budget');
  tasks[1].gate.resolve(true);
  tasks[2].gate.resolve(true);
  await Promise.all(results);
});

test('higher priority runs first and equal priority keeps arrival order', async () => {
  const queue = await createCoordinator({ ready: false });
  const order = [];
  const make = name => () => { order.push(name); return true; };
  const results = [
    queue.scheduleRemoteTask('low-first', make('low-first'), { priority: 0 }),
    queue.scheduleRemoteTask('favicon', make('favicon'), { priority: 3 }),
    queue.scheduleRemoteTask('ads', make('ads'), { priority: 1 }),
    queue.scheduleRemoteTask('low-second', make('low-second'), { priority: 0 }),
  ];
  queue.markReady();
  await Promise.all(results);
  assert.deepEqual(order, ['favicon', 'ads', 'low-first', 'low-second']);
});

test('a task scheduled again while pending keeps one slot and uses the newest function', async () => {
  const queue = await createCoordinator({ ready: false });
  const calls = [];
  const first = queue.scheduleRemoteTask('weather', () => { calls.push('old'); return true; }, { priority: 1 });
  const second = queue.scheduleRemoteTask('weather', () => { calls.push('new'); return true; }, { priority: 2 });
  assert.equal(queue.remoteTaskState().pending, 1);
  queue.markReady();
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.deepEqual(calls, ['new']);
});

test('scheduling a key that is already running resolves false instead of running twice', async () => {
  const queue = await createCoordinator();
  const task = controlled();
  const first = queue.scheduleRemoteTask('ads-decision', task.run);
  await tick();
  assert.equal(await queue.scheduleRemoteTask('ads-decision', task.run), false);
  assert.equal(task.started, 1);
  task.gate.resolve(true);
  assert.equal(await first, true);
});

test('hiding aborts running tasks, drops queued ones and never starts work while hidden', async () => {
  const queue = await createCoordinator();
  const running = [controlled(), controlled()];
  const runningResults = running.map((task, index) => queue.scheduleRemoteTask(`running-${index}`, task.run));
  const waiting = controlled();
  const waitingResult = queue.scheduleRemoteTask('waiting', waiting.run);
  await tick();
  queue.setVisibility('hidden');
  assert.equal(running[0].signal.aborted, true);
  assert.equal(running[1].signal.aborted, true);
  assert.equal(await waitingResult, false, 'A queued task is released immediately with a negative result');
  assert.equal(waiting.started, 0);
  for (const task of running) task.gate.reject(new DOMException('cancelled', 'AbortError'));
  assert.deepEqual(await Promise.all(runningResults), [false, false]);
  assert.equal(await queue.scheduleRemoteTask('while-hidden', () => true), false);
  assert.equal(waiting.started, 0);
  assert.deepEqual({ ...queue.remoteTaskState() }, { ready: true, pending: 0, running: 0, budget: 2 });
});

test('returning to the page lets a fresh request run without waiting for stale ones', async () => {
  const queue = await createCoordinator();
  const stale = controlled();
  const staleResult = queue.scheduleRemoteTask('news', stale.run);
  await tick();
  queue.setVisibility('hidden');
  stale.gate.reject(new DOMException('cancelled', 'AbortError'));
  assert.equal(await staleResult, false);
  queue.setVisibility('visible');
  const fresh = controlled();
  const freshResult = queue.scheduleRemoteTask('news', fresh.run);
  await tick();
  assert.equal(fresh.started, 1);
  assert.equal(fresh.signal.aborted, false);
  fresh.gate.resolve(true);
  assert.equal(await freshResult, true);
});

test('a task that ignores its abort signal is released after the grace period', async () => {
  const queue = await createCoordinator();
  const hung = controlled();
  const hungResult = queue.scheduleRemoteTask('weather', hung.run, { graceMs: 30 });
  const other = controlled();
  const otherResult = queue.scheduleRemoteTask('currency', other.run, { graceMs: 30 });
  const third = controlled();
  const thirdResult = queue.scheduleRemoteTask('rss', third.run);
  await tick();
  assert.equal(third.started, 0, 'Both slots are busy');
  queue.setVisibility('hidden');
  queue.setVisibility('visible');
  const next = controlled();
  const nextResult = queue.scheduleRemoteTask('privacy-refresh', next.run);
  await tick(5);
  assert.equal(next.started, 0, 'The slots are still held before the grace period ends');
  assert.equal(await hungResult, false);
  assert.equal(await otherResult, false);
  assert.equal(await thirdResult, false, 'A task queued before hiding was released by the hide');
  await tick();
  assert.equal(next.started, 1, 'The queue resumes after hung tasks are released');
  hung.gate.resolve(true);
  next.gate.resolve(true);
  assert.equal(await nextResult, true);
  assert.equal(queue.remoteTaskState().running, 0, 'A late result from a released task does not corrupt the queue');
});

test('a task that exceeds its run limit is aborted and released', async () => {
  const queue = await createCoordinator();
  const hung = controlled();
  const result = queue.scheduleRemoteTask('currency', hung.run, { timeoutMs: 20, graceMs: 20 });
  await tick();
  assert.equal(hung.signal.aborted, false);
  assert.equal(await result, false);
  assert.equal(hung.signal.aborted, true);
  assert.equal(queue.remoteTaskState().running, 0);
});

test('cancelling a pending or running task releases its waiters', async () => {
  const queue = await createCoordinator({ ready: false });
  const pendingTask = controlled();
  const pendingResult = queue.scheduleRemoteTask('wallpaper-prewarm', pendingTask.run);
  queue.cancelRemoteTask('wallpaper-prewarm');
  assert.equal(await pendingResult, false);
  queue.markReady();
  await tick();
  assert.equal(pendingTask.started, 0);
  const runningTask = controlled();
  const runningResult = queue.scheduleRemoteTask('wallpaper', runningTask.run);
  await tick();
  queue.cancelRemoteTask('wallpaper');
  assert.equal(runningTask.signal.aborted, true);
  runningTask.gate.reject(new DOMException('cancelled', 'AbortError'));
  assert.equal(await runningResult, false);
});

test('a failing task resolves false, is reported once and does not stall the queue', async () => {
  const queue = await createCoordinator();
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const failing = queue.scheduleRemoteTask('rss', () => { throw new Error('boom'); });
    const aborted = queue.scheduleRemoteTask('weather', () => { throw new DOMException('stop', 'AbortError'); });
    const healthy = queue.scheduleRemoteTask('currency', () => true);
    assert.deepEqual(await Promise.all([failing, aborted, healthy]), [false, false, true]);
  } finally { console.warn = originalWarn; }
  assert.equal(warnings.length, 1, 'An abort is silent, a real failure is reported');
  assert.equal(queue.remoteTaskState().running, 0);
});

test('tasks delayed with notBeforeMs wait without blocking ready ones', async () => {
  const queue = await createCoordinator();
  const order = [];
  const delayed = queue.scheduleRemoteTask('wallpaper-prewarm', () => { order.push('delayed'); return true; },
    { priority: -1, notBeforeMs: performance.now() + 40 });
  const immediate = queue.scheduleRemoteTask('news', () => { order.push('immediate'); return true; });
  await tick(5);
  assert.deepEqual(order, ['immediate']);
  await Promise.all([delayed, immediate]);
  assert.deepEqual(order, ['immediate', 'delayed']);
});

test('a superseding request frees the slot at once, aborts the old one and ignores its late result', async () => {
  const queue = await createCoordinator({ saveData: true });
  const old = controlled();
  const oldResult = queue.scheduleRemoteTask('widget:rss', old.run);
  await tick();
  assert.equal(old.started, 1);
  const fresh = controlled();
  const freshResult = queue.scheduleRemoteTask('widget:rss', fresh.run, { supersede: true });
  assert.equal(await oldResult, false, 'The superseded request is released with a negative result');
  assert.equal(old.signal.aborted, true);
  await tick();
  assert.equal(fresh.started, 1, 'With data saver the new request does not wait for the old one to finish');
  old.gate.resolve(true);
  await tick();
  assert.equal(queue.remoteTaskState().running, 1, 'The late result of the old request does not free the new one');
  fresh.gate.resolve(true);
  assert.equal(await freshResult, true);
  assert.equal(queue.remoteTaskState().running, 0);
});

test('without supersede a repeated request for a running key is still ignored', async () => {
  const queue = await createCoordinator();
  const task = controlled();
  const first = queue.scheduleRemoteTask('widget:weather', task.run);
  await tick();
  assert.equal(await queue.scheduleRemoteTask('widget:weather', task.run), false);
  assert.equal(task.signal.aborted, false);
  task.gate.resolve(true);
  assert.equal(await first, true);
});
