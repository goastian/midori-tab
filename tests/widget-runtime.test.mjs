import assert from 'node:assert/strict';
import test from 'node:test';

const window = Object.assign(new EventTarget(), { __midoriPerf: { marks: {} } });
const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
const observers = new Set();

class FakeIntersectionObserver {
  constructor(callback) { this.callback = callback; this.targets = new Set(); observers.add(this); }
  observe(target) { this.targets.add(target); }
  unobserve(target) { this.targets.delete(target); }
  disconnect() { this.targets.clear(); observers.delete(this); }
}

Object.assign(globalThis, { window, document, IntersectionObserver: FakeIntersectionObserver });
Object.defineProperty(globalThis, 'navigator', { value: { connection: { saveData: false } }, configurable: true, writable: true });

const { createWidgetRuntime, WIDGET_COST } = await import('../src/composables/useWidgetRuntime.js');
const { cancelRemoteTask, remoteTaskState } = await import('../src/bootstrap/remoteTaskCoordinator.js');

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
const root = {};

function intersect(isIntersecting) {
  for (const observer of observers) {
    for (const target of observer.targets) observer.callback([{ target, isIntersecting }]);
  }
}

function setVisibility(state) {
  document.visibilityState = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

function createRuntime(policy = {}, hooks = {}) {
  const events = [];
  const runtime = createWidgetRuntime({ $el: root }, { key: `test-${Math.random()}`, cost: WIDGET_COST.LOW, usesNetwork: true, ttlMs: 60_000, ...policy }, {
    onVisible: () => events.push('visible'),
    onHidden: () => events.push('hidden'),
    ...hooks,
  });
  return { runtime, events };
}

test('a networked widget waits for the interaction barrier and then runs once', async () => {
  const { runtime, events } = createRuntime();
  runtime.mount();
  intersect(true);
  assert.deepEqual(events, ['visible']);
  let runs = 0;
  const result = runtime.runWhenVisible(async () => { runs += 1; });
  await tick(5);
  assert.equal(runs, 0, 'No remote work before the barrier');
  assert.equal(remoteTaskState().pending, 1);
  window.__midoriPerf.marks['interaction-ready'] = 1;
  window.dispatchEvent(new CustomEvent('midori:perf-mark', { detail: { name: 'interaction-ready' } }));
  assert.equal(await result, true);
  assert.equal(runs, 1);
  assert.equal(await runtime.runWhenVisible(async () => { runs += 1; }), false, 'A fresh result is reused inside its TTL');
  assert.equal(await runtime.runWhenVisible(async () => { runs += 1; }, { force: true }), true);
  assert.equal(runs, 2);
  runtime.dispose();
});

test('leaving the viewport cancels the remote task and returning notifies the widget', async () => {
  const { runtime, events } = createRuntime();
  runtime.mount();
  intersect(true);
  let signalled = false;
  const pending = new Promise(resolve => { runtime.runWhenVisible(() => new Promise(done => { setTimeout(done, 200, true); })).then(resolve); });
  await tick();
  intersect(false);
  assert.deepEqual(events, ['visible', 'hidden']);
  assert.equal(await pending, false, 'A result that arrives after the widget left the viewport is discarded');
  assert.equal(runtime.lastRunAt, 0, 'A discarded result is not recorded as a refresh');
  assert.equal(await runtime.runWhenVisible(async () => { signalled = true; }), false, 'Nothing runs while outside the viewport');
  assert.equal(signalled, false);
  intersect(true);
  assert.deepEqual(events, ['visible', 'hidden', 'visible']);
  assert.equal(await runtime.runWhenVisible(async () => true), true);
  runtime.dispose();
});

test('hiding the tab cancels the queued key and showing it resumes without a stuck slot', async () => {
  const { runtime, events } = createRuntime({ key: 'hide-and-return' });
  runtime.mount();
  intersect(true);
  let aborted = 0;
  const first = runtime.runWhenVisible(() => new Promise((_, reject) => {
    const timer = setTimeout(reject, 5_000, new Error('should have been cancelled'));
    document.addEventListener('visibilitychange', () => { clearTimeout(timer); aborted += 1; reject(new DOMException('cancelled', 'AbortError')); }, { once: true });
  }));
  await tick();
  setVisibility('hidden');
  assert.equal(await first, false);
  assert.equal(aborted, 1);
  assert.deepEqual(events.slice(-1), ['hidden']);
  assert.equal(runtime.lastRunAt, 0);
  setVisibility('visible');
  assert.deepEqual(events.slice(-1), ['visible']);
  assert.equal(await runtime.runWhenVisible(async () => true), true, 'The key is free again after the abort');
  assert.equal(remoteTaskState().running, 0);
  runtime.dispose();
});

test('a failed refresh is not repeated immediately but a forced one is', async () => {
  const { runtime } = createRuntime({ key: 'failure-cooldown', retryAfterMs: 60 });
  runtime.mount();
  intersect(true);
  let runs = 0;
  assert.equal(await runtime.runWhenVisible(async () => { runs += 1; return false; }), false);
  assert.ok(runtime.lastFailureAt > 0);
  assert.equal(await runtime.runWhenVisible(async () => { runs += 1; return true; }), false, 'Cooling down after a failure');
  assert.equal(runs, 1);
  assert.equal(await runtime.runWhenVisible(async () => { runs += 1; return true; }, { force: true }), true);
  assert.equal(runtime.lastFailureAt, 0, 'A success clears the failure');
  assert.equal(runs, 2);
  runtime.dispose();
});

test('the cooldown ends and a thrown error counts as a failure', async () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    const { runtime } = createRuntime({ key: 'throwing', retryAfterMs: 30 });
    runtime.mount();
    intersect(true);
    assert.equal(await runtime.runWhenVisible(async () => { throw new Error('offline'); }), false);
    assert.ok(runtime.lastFailureAt > 0);
    assert.equal(runtime.shouldRun(), false);
    await tick(40);
    assert.equal(runtime.shouldRun(), true);
    assert.equal(await runtime.runWhenVisible(async () => true), true);
    runtime.dispose();
  } finally { console.warn = originalWarn; }
  assert.equal(warnings.length, 1);
});

