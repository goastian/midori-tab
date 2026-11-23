import { markRaw, watch } from 'vue';
import useAdsStore from '../stores/useAdsStore.js';
import { createAdViewabilityTracker } from './AdViewability.js';
import { createAdExposureTracker } from './AdExposure.js';
import { createAdInteractionGuard } from './AdInteractionGuard.js';
import { scheduleRemoteTask, cancelRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';

export function createBookmarkAdSession(key, callbacks = {}) {
  const store = useAdsStore(key);
  const guard = createAdInteractionGuard();
  let element = null, observer = null, viewability = null, exposure = null, loading = null;
  let reported = false, reportTimer = null, performanceObserver = null, layoutShift = 0;
  const task = `ads-decision:${key}`;

  function pageVisible() {
    return document.visibilityState === 'visible' && document.hasFocus() && !callbacks.isInfoOpen?.();
  }

  async function load() {
    if (loading) return loading;
    loading = scheduleRemoteTask(task, signal => store.loadAd(false, { signal }), { priority: 1 });
    try { return await loading; } finally { loading = null; }
  }

  function reportPerformance() {
    if (reported || !store.currentAd) return;
    reported = true;
    void store.trackClientEvent('client_performance', { request_latency_ms: Math.max(0, Math.round(store.requestLatencyMs || 0)),
      layout_shift_micros: Math.max(0, Math.round(layoutShift * 1_000_000)) });
  }

  function disconnect() {
    exposure?.dispose(); exposure = null;
    viewability?.dispose(); viewability = null;
    observer?.disconnect(); observer = null;
    performanceObserver?.disconnect(); performanceObserver = null;
    clearTimeout(reportTimer); reportTimer = null;
  }

  function observe() {
    disconnect();
    if (!element) return;
    if (store.currentAd) {
      const ad = store.currentAd;
      exposure = createAdExposureTracker({ ad, onStart: id => { store.currentExposureId = id; },
        onFinish: event => { if (store.currentExposureId === event.event_id) store.currentExposureId = null; void store.trackExposure(ad, event); } });
      viewability = createAdViewabilityTracker({ onViewable: async () => {
        if (await store.trackImpression()) callbacks.onImpression?.(ad);
      } });
      visibility();
      if (!reported) reportTimer = setTimeout(reportPerformance, 2000);
      if (typeof PerformanceObserver !== 'undefined') try {
        performanceObserver = new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput && (!entry.sources?.length
            || entry.sources.some(source => source.node === element || (source.node && element?.contains(source.node))))) layoutShift += Number(entry.value || 0);
        });
        performanceObserver.observe({ type: 'layout-shift', buffered: true });
      } catch { }
    }
    if (typeof IntersectionObserver === 'undefined') { void load(); return; }
    observer = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (!entry) return;
      if (!store.hasAd) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) void load();
      } else { viewability?.update(entry); exposure?.update(entry); }
    }, { threshold: [0, 0.5, 1] });
    observer.observe(element);
  }

  function visibility() {
    viewability?.setPageVisible(pageVisible());
    exposure?.setPageVisible(pageVisible());
    if (element && document.visibilityState === 'visible' && !store.hasAd) observe();
  }

  const stop = watch(() => store.currentAd, ad => {
    if (ad && store.source !== 'cached') guard.reset();
    observe();
  });

  return markRaw({
    store,
    bind(node) {
      if (node === element) return;
      element = node;
      if (!node) { cancelRemoteTask(task); disconnect(); }
      else { void store.restoreCreative(); observe(); }
    },
    visibility,
    finish(reason) { exposure?.finish(reason); },
    async decision() { await store.loadAd(); return store.currentAd; },
    async open(event) {
      const intent = guard.evaluate({ keyboard: event?.detail === 0 });
      if (!intent.allowed) {
        void store.trackClientEvent('accidental_click_guard', { interaction_latency_ms: intent.interactionLatencyMs });
        callbacks.onBlocked?.(store.displayAd);
        return;
      }
      const ad = await this.decision();
      if (ad && store.trackClick(intent.interactionLatencyMs)) { exposure?.finish('navigation'); callbacks.onClick?.(ad); }
    },
    dispose() { reportPerformance(); stop(); cancelRemoteTask(task); disconnect(); element = null; },
  });
}
