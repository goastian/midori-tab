<template>
  <div class="privacy-widget">
    <div class="pw-header">
      <span class="pw-icon">🛡️</span>
      <span class="pw-title">{{ i18n.$t('privacy.title') }}</span>
      <span v-if="!available" class="pw-badge pw-badge--off">{{ i18n.$t('common.off') }}</span>
      <span v-else class="pw-badge pw-badge--on">{{ statusLabel }}</span>
    </div>

    <div v-if="!available" class="pw-empty">
      <p class="pw-empty-text">{{ i18n.$t('privacy.notAvailable') }}</p>
    </div>

    <div v-else class="pw-stats">
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedBlocked }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.blocked') }}</span>
      </div>
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedRequests }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.requests') }}</span>
      </div>
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedBlockRate }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.blockRate') }}</span>
      </div>
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedPageBlocked }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.page') }}</span>
      </div>
    </div>

    <div v-if="available && visibleCategories.length" class="pw-categories">
      <div
        v-for="category in visibleCategories"
        :key="category.key"
        class="pw-cat"
      >
        <span :class="['pw-cat-dot', `pw-cat-dot--${category.key}`]"></span>
        <span class="pw-cat-label">{{ category.label }}</span>
        <span class="pw-cat-count">{{ formatCompact(category.count) }}</span>
      </div>
    </div>

  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import { WIDGET_COST } from '../composables/useWidgetRuntime.js';
import {
  normalizePrivacyStats,
  requestPrivacyStats,
} from '../services/privacyStats.js';

/**
 * Privacy statistics widget.
 * Communicates with the Midori Privacy extension via runtime.sendMessage
 * to fetch real uBlock counters without storage reads or tab scans.
 */

const EVENT_REFRESH_DEBOUNCE_MS = 2_000;
const REFRESH_TTL_MS = 60_000;
const RETRY_REFRESH_BASE_MS = 5_000;
const RETRY_REFRESH_MAX_MS = 30_000;
const MAX_AUTOMATIC_RETRIES = 3;
const WIDGET_POLICY = Object.freeze({
  key: 'privacy',
  cost: WIDGET_COST.LOW,
  usesNetwork: false,
  ttlMs: REFRESH_TTL_MS,
  stale: true,
  refresh: 'initial, visible-if-stale, foreground-if-stale, privacy-stats-event, bounded-startup-retry',
});

