const SAMPLE_INTERVAL_MS = 100;
const QUIET_WINDOW_MS = 500;
const MAX_ELEMENTS = 2000;

export function createVisualStabilityTracker() {
  const startedAtMs = performance.now();
  const ids = new WeakMap();
  let nextId = 0;
  let signature = '';
  let lastChangeMs = null;
  let pendingImages = 0;
  let activeAnimations = 0;
  let fontsPending = false;
  let overflow = false;
  let inspectionMs = 0;
  let stopped = false;

  const visible = element => {
    if (!(element instanceof Element)) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < innerHeight && rect.left < innerWidth;
  };

  function inspect() {
    if (stopped) return;
    const started = performance.now();
    const parts = [`${innerWidth}:${innerHeight}:${scrollX}:${scrollY}`];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let count = 0;
    let element;
    const previousPendingImages = pendingImages;
    const previousActiveAnimations = activeAnimations;
    const previousFontsPending = fontsPending;
    pendingImages = 0;
    while ((element = walker.nextNode())) {
      if (++count > MAX_ELEMENTS) { overflow = true; break; }
      if (!visible(element)) continue;
      if (!ids.has(element)) ids.set(element, ++nextId);
      const rect = element.getBoundingClientRect();
      parts.push([ids.get(element), rect.x, rect.y, rect.width, rect.height]
        .map(value => Math.round(value * 10) / 10).join(':'));
      if (element instanceof HTMLImageElement && (element.currentSrc || element.getAttribute('src')) && !element.complete) pendingImages += 1;
    }
    activeAnimations = (document.getAnimations?.() || []).filter(animation =>
      animation.playState === 'running' && visible(animation.effect?.target)).length;
    fontsPending = document.fonts?.status === 'loading';
    const nextSignature = parts.join('|');
    if (nextSignature !== signature || activeAnimations !== previousActiveAnimations
      || pendingImages !== previousPendingImages || fontsPending !== previousFontsPending) {
      signature = nextSignature;
      lastChangeMs = performance.now();
    }
    inspectionMs += performance.now() - started;
  }

  const onMutations = records => {
    if (records.some(record => visible(record.target instanceof Element ? record.target : record.target.parentElement))) {
      lastChangeMs = performance.now();
    }
  };
  const mutationObserver = new MutationObserver(onMutations);
  mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  const onImage = event => {
    if (event.target instanceof HTMLImageElement && visible(event.target)) lastChangeMs = performance.now();
  };
  document.addEventListener('load', onImage, true);
  document.addEventListener('error', onImage, true);
  inspect();
  const interval = setInterval(inspect, SAMPLE_INTERVAL_MS);

  function snapshot() {
    return {
      method: 'visible-dom-geometry',
      supported: true,
      startedAtMs,
      lastChangeMs,
      stable: lastChangeMs !== null && performance.now() - lastChangeMs >= QUIET_WINDOW_MS
        && !pendingImages && !activeAnimations && !fontsPending && !overflow,
      quietWindowMs: QUIET_WINDOW_MS,
      samplingIntervalMs: SAMPLE_INTERVAL_MS,
      pendingImages,
      activeAnimations,
      fontsPending,
      overflow,
      inspectionMs: Math.round(inspectionMs * 100) / 100,
    };
  }

  return {
    snapshot,
    stop() {
      onMutations(mutationObserver.takeRecords());
      inspect();
      stopped = true;
      clearInterval(interval);
      mutationObserver.disconnect();
      document.removeEventListener('load', onImage, true);
      document.removeEventListener('error', onImage, true);
      return snapshot();
    },
  };
}

