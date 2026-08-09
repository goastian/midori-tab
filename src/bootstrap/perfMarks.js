/**
 * PERF-001 — Instrumentación de hitos.
 *
 * Marca los cinco hitos de la sección 2 del plan y recolecta observadores de
 * long tasks, layout shifts y un contador opcional de listeners. Todo queda
 * en memoria (window.__midoriPerf) y se emite un resumen en
 * `midori:perf-report`. No modifica el camino de arranque.
 */

const MILESTONES = ['boot-start', 'shell-visible', 'search-ready', 'above-fold-stable', 'idle-complete'];

const state = {
  marks: {},
  longTasks: [],
  layoutShifts: [],
  nodeCount: 0,
  listeners: { added: 0, removed: 0, counting: false },
};

let longTaskObserver = null;
let layoutShiftObserver = null;
let nativeAdd = null;
let nativeRemove = null;

function now() {
  return typeof window !== 'undefined' && 'performance' in window ? window.performance.now() : Date.now();
}

function bootStart() {
  state.bootStartMs = now();
}

export function mark(name) {
  if (!MILESTONES.includes(name)) return false;
  if (state.marks[name] !== undefined) return false;

  state.marks[name] = name === 'boot-start'
    ? 0
    : state.bootStartMs !== undefined
      ? Math.round((now() - state.bootStartMs) * 100) / 100
      : 0;

  try {
    window.performance.mark(name);
  } catch {
    /* not supported */
  }

  if (name === 'shell-visible' || name === 'above-fold-stable') {
    captureNodes();
  }

  publishSnapshot();

  return true;
}

function captureNodes() {
  try {
    state.nodeCount = document.querySelectorAll('*').length;
  } catch {
    state.nodeCount = 0;
  }
}

export function setup() {
  if (typeof window === 'undefined') return;

  bootStart();
  mark('boot-start');

  try {
    if (typeof window.PerformanceObserver === 'undefined') return;

    longTaskObserver = new window.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'longtask') {
          state.longTasks.push({
            startMs: Math.round(entry.startTime * 100) / 100,
            durationMs: Math.round(entry.duration * 100) / 100,
          });
        }
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true });

    layoutShiftObserver = new window.PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
          state.layoutShifts.push(entry.value);
        }
      }
    });
    layoutShiftObserver.observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* observadores no disponibles */
  }
}

export function enableListenerCounting() {
  if (typeof window === 'undefined' || state.listeners.counting) return;
  const proto = window.EventTarget && window.EventTarget.prototype;
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
  const totalLongTaskMs = state.longTasks.reduce((acc, entry) => acc + entry.durationMs, 0);
  const totalLayoutShift = state.layoutShifts.reduce((acc, value) => acc + value, 0);

  return {
    schema: 1,
    bootStartMs: state.bootStartMs ?? 0,
    isComplete: MILESTONES.every((name) => state.marks[name] !== undefined),
    marks: { ...state.marks },
    longTasks: {
      count: state.longTasks.length,
      totalMs: Math.round(totalLongTaskMs * 100) / 100,
      records: state.longTasks,
    },
    cls: Math.round(totalLayoutShift * 1000) / 1000,
    nodes: state.nodeCount,
    listeners: { ...state.listeners },
    browser: getBrowserSummary(),
  };
}

function publishSnapshot() {
  if (typeof window === 'undefined') return;
  try {
    window.__midoriPerf = buildReport();
  } catch {
    /* best-effort */
  }
}

export function collect() {
  const report = buildReport();
  try {
    window.__midoriPerf = report;
    window.dispatchEvent(
      new CustomEvent('midori:perf-report', { detail: report }),
    );
  } catch {
    /* best-effort */
  }
  disconnect();
  return report;
}

function disconnect() {
  try {
    longTaskObserver?.disconnect();
    layoutShiftObserver?.disconnect();
    if (state.listeners.counting && window.EventTarget) {
      window.EventTarget.prototype.addEventListener = nativeAdd;
      window.EventTarget.prototype.removeEventListener = nativeRemove;
    }
  } catch {
    /* ignore */
  }
  longTaskObserver = null;
  layoutShiftObserver = null;
}

export function markIdle() {
  mark('idle-complete');
  publishSnapshot();
}

export default {
  setup,
  mark,
  markIdle,
  enableListenerCounting,
  collect,
};