export default {
  name: 'PrivacyWidget',

  data() {
    return {
      i18n: useI18nStore(),
      available: false,
      totalBlocked: 0,
      totalRequests: 0,
      pageBlocked: 0,
      pageRequests: 0,
      blockRate: 0,
      categories: null,
      enabled: false,
      backgroundState: 'idle',
      refreshTimer: null,
      observer: null,
      isInViewport: true,
      inFlight: false,
      lastFetchAt: 0,
      lastStatsSignature: '',
      failureCount: 0,
      visibilityListener: null,
      focusListener: null,
      privacyStatsListener: null,
      widgetPolicy: WIDGET_POLICY,
    };
  },

  computed: {
    /** Formats blocked count with K/M suffixes. */
    formattedBlocked() {
      return this.formatCompact(this.totalBlocked);
    },

    formattedRequests() {
      return this.formatCompact(this.totalRequests);
    },

    formattedBlockRate() {
      if (this.blockRate >= 10) return Math.round(this.blockRate) + '%';
      return this.blockRate.toFixed(1) + '%';
    },

    formattedPageBlocked() {
      return this.formatCompact(this.pageBlocked);
    },

    statusLabel() {
      if (!this.enabled) return this.i18n.$t('common.off');
      if (this.backgroundState.includes('loading')) return this.i18n.$t('privacy.loading');
      return this.i18n.$t('common.on');
    },

    visibleCategories() {
      const categories = this.categories || {};
      return [
        ['scripts', this.i18n.$t('privacy.categories.scripts')],
        ['frames', this.i18n.$t('privacy.categories.frames')],
        ['xhr', this.i18n.$t('privacy.categories.xhr')],
        ['images', this.i18n.$t('privacy.categories.images')],
        ['media', this.i18n.$t('privacy.categories.media')],
        ['fonts', this.i18n.$t('privacy.categories.fonts')],
        ['other', this.i18n.$t('privacy.categories.other')],
      ]
        .map(([key, label]) => ({ key, label, count: Number(categories[key]) || 0 }))
        .filter((category) => category.count > 0)
        .slice(0, 6);
    },
  },

  methods: {
    formatCompact(value) {
      const n = Number(value) || 0;
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    },

    isForeground() {
      return typeof document === 'undefined' || document.visibilityState !== 'hidden';
    },

    canRefresh() {
      return this.isInViewport && this.isForeground();
    },

    clearRefreshTimer() {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
    },

    scheduleStartupRetry() {
      this.clearRefreshTimer();
      if (!this.canRefresh()) return;
      if (this.failureCount > MAX_AUTOMATIC_RETRIES) return;

      const retryDelay = Math.min(
        RETRY_REFRESH_MAX_MS,
        RETRY_REFRESH_BASE_MS * (2 ** Math.max(0, this.failureCount - 1)),
      );

      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.fetchStats({ force: true });
      }, retryDelay);
    },

    refreshFromEvent(options = {}) {
      if (!this.canRefresh()) {
        this.clearRefreshTimer();
        return;
      }

      const now = Date.now();
      const minimumAge = options.force ? EVENT_REFRESH_DEBOUNCE_MS : REFRESH_TTL_MS;
      if (now - this.lastFetchAt < minimumAge) return;

      this.fetchStats({ force: Boolean(options.force) });
    },

    setupVisibilityObserver() {
      const root = this.$el;
      if (!root || typeof IntersectionObserver === 'undefined') {
        this.isInViewport = true;
        this.refreshFromEvent();
        return;
      }

      this.observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.isInViewport = Boolean(entry?.isIntersecting);

        if (this.canRefresh()) {
          this.refreshFromEvent();
          return;
        }

        this.clearRefreshTimer();
      }, { threshold: 0.1 });
      this.observer.observe(root);
    },

    applyStats(data) {
      const nextStats = normalizePrivacyStats(data);
      if (!nextStats) return false;
      const nextSignature = JSON.stringify(nextStats);

      this.available = true;
      if (nextSignature === this.lastStatsSignature) return true;

      this.lastStatsSignature = nextSignature;
      this.totalBlocked = nextStats.totalBlocked;
      this.totalRequests = nextStats.totalRequests;
      this.pageBlocked = nextStats.pageBlocked;
      this.pageRequests = nextStats.pageRequests;
      this.blockRate = nextStats.blockRate;
      this.categories = nextStats.categories;
      this.enabled = nextStats.enabled;
      this.backgroundState = nextStats.state;
      return true;
    },

    /** Fetches stats from Midori Privacy extension. */
    async fetchStats(options = {}) {
      if (this.inFlight) return;
      if (!options.force && !this.canRefresh()) {
        this.clearRefreshTimer();
        return;
      }

      this.inFlight = true;
      this.lastFetchAt = Date.now();

      try {
        const data = await requestPrivacyStats();
        if (!this.applyStats(data)) {
          this.failureCount += 1;
          this.available = false;
          this.scheduleStartupRetry();
          return;
        }

        if (this.backgroundState === 'loading') {
          this.failureCount += 1;
          this.scheduleStartupRetry();
        } else {
          this.failureCount = 0;
          this.clearRefreshTimer();
        }
      } finally {
        this.inFlight = false;
      }
    },
  },

  mounted() {
    this.visibilityListener = () => {
      if (this.isForeground()) {
        this.refreshFromEvent();
        return;
      }
      this.clearRefreshTimer();
    };
    this.focusListener = () => this.refreshFromEvent();
    this.privacyStatsListener = () => this.refreshFromEvent({ force: true });

    document.addEventListener('visibilitychange', this.visibilityListener);
    window.addEventListener('focus', this.focusListener);
    window.addEventListener('midori:privacy-stats-updated', this.privacyStatsListener);

    this.fetchStats({ force: true });
    this.$nextTick(() => this.setupVisibilityObserver());
  },

  beforeUnmount() {
    this.clearRefreshTimer();
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
    if (this.focusListener) {
      window.removeEventListener('focus', this.focusListener);
      this.focusListener = null;
    }
    if (this.privacyStatsListener) {
      window.removeEventListener('midori:privacy-stats-updated', this.privacyStatsListener);
      this.privacyStatsListener = null;
    }
  },
};
</script>

<style scoped>
.privacy-widget {
  width: 100%;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Header ── */
.pw-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pw-icon {
  font-size: 1.1rem;
}

.pw-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text, #C4F0E0);
  flex: 1;
}

.pw-badge {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.pw-badge--on {
  background: rgba(4, 164, 105, 0.15);
  color: var(--color-primary, #04A469);
  border: 1px solid rgba(4, 164, 105, 0.25);
}

.pw-badge--off {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border: 1px solid rgba(239, 68, 68, 0.2);
}

/* ── Empty state ── */
.pw-empty {
  padding: 0.5rem 0;
}

.pw-empty-text {
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
  line-height: 1.4;
}

/* ── Stats row ── */
.pw-stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

.pw-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.5rem 0.25rem;
  background: var(--surface-overlay, rgba(30,45,61,0.5));
  border-radius: var(--radius-sm, 6px);
}

.pw-stat-value {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary, #04A469);
  line-height: 1;
  max-width: 100%;
  overflow-wrap: anywhere;
  text-align: center;
}

.pw-stat-label {
  font-size: 0.62rem;
  font-weight: 500;
  color: var(--color-text-muted, #5A9A82);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* ── Categories breakdown ── */
.pw-categories {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.45rem 0.75rem;
  padding-top: 0.25rem;
}

.pw-cat {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  min-width: 0;
}

.pw-cat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pw-cat-dot--scripts { background: #ef4444; }
.pw-cat-dot--frames { background: #f59e0b; }
.pw-cat-dot--xhr { background: #8b5cf6; }
.pw-cat-dot--images { background: #06b6d4; }
.pw-cat-dot--media { background: #22c55e; }
.pw-cat-dot--fonts { background: #3b82f6; }
.pw-cat-dot--other { background: #94a3b8; }

.pw-cat-label {
  color: var(--color-text-muted, #5A9A82);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pw-cat-count {
  font-weight: 600;
  color: var(--color-text, #C4F0E0);
  margin-left: auto;
}

@media (max-width: 520px) {
  .pw-stats {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
