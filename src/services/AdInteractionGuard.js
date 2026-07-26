export const MIN_POINTER_INTERACTION_MS = 500;

function monotonicNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

/**
 * Blocks only pointer clicks that land immediately after a sponsored shortcut
 * appears. Keyboard activation remains available without an artificial delay.
 */
export function createAdInteractionGuard({
  now = monotonicNow,
  minimumMs = MIN_POINTER_INTERACTION_MS,
} = {}) {
  let visibleAt = Number(now());

  function reset() {
    visibleAt = Number(now());
  }

  function evaluate({ keyboard = false } = {}) {
    const interactionLatencyMs = Math.max(0, Math.round(Number(now()) - visibleAt));
    return {
      allowed: Boolean(keyboard) || interactionLatencyMs >= Math.max(0, Number(minimumMs) || 0),
      interactionLatencyMs,
    };
  }

  return { evaluate, reset };
}
