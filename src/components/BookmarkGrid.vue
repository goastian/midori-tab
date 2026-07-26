<template>
  <div v-if="showAds" class="bookmark-grid">
    <div
      v-if="!adRequestComplete || adsStore.hasAd"
      class="sponsored-grid"
      :aria-busy="!adRequestComplete"
    >
      <article
        ref="sponsoredCard"
        class="sponsored-card"
        :class="{ 'sponsored-card--pending': !adsStore.hasAd }"
        role="complementary"
        :aria-label="sponsoredAriaLabel"
        :aria-hidden="!adsStore.hasAd"
      >
        <template v-if="adsStore.hasAd">
          <span class="sponsored-badge" :title="sponsoredBadge">{{ sponsoredBadge }}</span>
          <button
            type="button"
            class="sponsored-info"
            :title="i18n.$t('ads.whyTitle')"
            :aria-label="i18n.$t('ads.whyTitle')"
            :aria-expanded="showTransparency"
            @click.prevent.stop="showTransparency = !showTransparency"
          >i</button>

          <a
            :href="ad.destination_url"
            class="sponsored-link"
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            @click.prevent="openSponsored"
          >
            <span
              class="sponsored-icon"
              :class="{ 'sponsored-icon--fallback': iconFailed }"
              aria-hidden="true"
            >
              <img
                v-if="!iconFailed"
                :src="adIconUrl"
                alt=""
                width="38"
                height="38"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                @error="iconFailed = true"
              />
              <span v-else>{{ sponsoredInitial }}</span>
            </span>
            <span class="sponsored-title" :title="ad.title">{{ ad.title }}</span>
          </a>

          <div
            v-if="showTransparency"
            class="transparency-panel"
            role="dialog"
            :aria-label="i18n.$t('ads.whyTitle')"
            @click.stop
          >
            <strong>{{ i18n.$t('ads.whyTitle') }}</strong>
            <p>{{ i18n.$t('ads.whyCopy') }}</p>
            <p v-if="frequencyCap > 0" class="frequency-copy">{{ frequencyCopy }}</p>

            <div v-if="ad.transparency?.feedback_enabled" class="feedback-actions">
              <span>{{ i18n.$t('ads.feedbackPrompt') }}</span>
              <div>
                <button type="button" :disabled="feedbackPending" @click="submitFeedback(true)">
                  {{ i18n.$t('ads.relevant') }}
                </button>
                <button type="button" :disabled="feedbackPending" @click="submitFeedback(false)">
                  {{ i18n.$t('ads.notRelevant') }}
                </button>
              </div>
              <small v-if="feedbackMessage" role="status">{{ feedbackMessage }}</small>
            </div>

            <button type="button" class="dismiss-action" @click="dismissSponsored">
              {{ i18n.$t('ads.dismiss') }}
            </button>
          </div>
        </template>

        <div v-else class="sponsored-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
        </div>
      </article>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import useAdsStore from '../stores/useAdsStore.js';
import {
  AD_VIEWABILITY_THRESHOLD,
  createAdViewabilityTracker,
} from '../services/AdViewability.js';
import { createAdInteractionGuard } from '../services/AdInteractionGuard.js';

