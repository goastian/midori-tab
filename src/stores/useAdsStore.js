import { defineStore } from 'pinia';
import AdsService, { isDecisionActive, createRandomUuid } from '../services/AdsService.js';

import { detectDeviceType, detectLanguage, readDismissed, SESSION_DISMISS_KEY, readCreativeSnapshot, creativeContent, adsApiBase } from '../services/adCreativeSnapshot.js';

/** Per-session dismissal tracking; resets on the next browsing session. */
function writeDismissed(set) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(SESSION_DISMISS_KEY, JSON.stringify(Array.from(set)));
  } catch (_) { /* ignore */ }
}

let _serviceSingleton = null;
function getService() {
  if (!_serviceSingleton) {
    _serviceSingleton = new AdsService();
  }
  return _serviceSingleton;
}

const activeRequests = new WeakMap();

const createAdsStore = bookmarkKey => defineStore(`adsStore${bookmarkKey ? `:${bookmarkKey}` : ''}`, {
  state: () => ({
    currentAd: null,
    cachedCreative: readCreativeSnapshot({ bookmark_key: bookmarkKey }),
    creativeCacheReady: false,
    pendingDismissId: null,
    currentExposureId: null,
    lastFetchedAt: 0,
    loading: false,
    error: null,
    /** 'fresh' | 'cached' | 'none' | 'error' | 'dismissed' | null */
    source: null,
    impressionTracked: false,
    impressionTracking: false,
    requestLatencyMs: 0,
  }),

  getters: {
    displayAd(state) { return state.currentAd || state.cachedCreative; },
    hasAd(state) {
      return Boolean(state.currentAd && state.currentAd.ad_id);
    },
  },

  actions: {
    async restoreCreative() {
      if (this.creativeCacheReady) return;
      const creative = await getService().cachedNewTabCreative({ device_type: detectDeviceType(), language: detectLanguage(), bookmark_key: bookmarkKey });
      this.cachedCreative = creative && !readDismissed().has(String(creative.ad_id)) ? creative : null;
      this.creativeCacheReady = true;
    },

    async loadAd(force = false, options = {}) {
      if (activeRequests.has(this)) return activeRequests.get(this);
      if (!force && this.hasAd && isDecisionActive(this.currentAd)) return true;
      const request = this.refreshAd(options);
      activeRequests.set(this, request);
      try { return await request; }
      finally { if (activeRequests.get(this) === request) activeRequests.delete(this); }
    },

    async refreshAd(options = {}) {
      this.loading = true;
      this.error = null;

      try {
        const service = getService();
        await this.restoreCreative();
        const result = await service.fetchNewTabAds({
          bookmark_key: bookmarkKey,
          device_type: detectDeviceType(),
          language: detectLanguage(),
          signal: options.signal,
        });
        if (options.signal?.aborted) return false;
        this.requestLatencyMs = Number.isSafeInteger(result?.latency_ms)
          ? result.latency_ms
          : 0;

        if (result && result.ad) {
          const dismissed = readDismissed();
          if (dismissed.has(String(result.ad.ad_id))) {
            if (this.pendingDismissId === String(result.ad.ad_id)) {
              this.pendingDismissId = null;
              void service.trackClientEvent('ad_dismissed', result.ad.impression_token, { expiresAt: result.ad.expires_at });
            }
            this.cachedCreative = null;
            this.currentAd = null;
            this.source = 'dismissed';
            this.impressionTracked = false;
            this.impressionTracking = false;
          } else {
            this.cachedCreative = creativeContent(result.ad, adsApiBase());
            this.currentAd = result.ad;
            this.source = result.source;
            this.impressionTracked = false;
            this.impressionTracking = false;
          }
        } else {
          const failed = result?.source === 'error';
          if (!failed) this.cachedCreative = null;
          this.currentAd = null;
          this.source = failed ? 'error' : 'none';
          this.error = failed
            ? (result.error || 'Ads request failed')
            : null;
          this.impressionTracked = false;
          this.impressionTracking = false;
        }

        this.lastFetchedAt = Date.now();
      } catch (err) {
        this.error = err && err.message ? err.message : 'Unknown ads error';
        this.currentAd = null;
        this.source = 'error';
        this.impressionTracked = false;
        this.impressionTracking = false;
      } finally {
        this.loading = false;
      }
      return true;
    },

    dismiss() {
      const dismissedAd = this.displayAd;
      if (!dismissedAd) return;
      const id = String(dismissedAd.ad_id);
      if (this.currentAd) void this.trackClientEvent('ad_dismissed', {}, this.currentAd);
      else this.pendingDismissId = id;
      this.cachedCreative = null;
      const dismissed = readDismissed();
      dismissed.add(id);
      writeDismissed(dismissed);
      this.currentAd = null;
      this.source = 'dismissed';
      if (this.pendingDismissId) void this.loadAd(true);
      this.impressionTracked = false;
      this.impressionTracking = false;
    },

    convertBookmark(ad) {
      if (!ad?.ad_id || !ad.impression_token) return;
      void getService().trackBookmarkAction(ad, 'bookmark_changed');
      const dismissed = readDismissed();
      dismissed.add(String(ad.ad_id));
      writeDismissed(dismissed);
      if (String(this.displayAd?.ad_id) === String(ad.ad_id)) {
        this.currentAd = null;
        this.cachedCreative = null;
        this.source = 'dismissed';
        this.impressionTracked = false;
        this.impressionTracking = false;
      }
    },

    async recordOptOut() {
      if (!this.currentAd) return false;
      return this.trackClientEvent('ad_opt_out');
    },

    async submitFeedback(relevant) {
      if (!this.currentAd?.transparency?.feedback_enabled) return false;
      return this.trackClientEvent(
        relevant ? 'feedback_relevant' : 'feedback_irrelevant',
      );
    },

    async trackExposure(ad, event) {
      return getService().trackExposure(ad, event);
    },

    async trackClientEvent(eventType, metrics = {}, ad = this.currentAd) {
      if (!ad || !isDecisionActive(ad) || !ad.impression_token) return false;
      try {
        return await getService().trackClientEvent(eventType, ad.impression_token, {
          expiresAt: ad.expires_at,
          metrics,
        });
      } catch (_) {
        return false;
      }
    },

    /**
     * Fire-and-forget impression tracking. The /newtab response already
     * includes an `impression_token`; we POST it to /api/v1/ads/impression.
     */
    async trackImpression() {
      if (!this.currentAd || this.impressionTracked || this.impressionTracking) return false;
      if (!isDecisionActive(this.currentAd)) return false;
      const token = this.currentAd.impression_token;
      if (!token) return false;
      this.impressionTracking = true;

      try {
        const service = getService();
        const accepted = await service.trackImpression(token, {
          expiresAt: this.currentAd.expires_at,
        });
        if (this.currentAd?.impression_token === token) {
          this.impressionTracked = accepted;
        }
        return accepted;
      } catch (_) {
        // Silently swallow — impression tracking must never affect UX.
        if (this.currentAd?.impression_token === token) {
          this.impressionTracked = false;
        }
        return false;
      } finally {
        if (this.currentAd?.impression_token === token) {
          this.impressionTracking = false;
        }
      }
    },

    /**
     * Click handler: opens the destination URL (which is already the
     * ads.astian.org /click/{encrypted_id} tracking endpoint that 302s to
     * the advertiser).
     */
    trackClick(interactionLatencyMs = null) {
      if (!this.currentAd || !this.currentAd.destination_url) return false;
      if (!isDecisionActive(this.currentAd)) return false;

      const decisionId = String(this.currentAd.decision_id || '').trim();
      if (!decisionId) return false;

      let url = this.currentAd.destination_url;
      const clickUrl = new URL(url);
      clickUrl.searchParams.set('click_device_type', detectDeviceType());
      clickUrl.searchParams.set('click_event_id', createRandomUuid());
      if (this.currentExposureId) clickUrl.searchParams.set('exposure_id', this.currentExposureId);
      url = clickUrl.toString();
      const latency = Number(interactionLatencyMs);
      if (Number.isSafeInteger(latency) && latency >= 0) {
        try {
          const trackedUrl = new URL(url);
          trackedUrl.searchParams.set('interaction_ms', String(Math.min(600000, latency)));
          url = trackedUrl.toString();
        } catch (_) { /* contract validation already rejects malformed URLs */ }
      }
      try {
        const browserAPI = (typeof browser !== 'undefined') ? browser : (typeof chrome !== 'undefined' ? chrome : null);
        if (browserAPI && browserAPI.tabs && browserAPI.tabs.create) {
          browserAPI.tabs.create({ url, active: true });
          return true;
        }
      } catch (_) { /* fall through */ }
      try {
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
      } catch (_) {
        return false;
      }
    },
  },
});

const storeDefinitions = new Map();
function useAdsStore(bookmarkKey = '') {
  if (!storeDefinitions.has(bookmarkKey)) storeDefinitions.set(bookmarkKey, createAdsStore(bookmarkKey));
  return storeDefinitions.get(bookmarkKey)();
}

export { getService as getAdsService };
export default useAdsStore;
