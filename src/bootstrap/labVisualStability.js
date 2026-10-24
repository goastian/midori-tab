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
