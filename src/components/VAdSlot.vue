<template>
  <div
    v-if="!requested || adsStore.hasAd"
    ref="root"
    class="ad-slot"
    :class="{ 'ad-slot--ready': visible && adsStore.hasAd }"
    role="complementary"
    :aria-label="i18n.$t('ads.label') || 'Sponsored content'"
  >
    <span v-if="adsStore.hasAd" class="ad-slot__badge">{{ i18n.$t('ads.badge') || 'Anuncio' }}</span>

    <button
      v-if="adsStore.hasAd"
      type="button"
      class="ad-slot__dismiss"
      :aria-label="i18n.$t('ads.dismiss') || 'Dismiss ad'"
      @click="onDismiss"
    >✕</button>

    <a
      v-if="adsStore.hasAd"
      class="ad-slot__link"
      :href="ad.destination_url"
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
      @click.prevent="onClick"
    >
      <div class="ad-slot__media">
        <img
          v-if="ad.image_url"
          :src="ad.image_url"
          :alt="ad.title || ''"
          width="80"
          height="80"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          @error="onImgError"
        />
        <div v-else class="ad-slot__media--placeholder" aria-hidden="true">★</div>
      </div>

      <div class="ad-slot__body">
        <div class="ad-slot__title" :title="ad.title">{{ ad.title }}</div>
        <div v-if="ad.description" class="ad-slot__desc">{{ ad.description }}</div>
        <span class="ad-slot__cta">{{ ad.cta || (i18n.$t('ads.cta') || 'Learn more') }}</span>
      </div>
    </a>
  </div>
</template>

<script>
import useAdsStore from '../stores/useAdsStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import { WIDGET_COST } from '../composables/useWidgetRuntime.js';

const VISIBILITY_THRESHOLD = 0.5;
const VISIBILITY_DWELL_MS = 1000;
const WIDGET_POLICY = Object.freeze({
  key: 'ads',
  cost: WIDGET_COST.MEDIUM,
  usesNetwork: true,
  ttlMs: 0,
  stale: false,
  refresh: 'visible-with-dwell, manual-dismiss, campaign-change',
});

export default {
  name: 'VAdSlot',

  data() {
    return {
      adsStore: useAdsStore(),
      i18n: useI18nStore(),
      visible: false,
      observer: null,
      dwellTimer: null,
      imgFailed: false,
      requested: false,
      widgetPolicy: WIDGET_POLICY,
    };
  },

  computed: {
    ad() {
      return this.adsStore.currentAd || {};
    },
  },

  mounted() {
    this.$nextTick(() => this.setupObserver());
  },

  beforeUnmount() {
    this.teardownObserver();
  },

  watch: {
    'adsStore.currentAd'(val) {
      this.imgFailed = false;
      if (val && this.$refs.root) {
        this.$nextTick(() => this.setupObserver());
      }
    },
  },

  methods: {
    setupObserver() {
      this.teardownObserver();
      const el = this.$refs.root;
      if (!el || typeof IntersectionObserver === 'undefined') {
        // Fallback: assume visible after mount.
        this.visible = true;
        this.loadWhenVisible();
        if (this.adsStore.hasAd) this.scheduleImpression();
        return;
      }

      this.observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= VISIBILITY_THRESHOLD) {
          this.visible = true;
          this.loadWhenVisible();
          if (this.adsStore.hasAd) this.scheduleImpression();
        } else {
          this.cancelImpression();
        }
      }, { threshold: [0, VISIBILITY_THRESHOLD, 1] });

      this.observer.observe(el);
    },

    teardownObserver() {
      if (this.observer) {
        try { this.observer.disconnect(); } catch (_) { /* ignore */ }
        this.observer = null;
      }
      this.cancelImpression();
    },

    scheduleImpression() {
      if (!this.adsStore.hasAd || this.dwellTimer || this.adsStore.impressionTracked) return;
      this.dwellTimer = setTimeout(() => {
        this.dwellTimer = null;
        this.adsStore.trackImpression();
        this.$emit('impression', this.adsStore.currentAd);
      }, VISIBILITY_DWELL_MS);
    },

    async loadWhenVisible() {
      if (this.requested || !this.visible) return;
      this.requested = true;
      await this.adsStore.loadAd();
      if (this.visible && this.adsStore.hasAd) this.scheduleImpression();
    },

    cancelImpression() {
      if (this.dwellTimer) {
        clearTimeout(this.dwellTimer);
        this.dwellTimer = null;
      }
    },

    onDismiss() {
      this.adsStore.dismiss();
    },

    onClick() {
      this.$emit('click', this.adsStore.currentAd);
      this.adsStore.trackClick();
    },

    onImgError() {
      this.imgFailed = true;
    },
  },
};
</script>

<style scoped>
.ad-slot {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 0;
  max-width: 520px;
  margin: 0.75rem auto;
  padding: 0;
  background: var(--surface-elevated, rgba(15, 25, 38, 0.72));
  border: 1px solid var(--color-border, rgba(126, 196, 168, 0.14));
  border-radius: 14px;
  overflow: hidden;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  opacity: 0;
  transform: translateY(4px);
  transition: opacity 220ms ease, transform 220ms ease;
  contain: content;
}

.ad-slot--ready {
  opacity: 1;
  transform: translateY(0);
}

.ad-slot__badge {
  position: absolute;
  top: 8px;
  left: 10px;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-secondary, #9aa9b8);
  pointer-events: none;
  user-select: none;
}

.ad-slot__dismiss {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: var(--color-text-secondary, #9aa9b8);
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease, color 150ms ease;
}

.ad-slot__dismiss:hover {
  background: rgba(255, 255, 255, 0.16);
  color: var(--color-text-primary, #e7eef5);
}

.ad-slot__link {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 38px 14px 14px;
  text-decoration: none;
  color: inherit;
  transition: background 150ms ease;
}

.ad-slot__link:hover {
  background: rgba(255, 255, 255, 0.04);
}

.ad-slot__media {
  flex: 0 0 80px;
  width: 80px;
  height: 80px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
}

.ad-slot__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ad-slot__media--placeholder {
  font-size: 28px;
  color: var(--color-text-secondary, #9aa9b8);
  opacity: 0.6;
}

.ad-slot__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ad-slot__title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-primary, #e7eef5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 6px;
}

.ad-slot__desc {
  font-size: 0.8rem;
  color: var(--color-text-secondary, #9aa9b8);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ad-slot__cta {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--color-accent, #04A469);
  margin-top: 2px;
}

@media (max-width: 540px) {
  .ad-slot {
    margin: 0.5rem 0.75rem;
  }
  .ad-slot__media {
    flex-basis: 64px;
    width: 64px;
    height: 64px;
  }
}
</style>
