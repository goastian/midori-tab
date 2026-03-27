<template>
  <div class="privacy-widget">
    <div class="pw-header">
      <span class="pw-icon">🛡️</span>
      <span class="pw-title">{{ i18n.$t('privacy.title') }}</span>
      <span v-if="!available" class="pw-badge pw-badge--off">{{ i18n.$t('common.off') }}</span>
      <span v-else class="pw-badge pw-badge--on">{{ grade }}</span>
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
    </div>

    <div v-if="available && categories" class="pw-categories">
      <div class="pw-cat" v-if="categories.trackers">
        <span class="pw-cat-dot pw-cat-dot--tracker"></span>
        <span class="pw-cat-label">{{ i18n.$t('privacy.categories.trackers') }}</span>
        <span class="pw-cat-count">{{ categories.trackers }}</span>
      </div>
      <div class="pw-cat" v-if="categories.ads">
        <span class="pw-cat-dot pw-cat-dot--ad"></span>
        <span class="pw-cat-label">{{ i18n.$t('privacy.categories.ads') }}</span>
        <span class="pw-cat-count">{{ categories.ads }}</span>
      </div>
      <div class="pw-cat" v-if="categories.fingerprinters">
        <span class="pw-cat-dot pw-cat-dot--fp"></span>
        <span class="pw-cat-label">{{ i18n.$t('privacy.categories.fingerprinters') }}</span>
        <span class="pw-cat-count">{{ categories.fingerprinters }}</span>
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

/**
 * Average page load time saved per blocked request (ms).
 * Conservative estimate: blocking a tracker/ad script saves ~50ms of load time.
 */
const MS_PER_BLOCK = 50;

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
      categories: null,
      grade: 'A+',
      pollTimer: null,
    };
  },

  computed: {
    /** Formats blocked count with K/M suffixes. */
    formattedBlocked() {
      const n = this.totalBlocked;
      if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
      if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
      return String(n);
    },

    /**
     * Estimates bandwidth saved.
     * Uses ~35KB per blocked request (industry average for ads/trackers).
     */
    formattedBandwidth() {
      const bytes = this.totalBlocked * 35 * 1024;
      if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + ' GB';
      if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + ' MB';
      if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
      return bytes + ' B';
    },

    /**
     * Estimates time saved based on blocked requests.
     * ~50ms saved per blocked request.
     */
    formattedTime() {
      const totalMs = this.totalBlocked * MS_PER_BLOCK;
      const totalSec = totalMs / 1000;
      if (totalSec >= 3600) return (totalSec / 3600).toFixed(1) + 'h';
      if (totalSec >= 60) return (totalSec / 60).toFixed(1) + 'min';
      return totalSec.toFixed(0) + 's';
    },
  },

  methods: {
    /** Fetches stats from Midori Privacy extension. */
    async fetchStats() {
      const data = await sendToPrivacy({ action: 'get-stats-summary', days: 7 });
      if (!data || data.error) {
        this.available = false;
        return;
      }
      this.available = true;
      this.totalBlocked = data.totalBlocked || 0;
      this.categories = data.categories || null;
      this.grade = data.privacyGrade || 'A+';
    },
  },

  mounted() {
    this.fetchStats();
    // Poll every 30 seconds for fresh data
    this.pollTimer = setInterval(() => this.fetchStats(), 30_000);
  },

  beforeUnmount() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
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
  grid-template-columns: repeat(3, 1fr);
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
  display: flex;
  gap: 0.75rem;
  padding-top: 0.25rem;
}

.pw-cat {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
}

.pw-cat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pw-cat-dot--tracker { background: #f59e0b; }
.pw-cat-dot--ad { background: #ef4444; }
.pw-cat-dot--fp { background: #8b5cf6; }

.pw-cat-label {
  color: var(--color-text-muted, #5A9A82);
}

.pw-cat-count {
  font-weight: 600;
  color: var(--color-text, #C4F0E0);
}
</style>