export default {
  name: 'BookmarkGrid',
  emits: [
    'sponsored-impression',
    'sponsored-click',
    'sponsored-feedback',
    'accidental-click-blocked',
  ],

  props: {
    /** Global user opt-out from the New Tab settings. */
    showAds: { type: Boolean, default: true },
  },

  data() {
    return {
      i18n: useI18nStore(),
      adsStore: useAdsStore(),
      adRequested: false,
      adRequestComplete: false,
      adObserver: null,
      adViewability: null,
      clickGuard: createAdInteractionGuard(),
      iconFailed: false,
      showTransparency: false,
      feedbackPending: false,
      feedbackState: '',
      performanceObserver: null,
      layoutShift: 0,
      performanceReportTimer: null,
      performanceReported: false,
    };
  },

  computed: {
    ad() {
      return this.adsStore.currentAd || {};
    },
    adIconUrl() {
      return this.ad.icon_url || this.ad.image_url || '';
    },
    sponsoredBadge() {
      return this.ad.sponsor_label || this.i18n.$t('ads.badge') || 'Ad';
    },
    sponsoredInitial() {
      return String(this.ad.title || 'A').trim().charAt(0).toUpperCase() || 'A';
    },
    sponsoredAriaLabel() {
      const label = this.i18n.$t('ads.label') || 'Sponsored content';
      return this.adsStore.hasAd && this.ad.title ? `${label}: ${this.ad.title}` : label;
    },
    frequencyCap() {
      return Number(this.ad.transparency?.frequency_cap_per_day || 0);
    },
    frequencyCopy() {
      return String(this.i18n.$t('ads.frequencyCap'))
        .replace('{count}', String(this.frequencyCap));
    },
    feedbackMessage() {
      if (this.feedbackState === 'sent') return this.i18n.$t('ads.feedbackThanks');
      if (this.feedbackState === 'error') return this.i18n.$t('ads.feedbackError');
      return '';
    },
  },

  watch: {
    showAds(enabled) {
      if (!enabled) {
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
        return;
      }

      if (!this.adsStore.hasAd) {
        this.adRequested = false;
        this.adRequestComplete = false;
      }
      this.$nextTick(() => {
        this.setupPerformanceObserver();
        this.setupAdObserver();
      });
    },

    'adsStore.currentAd'(ad) {
      this.iconFailed = false;
      this.showTransparency = false;
      this.feedbackState = '';
      this.clickGuard.reset();
      if (this.showAds && ad) {
        this.$nextTick(() => {
          this.setupAdObserver();
          this.schedulePerformanceReport();
        });
      } else {
        this.teardownAdObserver();
      }
    },
  },

  methods: {
    setupAdObserver() {
      this.teardownAdObserver();
      if (!this.showAds) return;

      const element = this.$refs.sponsoredCard;
      if (!element) return;

      if (this.adsStore.hasAd) {
        this.adViewability = createAdViewabilityTracker({
          onViewable: async () => {
            if (!this.showAds || !this.adsStore.hasAd || this.adsStore.impressionTracked) return;
            const trackedAd = this.adsStore.currentAd;
            const accepted = await this.adsStore.trackImpression();
            if (accepted && this.adsStore.currentAd?.decision_id === trackedAd?.decision_id) {
              this.$emit('sponsored-impression', trackedAd);
            }
          },
        });
        this.adViewability.setPageVisible(
          typeof document === 'undefined' || document.visibilityState === 'visible',
        );
      }

      if (typeof IntersectionObserver === 'undefined') {
        // Loading may proceed, but viewability measurement fails closed when
        // the runtime cannot prove the 50%/1-second contract.
        if (!this.adsStore.hasAd) this.loadAdWhenVisible();
        return;
      }

      this.adObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        const isVisible = entry.isIntersecting
          && entry.intersectionRatio >= AD_VIEWABILITY_THRESHOLD;
        if (!this.adsStore.hasAd) {
          if (isVisible) this.loadAdWhenVisible();
          return;
        }

        this.adViewability?.update(entry);
      }, { threshold: [0, AD_VIEWABILITY_THRESHOLD, 1] });

      this.adObserver.observe(element);
    },

    teardownAdObserver() {
      if (this.adObserver) {
        try { this.adObserver.disconnect(); } catch (_) { /* ignore */ }
        this.adObserver = null;
      }
      if (this.adViewability) {
        this.adViewability.dispose();
        this.adViewability = null;
      }
    },

    handleAdPageVisibility() {
      this.adViewability?.setPageVisible(
        typeof document === 'undefined' || document.visibilityState === 'visible',
      );
    },

    async loadAdWhenVisible() {
      if (!this.showAds || this.adRequested || this.adsStore.hasAd) return;
      this.adRequested = true;
      await this.adsStore.loadAd();
      this.adRequestComplete = true;

      if (!this.adsStore.hasAd) {
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
      }
    },

    dismissSponsored() {
      void this.adsStore.dismiss();
      this.showTransparency = false;
    },

    async submitFeedback(relevant) {
      if (this.feedbackPending || this.feedbackState === 'sent') return;
      this.feedbackPending = true;
      const accepted = await this.adsStore.submitFeedback(relevant);
      this.feedbackPending = false;
      this.feedbackState = accepted ? 'sent' : 'error';
      if (accepted) {
        this.$emit('sponsored-feedback', { ad: this.ad, relevant });
      }
    },

    openSponsored(event) {
      const clickedAd = this.adsStore.currentAd;
      if (!clickedAd) return;

      const intent = this.clickGuard.evaluate({ keyboard: event?.detail === 0 });
      if (!intent.allowed) {
        void this.adsStore.trackClientEvent('accidental_click_guard', {
          interaction_latency_ms: intent.interactionLatencyMs,
        });
        this.$emit('accidental-click-blocked', clickedAd);
        return;
      }

      if (this.adsStore.trackClick(intent.interactionLatencyMs)) {
        this.$emit('sponsored-click', clickedAd);
      }
    },

    setupPerformanceObserver() {
      if (this.performanceObserver || typeof PerformanceObserver === 'undefined') return;
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const root = this.$refs.sponsoredCard;
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput || !root) continue;
            const affectsSlot = !Array.isArray(entry.sources)
              || entry.sources.length === 0
              || entry.sources.some(source => (
                source.node === root || (source.node && root.contains(source.node))
              ));
            if (affectsSlot) this.layoutShift += Number(entry.value || 0);
          }
        });
        this.performanceObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (_) {
        this.performanceObserver = null;
      }
    },

    schedulePerformanceReport() {
      if (this.performanceReported || this.performanceReportTimer) return;
      this.performanceReportTimer = setTimeout(() => {
        this.performanceReportTimer = null;
        this.reportPerformance();
      }, 2000);
    },

    reportPerformance() {
      if (this.performanceReported || !this.adsStore.hasAd) return;
      this.performanceReported = true;
      void this.adsStore.trackClientEvent('client_performance', {
        request_latency_ms: Math.max(0, Math.round(this.adsStore.requestLatencyMs || 0)),
        layout_shift_micros: Math.max(0, Math.round(this.layoutShift * 1_000_000)),
      });
    },

    teardownPerformanceObserver() {
      if (this.performanceReportTimer) {
        clearTimeout(this.performanceReportTimer);
        this.performanceReportTimer = null;
      }
      if (this.performanceObserver) {
        try { this.performanceObserver.disconnect(); } catch (_) { /* ignore */ }
        this.performanceObserver = null;
      }
    },
  },

  mounted() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.$nextTick(() => {
      this.setupPerformanceObserver();
      this.setupAdObserver();
    });
  },

  beforeUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.reportPerformance();
    this.teardownAdObserver();
    this.teardownPerformanceObserver();
  },
};
</script>