export function createPerformanceCapture({ marks, captureStartMs, publish }) {
  const captureDurationMs = 5000;
  const maxEntries = 1000;
  const longTasks = [];
  const layoutShifts = [];
  const capabilities = { longTasks: false, layoutShift: false, visualStability: true };
  const listeners = { added: 0, removed: 0, counting: false };
  const visualTracker = createVisualStabilityTracker();
  const observerInstalledAtMs = performance.now();
  let buffersTruncated = false;
  let captureEndMs = null;
  let visualResult = null;
  let nodeCount = null;
  let nativeAdd;
  let nativeRemove;

  function append(target, entry) {
    if (target.length < maxEntries) target.push(entry);
    else buffersTruncated = true;
  }
  const recordLongTask = entry => append(longTasks, { startMs: entry.startTime, durationMs: entry.duration });
  const recordLayoutShift = entry => {
    if (!entry.hadRecentInput) append(layoutShifts, { startMs: entry.startTime, value: entry.value });
  };
  function observe(type, capability, record) {
    if (!window.PerformanceObserver?.supportedEntryTypes?.includes(type)) return null;
    try {
      const observer = new PerformanceObserver(list => list.getEntries().forEach(record));
      observer.observe({ type, buffered: true });
      capabilities[capability] = true;
      return observer;
    } catch { return null; }
  }
  const longTaskObserver = observe('longtask', 'longTasks', recordLongTask);
  const layoutShiftObserver = observe('layout-shift', 'layoutShift', recordLayoutShift);

  function cumulativeLayoutShift() {
    let maximum = 0;
    let sum = 0;
    let first = 0;
    let previous = 0;
    for (const entry of [...layoutShifts].sort((a, b) => a.startMs - b.startMs)) {
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

  function snapshot() {
    const ready = Math.max(marks['shell-visible'] || 0, marks['interaction-ready'] || 0);
    const sum = (entries, blocking) => entries.reduce((total, entry) => total + (blocking ? Math.max(0, entry.durationMs - 50) : entry.durationMs), 0);
    return {
      captureComplete: captureEndMs !== null, captureEndMs, observerInstalledAtMs,
      captureDurationMs: captureEndMs === null ? null : captureEndMs - captureStartMs,
      capabilities: { ...capabilities },
      longTasks: { supported: capabilities.longTasks, count: capabilities.longTasks ? longTasks.length : null,
        totalMs: capabilities.longTasks ? sum(longTasks, false) : null,
        blockingMs: capabilities.longTasks ? sum(longTasks, true) : null,
        beforeInteractionBlockingMs: capabilities.longTasks ? sum(longTasks.filter(entry => entry.startMs < ready), true) : null,
        records: longTasks.map(entry => ({ ...entry })) },
      cls: capabilities.layoutShift ? cumulativeLayoutShift() : null,
      layoutShiftRecords: layoutShifts.map(entry => ({ ...entry })),
      visualStability: visualResult || visualTracker.snapshot(), buffersTruncated, nodes: nodeCount,
      listeners: { ...listeners },
      browser: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemory: navigator.deviceMemory ?? null, saveData: navigator.connection?.saveData ?? null,
        effectiveType: navigator.connection?.effectiveType ?? null },
    };
  }

  function collect() {
    if (captureEndMs !== null || performance.now() - captureStartMs < captureDurationMs) return;
    for (const entry of longTaskObserver?.takeRecords() || []) recordLongTask(entry);
    for (const entry of layoutShiftObserver?.takeRecords() || []) recordLayoutShift(entry);
    visualResult = visualTracker.stop();
    if (visualResult.stable) marks['above-fold-stable'] = visualResult.lastChangeMs;
    nodeCount = document.querySelectorAll('*').length;
    captureEndMs = performance.now();
    clearTimeout(timer);
    longTaskObserver?.disconnect();
    layoutShiftObserver?.disconnect();
    if (listeners.counting) {
      EventTarget.prototype.addEventListener = nativeAdd;
      EventTarget.prototype.removeEventListener = nativeRemove;
    }
    publish();
    window.dispatchEvent(new CustomEvent('midori:perf-report', { detail: window.__midoriPerf }));
  }
  const timer = setTimeout(collect, Math.max(1, captureDurationMs + 1 - (performance.now() - captureStartMs)));

  function enableListenerCounting() {
    if (listeners.counting || captureEndMs !== null) return;
    listeners.counting = true;
    nativeAdd = EventTarget.prototype.addEventListener;
    nativeRemove = EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener = function (...args) {
      listeners.added += 1;
      return nativeAdd.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      listeners.removed += 1;
      return nativeRemove.apply(this, args);
    };
  }
  return { snapshot, collect, enableListenerCounting };
}
