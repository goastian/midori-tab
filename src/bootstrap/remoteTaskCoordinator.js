const pending = new Map();
const running = new Map();
let ready = false;
let started = false;
let wakeTimer = null;

const RUN_LIMIT_MS = 60_000;
const ABORT_GRACE_MS = 5_000;

function budget() {
  return navigator.connection?.saveData ? 1 : 2;
}

function foreground() {
  return document.visibilityState !== 'hidden';
}

function settle(entry, value) {
  for (const resolve of entry.waiters.splice(0)) resolve(value);
}

function release(entry, value) {
  if (entry.released) return;
  entry.released = true;
  clearTimeout(entry.runTimer);
  clearTimeout(entry.graceTimer);
  if (running.get(entry.key) === entry) running.delete(entry.key);
  settle(entry, value);
  drain();
}

// A task that ignores its signal must not hold a slot forever: once it has
// been told to stop, it is given a short grace period to settle by itself.
function abortRunning(entry) {
  if (entry.released || entry.aborting) return;
  entry.aborting = true;
  entry.controller.abort();
  entry.graceTimer = setTimeout(() => release(entry, false), entry.graceMs);
}

function start(entry) {
  const controller = new AbortController();
  entry.controller = controller;
  running.set(entry.key, entry);
  entry.runTimer = setTimeout(() => abortRunning(entry), entry.timeoutMs);
  Promise.resolve().then(() => entry.run(controller.signal)).then(
    value => value === undefined ? true : value,
    error => {
      if (error?.name !== 'AbortError') console.warn(`[Midori] Remote task ${entry.key} failed`, error);
      return false;
    },
  ).then(value => release(entry, value));
}

function drain() {
  if (!ready || !foreground()) return;
  if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
  while (running.size < budget() && pending.size) {
    const now = performance.now();
    const next = [...pending.values()]
      .filter(entry => entry.notBeforeMs <= now)
      .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0];
    if (!next) {
      const wait = Math.max(1, Math.min(...[...pending.values()].map(entry => entry.notBeforeMs - now)));
      wakeTimer = setTimeout(drain, wait);
      return;
    }
    pending.delete(next.key);
    start(next);
  }
}

function handleVisibility() {
  if (!foreground()) {
    for (const entry of pending.values()) settle(entry, false);
    pending.clear();
    for (const entry of [...running.values()]) abortRunning(entry);
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
  } else drain();
}

function bind() {
  if (started || typeof window === 'undefined') return;
  started = true;
  ready = Boolean(window.__midoriPerf?.marks?.['interaction-ready']);
  window.addEventListener('midori:perf-mark', event => {
    if (event.detail?.name === 'interaction-ready') { ready = true; drain(); }
  });
  document.addEventListener('visibilitychange', handleVisibility);
}

/**
 * Queues `run` under `key`. Asking again for a key that is already running is ignored (resolves false)
 * unless `supersede` is set: the newest request wins, the running one is aborted and its slot is freed.
 */
export function scheduleRemoteTask(key, run, {
  priority = 0, notBeforeMs = 0, timeoutMs = RUN_LIMIT_MS, graceMs = ABORT_GRACE_MS, supersede = false,
} = {}) {
  bind();
  if (!foreground()) return Promise.resolve(false);
  const existing = pending.get(key);
  if (existing) {
    existing.run = run;
    existing.priority = Math.max(existing.priority, priority);
    existing.notBeforeMs = Math.max(existing.notBeforeMs, notBeforeMs);
    return new Promise(resolve => existing.waiters.push(resolve));
  }
  const active = running.get(key);
  if (active) {
    if (!supersede) return Promise.resolve(false);
    active.aborting = true;
    active.controller.abort();
    release(active, false);
  }
  const entry = { key, run, priority, notBeforeMs, timeoutMs, graceMs, createdAt: performance.now(), waiters: [] };
  pending.set(key, entry);
  const promise = new Promise(resolve => entry.waiters.push(resolve));
  drain();
  return promise;
}

export function cancelRemoteTask(key) {
  const entry = pending.get(key);
  if (entry) { pending.delete(key); settle(entry, false); }
  const active = running.get(key);
  if (active) abortRunning(active);
}

export function remoteTaskState() {
  return { ready, pending: pending.size, running: running.size, budget: budget() };
}
