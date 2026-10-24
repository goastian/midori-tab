/**
 * Hitos desde navigationStart. La captura detallada de laboratorio se activa
 * con ?midori-perf=1 y cierra sus observadores después de una ventana acotada.
 */
const MILESTONES = ['boot-start', 'shell-visible', 'search-ready', 'interaction-ready', 'above-fold-stable', 'idle-complete'];
const REQUIRED_MILESTONES = ['boot-start', 'shell-visible', 'interaction-ready', 'idle-complete'];
const CAPTURE_DURATION_MS = 5000;
const MAX_ENTRIES = 1000;
const state = {
  marks: {},
  longTasks: [],
  layoutShifts: [],
  nodeCount: 0,
  buffersTruncated: false,
  capabilities: { longTasks: false, layoutShift: false, visualStability: false },
  listeners: { added: 0, removed: 0, counting: false },
};
let longTaskObserver = null;
let layoutShiftObserver = null;
let nativeAdd = null;
let nativeRemove = null;
let completionTimer = null;
let visualTracker = null;
let visualResult = null;
let laboratory = false;
let started = false;
let collected = false;

function now() {
  return typeof window !== 'undefined' && 'performance' in window ? window.performance.now() : Date.now();
}

function appendBounded(target, entry) {
  if (target.length < MAX_ENTRIES) target.push(entry);
  else state.buffersTruncated = true;
}

function recordLongTask(entry) {
  appendBounded(state.longTasks, { startMs: entry.startTime, durationMs: entry.duration });
}

function recordLayoutShift(entry) {
  if (!entry.hadRecentInput) appendBounded(state.layoutShifts, { startMs: entry.startTime, value: entry.value });
}

function cumulativeLayoutShift() {
  let maximum = 0;
  let sum = 0;
  let first = 0;
  let previous = 0;
  for (const entry of [...state.layoutShifts].sort((a, b) => a.startMs - b.startMs)) {
    if (!sum || entry.startMs - previous >= 1000 || entry.startMs - first >= 5000) {
      first = entry.startMs;
      sum = 0;
    }
    sum += entry.value;
    previous = entry.startMs;
    maximum = Math.max(maximum, sum);
  }
  return maximum;
}

export function mark(name) {
  if (!MILESTONES.includes(name) || state.marks[name] !== undefined) return false;
  if (laboratory && name === 'above-fold-stable') return false;
  state.marks[name] = Math.round(now() * 100) / 100;
  if (name === 'shell-visible') captureNodes();
  // La barrera remota debe leer el snapshot nuevo al recibir el evento.
  publishSnapshot();
  try {
    window.performance.mark(name);
    window.dispatchEvent(new CustomEvent('midori:perf-mark', { detail: { name, time: state.marks[name] } }));
  } catch { /* Performance marks are optional outside the laboratory. */ }
  return true;
}

function captureNodes() {
  state.nodeCount = document.querySelectorAll('*').length;
}

export function setup() {
  if (typeof window === 'undefined' || started) return;
  started = true;
  laboratory = new URLSearchParams(window.location.search).get('midori-perf') === '1';
  state.captureStartMs = now();
  state.bootStartMs = state.captureStartMs;
  window.__midoriCollectPerf = collect;
  mark('boot-start');
  if (!laboratory) return;

  const supported = window.PerformanceObserver?.supportedEntryTypes || [];
  if (supported.includes('longtask')) {
    try {
      longTaskObserver = new PerformanceObserver(list => list.getEntries().forEach(recordLongTask));
      longTaskObserver.observe({ type: 'longtask', buffered: true });
      state.capabilities.longTasks = true;
    } catch { longTaskObserver = null; }
  }
  if (supported.includes('layout-shift')) {
    try {
      layoutShiftObserver = new PerformanceObserver(list => list.getEntries().forEach(recordLayoutShift));
      layoutShiftObserver.observe({ type: 'layout-shift', buffered: true });
      state.capabilities.layoutShift = true;
    } catch { layoutShiftObserver = null; }
  }
  void import('./labVisualStability.js').then(({ createVisualStabilityTracker }) => {
    if (collected) return;
    visualTracker = createVisualStabilityTracker();
    state.capabilities.visualStability = true;
    publishSnapshot();
  }).catch(error => {
    visualResult = { method: 'visible-dom-geometry', supported: false, stable: false, error: error.message };
    publishSnapshot();
  });
  completionTimer = setTimeout(collect, CAPTURE_DURATION_MS + 1);
}

