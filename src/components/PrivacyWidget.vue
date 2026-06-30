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
        <span class="pw-stat-value">{{ formattedBandwidth }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.saved') }}</span>
      </div>
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedTime }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.time') }}</span>
      </div>
      <div class="pw-stat">
        <span class="pw-stat-value">{{ formattedToday }}</span>
        <span class="pw-stat-label">{{ i18n.$t('privacy.stats.today') }}</span>
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

/**
 * Privacy statistics widget.
 * Communicates with the Midori Privacy extension via runtime.sendMessage
 * to fetch blocking stats (total blocked, bandwidth saved, time saved).
 */

/** Firefox extension ID for Midori Privacy */
const FIREFOX_PRIVACY_ID = 'midori-protection@astian.org';

const DEFAULT_MS_PER_BLOCK = 3_000;
const DEFAULT_BYTES_PER_BLOCK = 45 * 1024;
const FOLLOW_UP_REFRESH_MS = 2_500;
const EVENT_REFRESH_DEBOUNCE_MS = 2_000;
const VISIBLE_REFRESH_MS = 45_000;
const RETRY_REFRESH_BASE_MS = 30_000;
const RETRY_REFRESH_MAX_MS = 60_000;

/**
 * Sends a cross-extension message to Midori Privacy.
 * Uses browser.runtime.sendMessage(extensionId, msg) for Firefox
 * and chrome.runtime.sendMessage(extensionId, msg) for Chrome.
 * @param {Object} msg - The message payload.
 * @returns {Promise<Object|null>} Response or null on failure.
 */
function sendToPrivacy(msg) {
  return new Promise((resolve) => {
    try {
      if (typeof browser !== 'undefined' && browser.runtime?.sendMessage) {
        browser.runtime.sendMessage(FIREFOX_PRIVACY_ID, msg)
          .then(resolve)
          .catch(() => resolve(null));
        return;
      }
      if (chrome?.runtime?.sendMessage) {
        chrome.runtime.sendMessage(FIREFOX_PRIVACY_ID, msg, (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
          } else {
            resolve(response);
          }
        });
        return;
      }
    } catch {
      // Extension not available
    }
    resolve(null);
  });
}

