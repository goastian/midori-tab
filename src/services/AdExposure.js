import { createRandomUuid } from './AdsService.js';

export function createAdExposureTracker({ ad, onStart, onFinish, now = () => performance.now() }) {
  let entry = null;
  let pageVisible = false;
  let current = null;
  let disposed = false;
  const expiresIn = Math.max(0, Number(ad.expires_at) * 1000 - Date.now());
  const deadline = now() + expiresIn;
  const expiryTimer = setTimeout(() => finish('expired'), expiresIn);

  function finish(reason = 'hidden') {
    if (!current) return;
    const ended = current;
    current = null;
    const duration = Math.max(0, Math.min(900000, Math.floor(Math.min(now(), deadline) - ended.started)));
    onFinish({ event_id: ended.id, event_type: 'exposure_finished', surface: 'new_tab',
      elapsed_ms: duration, visible_ms: duration, viewable: duration >= 1000, end_reason: reason });
  }

  function evaluate(reason) {
    const visible = !disposed && pageVisible && entry?.isIntersecting && entry.intersectionRatio >= 0.5 && now() < deadline;
    if (!visible) finish(reason);
    else if (!current) {
      current = { id: createRandomUuid(), started: now() };
      onStart(current.id);
    }
  }

  return {
    update(value) { entry = value; evaluate('out_of_view'); },
    setPageVisible(value) { pageVisible = Boolean(value); evaluate('hidden'); },
    finish,
    dispose(reason = 'unmounted') { disposed = true; clearTimeout(expiryTimer); finish(reason); },
    get id() { return current?.id ?? null; },
  };
}
