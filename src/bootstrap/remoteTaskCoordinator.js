const pending = new Map();
const running = new Map();
let ready = false;
let started = false;
let wakeTimer = null;

function budget() {
  return navigator.connection?.saveData ? 1 : 2;
}

function foreground() {
  return document.visibilityState !== 'hidden';
}

function settle(entry, value) {
  for (const resolve of entry.waiters) resolve(value);
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
    const controller = new AbortController();
    running.set(next.key, controller);
    Promise.resolve().then(() => next.run(controller.signal)).then(
      value => value === undefined ? true : value,
      error => {
        if (error?.name !== 'AbortError') console.warn(`[Midori] Remote task ${next.key} failed`, error);
        return false;
      },
    ).then(value => {
      running.delete(next.key);
      settle(next, value);
      drain();
    });
  }
}

function handleVisibility() {
  if (!foreground()) {
    for (const entry of pending.values()) settle(entry, false);
    pending.clear();
    for (const controller of running.values()) controller.abort();
    if (wakeTimer) { clearTimeout(wakeTimer); wakeTimer = null; }
  } else drain();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  ready = Boolean(window.__midoriPerf?.marks?.['interaction-ready']);
  window.addEventListener('midori:perf-mark', event => {
    if (event.detail?.name === 'interaction-ready') { ready = true; drain(); }
  });
  document.addEventListener('visibilitychange', handleVisibility);
}

export function scheduleRemoteTask(key, run, { priority = 0, notBeforeMs = 0 } = {}) {
  start();
  if (!foreground()) return Promise.resolve(false);
  const existing = pending.get(key);
  if (existing) {
    existing.run = run;
    existing.priority = Math.max(existing.priority, priority);
    existing.notBeforeMs = Math.max(existing.notBeforeMs, notBeforeMs);
    return new Promise(resolve => existing.waiters.push(resolve));
  }
  if (running.has(key)) return Promise.resolve(false);
  const entry = { key, run, priority, notBeforeMs, createdAt: performance.now(), waiters: [] };
  pending.set(key, entry);
  const promise = new Promise(resolve => entry.waiters.push(resolve));
  drain();
  return promise;
}

export function cancelRemoteTask(key) {
  const entry = pending.get(key);
  if (entry) { pending.delete(key); settle(entry, false); }
  running.get(key)?.abort();
}

export function remoteTaskState() {
  return { ready, pending: pending.size, running: running.size, budget: budget() };
}