export default {
  name: 'PrivacyWidget',

  data() {
    return {
      i18n: useI18nStore(),
      available: false,
      totalBlocked: 0,
      todayBlocked: 0,
      timeSavedMs: 0,
      bandwidthSavedBytes: 0,
      categories: null,
      enabled: false,
      backgroundState: 'idle',
      grade: 'A+',
      refreshTimer: null,
      followUpTimer: null,
      observer: null,
      isInViewport: true,
      inFlight: false,
      lastFetchAt: 0,
      lastStatsSignature: '',
      failureCount: 0,
      visibilityListener: null,
      focusListener: null,
      privacyStatsListener: null,
    };
  },

  computed: {
    /** Formats blocked count with K/M suffixes. */
    formattedBlocked() {
      return this.formatCompact(this.totalBlocked);
    },

    formattedToday() {
      return this.formatCompact(this.todayBlocked);
    },

    formattedBandwidth() {
      const bytes = this.bandwidthSavedBytes || this.totalBlocked * DEFAULT_BYTES_PER_BLOCK;
      if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
      if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return bytes + ' B';
    },

    formattedTime() {
      const totalMs = this.timeSavedMs || this.totalBlocked * DEFAULT_MS_PER_BLOCK;
      const totalSec = totalMs / 1000;
      if (totalSec >= 3600) return (totalSec / 3600).toFixed(1) + 'h';
      if (totalSec >= 60) return (totalSec / 60).toFixed(1) + 'min';
      return totalSec.toFixed(0) + 's';
    },

    statusLabel() {
      if (!this.enabled) return this.i18n.$t('common.off');
      if (this.backgroundState.includes('loading')) return this.i18n.$t('privacy.loading');
      return this.grade;
    },

    visibleCategories() {
      const categories = this.categories || {};
      return [
        ['ads', this.i18n.$t('privacy.categories.ads')],
        ['trackers', this.i18n.$t('privacy.categories.trackers')],
        ['fingerprinters', this.i18n.$t('privacy.categories.fingerprinters')],
        ['other', this.i18n.$t('privacy.categories.other')],
      ]
        .map(([key, label]) => ({ key, label, count: Number(categories[key]) || 0 }))
        .filter((category) => category.count > 0)
        .slice(0, 4);
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

    clearFollowUpTimer() {
      if (this.followUpTimer) {
        clearTimeout(this.followUpTimer);
        this.followUpTimer = null;
      }
    },

    scheduleFollowUpRefresh() {
      this.clearFollowUpTimer();
      this.followUpTimer = setTimeout(() => {
        this.followUpTimer = null;
        if (!this.canRefresh()) return;
        this.fetchStats({ force: true });
      }, FOLLOW_UP_REFRESH_MS);
    },

    scheduleFallbackRefresh() {
      this.clearRefreshTimer();
      if (!this.canRefresh()) return;

      const retryDelay = Math.min(
        RETRY_REFRESH_MAX_MS,
        RETRY_REFRESH_BASE_MS * Math.max(1, this.failureCount),
      );
      const delay = this.available ? VISIBLE_REFRESH_MS : retryDelay;

      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.fetchStats();
      }, delay);
    },

    refreshFromEvent() {
      if (!this.canRefresh()) {
        this.clearRefreshTimer();
        return;
      }

      const now = Date.now();
      if (now - this.lastFetchAt < EVENT_REFRESH_DEBOUNCE_MS) {
        this.scheduleFallbackRefresh();
        return;
      }

      this.fetchStats({ force: true });
    },

    setupVisibilityObserver() {
      const root = this.$el;
      if (!root || typeof IntersectionObserver === 'undefined') {
        this.isInViewport = true;
        this.scheduleFallbackRefresh();
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
      const nextStats = {
        totalBlocked: Number(data.totalBlocked) || 0,
        todayBlocked: Number(data.todayBlocked) || 0,
        timeSavedMs: Number(data.timeSavedMs) || 0,
        bandwidthSavedBytes: Number(data.bandwidthSavedBytes) || 0,
        categories: data.categories || null,
        enabled: Boolean(data.enabled),
        backgroundState: String(data.state || '').toLowerCase(),
        grade: data.privacyGrade || 'A+',
      };
      const nextSignature = JSON.stringify(nextStats);

      this.available = true;
      if (nextSignature === this.lastStatsSignature) return;

      this.lastStatsSignature = nextSignature;
      this.totalBlocked = nextStats.totalBlocked;
      this.todayBlocked = nextStats.todayBlocked;
      this.timeSavedMs = nextStats.timeSavedMs;
      this.bandwidthSavedBytes = nextStats.bandwidthSavedBytes;
      this.categories = nextStats.categories;
      this.enabled = nextStats.enabled;
      this.backgroundState = nextStats.backgroundState;
      this.grade = nextStats.grade;
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
        const data = await sendToPrivacy({ action: 'get-stats-summary', days: 7 });
        if (!data || data.error) {
          this.failureCount += 1;
          this.available = false;
          this.scheduleFallbackRefresh();
          return;
        }

        this.failureCount = 0;
        this.applyStats(data);
        this.scheduleFallbackRefresh();
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
      this.clearFollowUpTimer();
    };
    this.focusListener = () => this.refreshFromEvent();
    this.privacyStatsListener = () => this.refreshFromEvent();

    document.addEventListener('visibilitychange', this.visibilityListener);
    window.addEventListener('focus', this.focusListener);
    window.addEventListener('midori:privacy-stats-updated', this.privacyStatsListener);

    this.fetchStats({ force: true });
    this.scheduleFollowUpRefresh();
    this.$nextTick(() => this.setupVisibilityObserver());
  },

  beforeUnmount() {
    this.clearRefreshTimer();
    this.clearFollowUpTimer();
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

.pw-cat-dot--trackers { background: #f59e0b; }
.pw-cat-dot--ads { background: #ef4444; }
.pw-cat-dot--fingerprinters { background: #8b5cf6; }
.pw-cat-dot--cosmetics { background: #06b6d4; }
.pw-cat-dot--pages { background: #22c55e; }
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
