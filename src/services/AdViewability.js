export const AD_VIEWABILITY_THRESHOLD = 0.5;
export const AD_VIEWABILITY_DWELL_MS = 1000;

/**
 * Small state machine for one viewable impression.
 *
 * It deliberately knows nothing about ads or DOM APIs, which keeps the
 * 50%-for-1-second rule deterministic and testable.
 */
export function createAdViewabilityTracker({
  onViewable,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  dwellMs = AD_VIEWABILITY_DWELL_MS,
  threshold = AD_VIEWABILITY_THRESHOLD,
} = {}) {
  let timerId = null;
  let tracked = false;
  let pageVisible = true;
  let lastEntry = null;

  function cancel() {
    if (timerId === null) return;
    clearTimer(timerId);
    timerId = null;
  }

  function evaluate() {
    if (tracked) return;

    const ratio = Number(lastEntry?.intersectionRatio || 0);
    const isViewable = pageVisible
      && Boolean(lastEntry?.isIntersecting)
      && ratio >= threshold;
    if (!isViewable) {
      cancel();
      return;
    }

    if (timerId !== null) return;
    timerId = setTimer(() => {
      timerId = null;
      tracked = true;
      if (typeof onViewable === 'function') onViewable();
    }, dwellMs);
  }

  function update(entry = {}) {
    lastEntry = entry;
    evaluate();
  }

  function setPageVisible(visible) {
    pageVisible = Boolean(visible);
    evaluate();
  }

  function dispose() {
    cancel();
    lastEntry = null;
  }

  return {
    update,
    cancel,
    dispose,
    setPageVisible,
    get pending() {
      return timerId !== null;
    },
    get hasTracked() {
      return tracked;
    },
  };
}
