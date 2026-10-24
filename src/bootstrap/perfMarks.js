/**
 * Hitos desde navigationStart. La captura detallada de laboratorio se activa
 * con ?midori-perf=1 y cierra sus observadores después de una ventana acotada.
 */
const MILESTONES = ['boot-start', 'shell-visible', 'early-search-ready', 'vue-ready', 'search-ready', 'interaction-ready', 'above-fold-stable', 'idle-complete'];
const REQUIRED_MILESTONES = ['boot-start', 'shell-visible', 'vue-ready', 'interaction-ready', 'idle-complete'];
const marks = {};
let laboratory = false;
let started = false;
let captureStartMs = null;
let capture = null;
let instrumentationError = null;
let countListeners = false;

function buildReport() {
  const details = capture?.snapshot() || {};
  return { schema: 3, laboratory, bootStartMs: marks['boot-start'] ?? null, captureStartMs,
    ...details, marks: { ...marks }, instrumentationError,
    isComplete: (!laboratory || details.captureComplete === true)
      && REQUIRED_MILESTONES.every(name => Number.isFinite(marks[name])) };
}

function publishSnapshot() {
  if (typeof window !== 'undefined') window.__midoriPerf = buildReport();
}

export function mark(name) {
  if (!MILESTONES.includes(name) || marks[name] !== undefined) return false;
  if (laboratory && name === 'above-fold-stable') return false;
  marks[name] = Math.round(performance.now() * 100) / 100;
  // La barrera remota debe leer el snapshot nuevo al recibir el evento.
  publishSnapshot();
  try {
    window.performance.mark(name);
    window.dispatchEvent(new CustomEvent('midori:perf-mark', { detail: { name, time: marks[name] } }));
  } catch { /* Performance marks are optional outside the laboratory. */ }
  return true;
}

export function setup() {
  if (typeof window === 'undefined' || started) return;
  started = true;
  laboratory = new URLSearchParams(window.location.search).get('midori-perf') === '1';
  captureStartMs = performance.now();
  const earlySearch = performance.getEntriesByName('early-search-ready')[0];
  if (earlySearch) marks['early-search-ready'] = earlySearch.startTime;
  window.__midoriCollectPerf = collect;
  mark('boot-start');
  if (!laboratory) return;
  void import('./labVisualStability.js').then(({ createPerformanceCapture }) => {
    capture = createPerformanceCapture({ marks, captureStartMs, publish: publishSnapshot });
    if (countListeners) capture.enableListenerCounting();
    publishSnapshot();
  }).catch(error => {
    instrumentationError = String(error);
    publishSnapshot();
  });
}

export function enableListenerCounting() {
  if (!laboratory) return;
  countListeners = true;
  capture?.enableListenerCounting();
}

export function collect() {
  capture?.collect();
  publishSnapshot();
  return window.__midoriPerf;
}

export function markIdle() {
  mark('idle-complete');
}

export default { setup, mark, markIdle, enableListenerCounting, collect };
