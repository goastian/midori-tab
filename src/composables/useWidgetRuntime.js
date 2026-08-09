import {
  observeWidgetVisibility,
  subscribeWidgetVisibility,
  subscribeWidgetFocus,
} from './widgetVisibilityBus.js';

export const WIDGET_COST = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

function isForegroundDocument() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function noop() {}

export function createWidgetRuntime(component, policy = {}, hooks = {}) {
  let unobserve = null;
  let unsubscribeVisibility = null;
  let unsubscribeFocus = null;
  let refreshTimer = null;
  let visible = Boolean(policy.eager);
  let foreground = isForegroundDocument();
  let lastRunAt = 0;
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
    if (!policy.ttlMs || !lastRunAt) return true;
    return Date.now() - lastRunAt >= policy.ttlMs;
  };

  const runWhenVisible = async (task, options = {}) => {
    const force = Boolean(options.force);
    if (!canRun() && !options.allowHidden) return false;
    if (!shouldRun(force)) return false;
    lastRunAt = Date.now();
    await task();
    return true;
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
  };
}