test('dispose releases the visibility observers and the queued key', async () => {
  const { runtime } = createRuntime({ key: 'disposed' });
  runtime.mount();
  intersect(true);
  runtime.dispose();
  assert.equal(observers.size, 0, 'No IntersectionObserver is retained');
  cancelRemoteTask('widget:disposed');
  assert.equal(remoteTaskState().pending, 0);
});

test('a forced refresh supersedes a running one and only the newest result is recorded', async () => {
  const { runtime } = createRuntime({ key: 'superseded' });
  runtime.mount();
  intersect(true);
  let releaseOld;
  const old = runtime.runWhenVisible(() => new Promise(resolve => { releaseOld = resolve; }));
  await tick();
  const newest = runtime.runWhenVisible(async () => true, { force: true });
  assert.equal(await old, false, 'The superseded refresh reports no result');
  assert.equal(await newest, true);
  const recorded = runtime.lastRunAt;
  releaseOld(false);
  await tick(5);
  assert.equal(runtime.lastRunAt, recorded);
  assert.equal(runtime.lastFailureAt, 0, 'A superseded refresh that fails is not counted as a failure');
  runtime.dispose();
});

test('an automatic refresh asked while one is running does not discard the running result', async () => {
  const { runtime } = createRuntime({ key: 'automatic-while-running' });
  runtime.mount();
  intersect(true);
  let release;
  const running = runtime.runWhenVisible(() => new Promise(resolve => { release = resolve; }));
  await tick();
  assert.equal(await runtime.runWhenVisible(async () => true), false, 'The duplicate request is ignored');
  release(true);
  assert.equal(await running, true);
  assert.ok(runtime.lastRunAt > 0, 'The running refresh is still recorded');
  runtime.dispose();
});