<style scoped>
.bookmark-grid {
  width: 100%;
}

.sponsored-grid {
  display: grid;
  grid-template-columns: minmax(104px, 120px);
  min-height: 112px;
}

.sponsored-card {
  position: relative;
  min-width: 0;
  border-radius: var(--nova-panel-radius, 14px);
}

.sponsored-link {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  padding: 1.35rem 0.55rem 0.7rem;
  border: 1px solid var(--color-border-hover, rgba(126,196,168,0.2));
  border-radius: var(--nova-panel-radius, 14px);
  color: var(--color-text, #C4F0E0);
  background: var(--surface-island, #0F1520);
  text-decoration: none;
  transition: background var(--transition-fast, 0.1s ease), border-color var(--transition-fast, 0.1s ease);
}

.sponsored-link:hover,
.sponsored-link:focus-visible {
  border-color: var(--color-primary, #04A469);
  background: var(--surface-control-hover, #1E2D3D);
}

.sponsored-badge {
  position: absolute;
  top: 6px;
  left: 7px;
  z-index: 2;
  max-width: calc(100% - 38px);
  padding: 2px 5px;
  overflow: hidden;
  border-radius: 4px;
  color: var(--color-text-muted, #5A9A82);
  background: var(--surface-control, #1E2D3D);
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}

.sponsored-info {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 4;
  display: flex;
  width: 21px;
  height: 21px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--color-border, rgba(126,196,168,0.16));
  border-radius: 50%;
  color: var(--color-text-muted, #5A9A82);
  background: var(--surface-control, #1E2D3D);
  font: 700 0.7rem/1 sans-serif;
  cursor: pointer;
}

.sponsored-info:hover,
.sponsored-info:focus-visible {
  color: white;
  border-color: var(--color-primary, #04A469);
}

.sponsored-icon {
  display: flex;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: var(--nova-control-radius, 8px);
  background: var(--surface-control, #1E2D3D);
}

.sponsored-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.sponsored-icon--fallback {
  color: white;
  background: var(--color-primary, #04A469);
  font-size: 1.2rem;
  font-weight: 700;
}

.sponsored-title {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sponsored-card--pending {
  min-height: 112px;
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-island, rgba(15,21,32,0.58));
  overflow: hidden;
}

.sponsored-skeleton {
  display: flex;
  min-height: 112px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.65rem;
}

.sponsored-skeleton span {
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: var(--surface-control, rgba(126,196,168,0.12));
}

.sponsored-skeleton span + span {
  width: 58px;
  height: 8px;
}

.transparency-panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 20;
  width: min(320px, calc(100vw - 2rem));
  padding: 0.85rem;
  border: 1px solid var(--color-border-hover, rgba(126,196,168,0.2));
  border-radius: var(--nova-panel-radius, 14px);
  color: var(--color-text, #C4F0E0);
  background: var(--surface-base, #080D14);
  box-shadow: var(--shadow-floating, 0 8px 24px rgba(0,0,0,0.28));
  font-size: 0.75rem;
}

.transparency-panel p {
  margin: 0.45rem 0 0;
  color: var(--color-text-muted, #8DB9A8);
  line-height: 1.45;
}

.frequency-copy {
  font-weight: 600;
}

.feedback-actions {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.75rem;
  padding-top: 0.65rem;
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
}

.feedback-actions div {
  display: flex;
  gap: 0.4rem;
}

.feedback-actions button,
.dismiss-action {
  padding: 0.38rem 0.55rem;
  border: 1px solid var(--color-border, rgba(126,196,168,0.16));
  border-radius: 7px;
  color: var(--color-text, #C4F0E0);
  background: var(--surface-control, #1E2D3D);
  font-size: 0.7rem;
  cursor: pointer;
}

.feedback-actions button:disabled {
  cursor: wait;
  opacity: 0.6;
}

.feedback-actions small {
  color: var(--color-primary-hover, #4de0b2);
}

.dismiss-action {
  width: 100%;
  margin-top: 0.65rem;
  color: var(--color-text-muted, #8DB9A8);
  background: transparent;
}

@media (max-width: 520px) {
  .sponsored-grid {
    grid-template-columns: minmax(104px, 112px);
  }

  .transparency-panel {
    position: fixed;
    top: auto;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: auto;
  }
}
</style>
