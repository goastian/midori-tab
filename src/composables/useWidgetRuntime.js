export const WIDGET_COST = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
});

const DEFAULT_ROOT_MARGIN = '120px';
const DEFAULT_THRESHOLD = 0.1;

function isForegroundDocument() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

function noop() {}

export function createWidgetRuntime(component, policy = {}, hooks = {}) {
  let observer = null;
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

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', handleFocus);
    }

    const root = getRoot();
    if (root && typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        visible = Boolean(entry?.isIntersecting);
        syncActiveState();
      }, {
        rootMargin: policy.rootMargin || DEFAULT_ROOT_MARGIN,
        threshold: policy.threshold ?? DEFAULT_THRESHOLD,
      });
      observer.observe(root);
    } else {
      visible = true;
      syncActiveState();
    }
  };

  const dispose = () => {
    clearRefreshTimer();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', handleFocus);
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