export function enableListenerCounting() {
  if (typeof window === 'undefined' || state.listeners.counting) return;
  const proto = window.EventTarget?.prototype;
  if (!proto) return;
  state.listeners.counting = true;
  nativeAdd = proto.addEventListener;
  nativeRemove = proto.removeEventListener;
  proto.addEventListener = function (...args) {
    state.listeners.added += 1;
    return nativeAdd.apply(this, args);
  };
  proto.removeEventListener = function (...args) {
    state.listeners.removed += 1;
    return nativeRemove.apply(this, args);
  };
}

function getBrowserSummary() {
  return {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    deviceMemory: navigator.deviceMemory ?? null,
    saveData: navigator.connection?.saveData ?? null,
    effectiveType: navigator.connection?.effectiveType ?? null,
  };
}

function buildReport() {
  const ready = Math.max(state.marks['shell-visible'] || 0, state.marks['interaction-ready'] || 0);
  const sum = (entries, blocking) => entries.reduce((total, entry) => total + (blocking ? Math.max(0, entry.durationMs - 50) : entry.durationMs), 0);
  const visual = visualResult || visualTracker?.snapshot() || { method: 'visible-dom-geometry', supported: false, stable: false };
  return {
    schema: 3,
    laboratory,
    bootStartMs: state.bootStartMs ?? null,
    isComplete: (!laboratory || collected) && REQUIRED_MILESTONES.every(name => Number.isFinite(state.marks[name])),
    captureComplete: collected,
    captureStartMs: state.captureStartMs ?? null,
    captureEndMs: state.captureEndMs ?? null,
    captureDurationMs: state.captureEndMs === undefined ? null : state.captureEndMs - state.captureStartMs,
    marks: { ...state.marks },
    capabilities: { ...state.capabilities },
    longTasks: {
      supported: state.capabilities.longTasks,
      count: state.capabilities.longTasks ? state.longTasks.length : null,
      totalMs: state.capabilities.longTasks ? sum(state.longTasks, false) : null,
      blockingMs: state.capabilities.longTasks ? sum(state.longTasks, true) : null,
      beforeInteractionBlockingMs: state.capabilities.longTasks ? sum(state.longTasks.filter(entry => entry.startMs < ready), true) : null,
      records: state.longTasks.map(entry => ({ ...entry })),
    },
    cls: state.capabilities.layoutShift ? cumulativeLayoutShift() : null,
    layoutShiftRecords: state.layoutShifts.map(entry => ({ ...entry })),
    visualStability: visual,
    buffersTruncated: state.buffersTruncated,
    nodes: state.nodeCount,
    listeners: { ...state.listeners },
    browser: getBrowserSummary(),
  };
}

function publishSnapshot() {
  if (typeof window !== 'undefined') window.__midoriPerf = buildReport();
}

export function collect() {
  if (collected) return buildReport();
  if (laboratory && now() - state.captureStartMs < CAPTURE_DURATION_MS) return buildReport();
  for (const entry of longTaskObserver?.takeRecords?.() || []) recordLongTask(entry);
  for (const entry of layoutShiftObserver?.takeRecords?.() || []) recordLayoutShift(entry);
  visualResult = visualTracker?.stop() || visualResult;
  if (visualResult?.stable) state.marks['above-fold-stable'] = visualResult.lastChangeMs;
  captureNodes();
  state.captureEndMs = now();
  collected = true;
  if (completionTimer) clearTimeout(completionTimer);
  longTaskObserver?.disconnect();
  layoutShiftObserver?.disconnect();
  longTaskObserver = null;
  layoutShiftObserver = null;
  if (state.listeners.counting && window.EventTarget) {
    window.EventTarget.prototype.addEventListener = nativeAdd;
    window.EventTarget.prototype.removeEventListener = nativeRemove;
  }
  const report = buildReport();
  window.__midoriPerf = report;
  window.dispatchEvent(new CustomEvent('midori:perf-report', { detail: report }));
  return report;
}

export function markIdle() {
  mark('idle-complete');
}

export default { setup, mark, markIdle, enableListenerCounting, collect };
