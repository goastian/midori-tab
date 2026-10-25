import {
  observeWidgetVisibility,
  subscribeWidgetVisibility,
  subscribeWidgetFocus,
} from './widgetVisibilityBus.js';
import { cancelRemoteTask, scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';

export const WIDGET_COST = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

function isForegroundDocument() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function noop() {}

const DEFAULT_RETRY_AFTER_MS = 30_000;

export function createWidgetRuntime(component, policy = {}, hooks = {}) {
  let unobserve = null;
  let unsubscribeVisibility = null;
  let unsubscribeFocus = null;
  let refreshTimer = null;
  let visible = Boolean(policy.eager);
  let foreground = isForegroundDocument();
  let lastRunAt = 0;
  let lastFailureAt = 0;
  let epoch = 0;
  let active = visible && foreground;

  const getRoot = () => {
    if (typeof hooks.getRoot === 'function') return hooks.getRoot();
    return component?.$el || null;
  };

  const canRun = () => visible && foreground;

  const clearRefreshTimer = () => {
    if (!refreshTimer) return;
    clearTimeout(refreshTimer);
    refreshTimer = null;
  };

  const shouldRun = (force = false) => {
    if (force) return true;
    const now = Date.now();
    // Returning to the tab must not repeat a refresh that has just failed
    // (offline, provider error): it would only flash a loading state again.
    if (lastFailureAt && now - lastFailureAt < (policy.retryAfterMs ?? DEFAULT_RETRY_AFTER_MS)) return false;
    if (!policy.ttlMs || !lastRunAt) return true;
    return now - lastRunAt >= policy.ttlMs;
  };

  const runWhenVisible = async (task, options = {}) => {
    const force = Boolean(options.force);
    if (!canRun() && !options.allowHidden) return false;
    if (!shouldRun(force)) return false;
    const execute = async () => {
      if (!canRun()) return false;
      const mine = ++epoch;
      try {
        const result = await task();
        // A newer refresh took over: this result must not be recorded as a success or a failure.
        if (mine !== epoch || !canRun()) return false;
        if (result === false) { lastFailureAt = Date.now(); return false; }
        lastRunAt = Date.now();
        lastFailureAt = 0;
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        console.warn(`[Midori] Widget ${policy.key} refresh failed`, error);
        if (mine === epoch && canRun()) lastFailureAt = Date.now();
        return false;
      }
    };
    return policy.usesNetwork
      ? scheduleRemoteTask(`widget:${policy.key}`, execute, { priority: policy.cost === WIDGET_COST.HIGH ? 2 : 1, supersede: force })
      : execute();
  };

  const scheduleRefresh = (task, delayMs = policy.ttlMs) => {
    clearRefreshTimer();
    if (!delayMs || !canRun()) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      runWhenVisible(task).catch(noop);
    }, delayMs);
  };

  const syncActiveState = () => {
    const nextActive = canRun();
    if (nextActive === active) return;
    active = nextActive;
    if (active) {
      if (typeof hooks.onVisible === 'function') hooks.onVisible();
      return;
    }
    clearRefreshTimer();
    if (policy.usesNetwork) cancelRemoteTask(`widget:${policy.key}`);
    if (typeof hooks.onHidden === 'function') hooks.onHidden();
  };

  const handleVisibility = () => {
    foreground = isForegroundDocument();
    syncActiveState();
  };

  const handleFocus = () => {
    foreground = true;
    if (canRun() && typeof hooks.onFocus === 'function') hooks.onFocus();
    syncActiveState();
  };

  const mount = () => {
    foreground = isForegroundDocument();

    unsubscribeVisibility = subscribeWidgetVisibility(handleVisibility);
    unsubscribeFocus = subscribeWidgetFocus(handleFocus);

    const root = getRoot();
    if (root && typeof IntersectionObserver !== 'undefined') {
      unobserve = observeWidgetVisibility(root, (_target, entries) => {
        const entry = entries[0];
        visible = Boolean(entry?.isIntersecting);
        syncActiveState();
      });
    } else {
      visible = true;
      syncActiveState();
    }
  };

  const dispose = () => {
    clearRefreshTimer();
    if (policy.usesNetwork) cancelRemoteTask(`widget:${policy.key}`);
    if (unobserve) {
      unobserve();
      unobserve = null;
    }
    if (unsubscribeVisibility) {
      unsubscribeVisibility();
      unsubscribeVisibility = null;
    }
    if (unsubscribeFocus) {
      unsubscribeFocus();
      unsubscribeFocus = null;
    }
  };

  return {
    policy,
    mount,
    dispose,
    canRun,
    isVisible: () => visible,
    isForeground: () => foreground,
    runWhenVisible,
    scheduleRefresh,
    clearRefreshTimer,
    shouldRun,
    get lastRunAt() {
      return lastRunAt;
    },
    get lastFailureAt() {
      return lastFailureAt;
    },
  };
}
