/**
 * PERF-207 — Canal compartido de resize/layout.
 *
 * Un solo listener de `window resize` (throttled por rAF) y un solo
 * `ResizeObserver` entregan cambios de tamaño a dashboard, speed dials y
 * launcher. Los consumidores se registran/desregistran; no crean infraestructura
 * idéntica por instancia. El observer se desconecta al quedar vacío.
 */

const elementTargets = new Map();
const windowSubscribers = new Set();

let resizeObserver = null;
let resizeBound = false;
let resizeFrame = null;

function dispatchWindowSize() {
  const width = typeof window === 'undefined' ? 0 : window.innerWidth;
  const height = typeof window === 'undefined' ? 0 : window.innerHeight;
  for (const subscriber of Array.from(windowSubscribers)) subscriber({ width, height });
}

function handleWindowResize() {
  if (resizeFrame || windowSubscribers.size === 0) return;
  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = null;
    dispatchWindowSize();
  });
}

function handleResizeObserverEntry(target, entries) {
  const subscribers = elementTargets.get(target);
  if (!subscribers) return;
  const entry = entries[0];
  const size = {
    width: Number(entry?.contentRect?.width) || 0,
    height: Number(entry?.contentRect?.height) || 0,
  };
  for (const subscriber of Array.from(subscribers)) subscriber(size);
}

function handleResizeObserver(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.target)) grouped.set(entry.target, []);
    grouped.get(entry.target).push(entry);
  }
  for (const [target, list] of grouped) {
    handleResizeObserverEntry(target, list);
  }
}

function ensureResizeObserver() {
  if (resizeObserver || typeof ResizeObserver === 'undefined') return;
  resizeObserver = new ResizeObserver(handleResizeObserver);
}

function ensureWindowListener() {
  if (resizeBound || typeof window === 'undefined' || windowSubscribers.size === 0) return;
  window.addEventListener('resize', handleWindowResize, { passive: true });
  resizeBound = true;
}

function releaseWindowListener() {
  if (!resizeBound || windowSubscribers.size > 0 || typeof window === 'undefined') return;
  window.removeEventListener('resize', handleWindowResize);
  resizeBound = false;
}

function releaseResizeObserver() {
  if (!resizeObserver || elementTargets.size > 0) return;
  resizeObserver.disconnect();
  resizeObserver = null;
}

export function subscribeViewportSize(onSize) {
  windowSubscribers.add(onSize);
  if (typeof window !== 'undefined') {
    onSize({ width: window.innerWidth, height: window.innerHeight });
  }
  ensureWindowListener();
  return () => {
    windowSubscribers.delete(onSize);
    releaseWindowListener();
  };
}

export function observeElementSize(target, onSize) {
  if (!target || typeof onSize !== 'function') return () => {};

  if (typeof ResizeObserver === 'undefined') {
    onSize({
      width: Number(target.clientWidth) || 0,
      height: Number(target.clientHeight) || 0,
    });
    return () => {};
  }

  let subscribers = elementTargets.get(target);
  if (!subscribers) {
    subscribers = new Set();
    elementTargets.set(target, subscribers);
  }
  subscribers.add(onSize);

  ensureResizeObserver();
  resizeObserver.observe(target);

  return () => {
    const current = elementTargets.get(target);
    if (!current) return;
    current.delete(onSize);
    if (current.size === 0) {
      elementTargets.delete(target);
      resizeObserver.unobserve(target);
    }
    releaseResizeObserver();
  };
}