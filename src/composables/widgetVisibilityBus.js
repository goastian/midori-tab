export const WIDGET_VISIBILITY_OPTIONS = Object.freeze({
  rootMargin: '120px',
  threshold: 0.1,
});

const targets = new Map();
const visibilitySubscribers = new Set();
const focusSubscribers = new Set();

let intersectionObserver = null;
let visibilityBound = false;
let focusBound = false;

function dispatch(target, entries) {
  const subscribers = targets.get(target);
  if (!subscribers) return;
  for (const subscriber of Array.from(subscribers)) {
    subscriber(target, entries);
  }
}

function handleIntersection(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    if (!grouped.has(entry.target)) grouped.set(entry.target, []);
    grouped.get(entry.target).push(entry);
  }
  for (const [target, list] of grouped) {
    dispatch(target, list);
  }
}

function handleVisibilityChange() {
  for (const subscriber of Array.from(visibilitySubscribers)) subscriber();
}

function handleFocus() {
  for (const subscriber of Array.from(focusSubscribers)) subscriber();
}

function ensureIntersectionObserver() {
  if (intersectionObserver || typeof IntersectionObserver === 'undefined') return;
  intersectionObserver = new IntersectionObserver(handleIntersection, WIDGET_VISIBILITY_OPTIONS);
}

function ensureVisibilityListener() {
  if (visibilityBound || typeof document === 'undefined' || visibilitySubscribers.size === 0) return;
  document.addEventListener('visibilitychange', handleVisibilityChange);
  visibilityBound = true;
}

function ensureFocusListener() {
  if (focusBound || typeof window === 'undefined' || focusSubscribers.size === 0) return;
  window.addEventListener('focus', handleFocus);
  focusBound = true;
}

function releaseVisibilityListener() {
  if (!visibilityBound || visibilitySubscribers.size > 0 || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  visibilityBound = false;
}

function releaseFocusListener() {
  if (!focusBound || focusSubscribers.size > 0 || typeof window === 'undefined') return;
  window.removeEventListener('focus', handleFocus);
  focusBound = false;
}

function releaseIntersectionObserver() {
  if (!intersectionObserver || targets.size > 0) return;
  intersectionObserver.disconnect();
  intersectionObserver = null;
}

export function observeWidgetVisibility(target, onEntry) {
  if (!target || typeof onEntry !== 'function') return () => {};

  if (typeof IntersectionObserver === 'undefined') {
    onEntry(target, [{ isIntersecting: true }]);
    return () => {};
  }

  let subscribers = targets.get(target);
  if (!subscribers) {
    subscribers = new Set();
    targets.set(target, subscribers);
  }
  subscribers.add(onEntry);

  ensureIntersectionObserver();
  intersectionObserver.observe(target);

  return () => {
    const current = targets.get(target);
    if (!current) return;
    current.delete(onEntry);
    if (current.size === 0) {
      targets.delete(target);
      intersectionObserver.unobserve(target);
    }
    releaseIntersectionObserver();
  };
}

export function subscribeWidgetVisibility(onChange) {
  visibilitySubscribers.add(onChange);
  ensureVisibilityListener();
  return () => {
    visibilitySubscribers.delete(onChange);
    releaseVisibilityListener();
  };
}

export function subscribeWidgetFocus(onFocus) {
  focusSubscribers.add(onFocus);
  ensureFocusListener();
  return () => {
    focusSubscribers.delete(onFocus);
    releaseFocusListener();
  };
}