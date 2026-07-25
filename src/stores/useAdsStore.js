import { defineStore } from 'pinia';
import AdsService, { isDecisionActive } from '../services/AdsService.js';

/**
 * Detects basic device type from UA. Avoids fingerprinting; only coarse class.
 */
function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(ua)) return 'tablet';
  if (/mobile|iphone|android.+mobile|ipod/.test(ua)) return 'mobile';
  return 'desktop';
}

/**
 * Best-effort country code from Intl timezone (privacy-friendly: no geo-IP).
 * Returns ISO-3166-2 letters or empty string.
 */
function detectCountry() {
  try {
    const locale = (typeof navigator !== 'undefined' && navigator.language) || '';
    const parts = String(locale).split('-');
    if (parts.length > 1 && parts[1].length === 2) return parts[1].toUpperCase();
  } catch (_) { /* ignore */ }
  return '';
}

function detectLanguage() {
  try {
    const lang = (typeof navigator !== 'undefined' && navigator.language) || 'en';
    return String(lang).split('-')[0].toLowerCase();
  } catch (_) {
    return 'en';
  }
}

/**
 * Per-session dismissal tracking — uses sessionStorage so a dismissed ad does
 * not reappear in the same browsing session but resets on next session.
 */
const SESSION_DISMISS_KEY = 'ads:newtab:dismissed';

function readDismissed() {
  try {
    if (typeof sessionStorage === 'undefined') return new Set();
    const raw = sessionStorage.getItem(SESSION_DISMISS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch (_) {
    return new Set();
  }
}

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

const useAdsStore = defineStore('adsStore', {
  state: () => ({
    currentAd: null,
    lastFetchedAt: 0,
    loading: false,
    error: null,
    /** 'fresh' | 'none' | 'dismissed' | null */
    source: null,
    impressionTracked: false,
    impressionTracking: false,
  }),

  getters: {
    hasAd(state) {
      return Boolean(state.currentAd && state.currentAd.ad_id);
    },
  },

  actions: {
    async loadAd(force = false) {
      if (this.loading) return;
      if (!force && this.hasAd) return;

      this.loading = true;
      this.error = null;

      try {
        const service = getService();
        const result = await service.fetchNewTabAds({
          device_type: detectDeviceType(),
          country: detectCountry(),
          language: detectLanguage(),
        });

        if (result && result.ad) {
          const dismissed = readDismissed();
          if (dismissed.has(String(result.ad.ad_id))) {
            this.currentAd = null;
            this.source = 'dismissed';
            this.impressionTracked = false;
            this.impressionTracking = false;
          } else {
            this.currentAd = result.ad;
            this.source = result.source;
            this.impressionTracked = false;
            this.impressionTracking = false;
          }
        } else {
          this.currentAd = null;
          this.source = 'none';
          this.impressionTracked = false;
          this.impressionTracking = false;
        }

        this.lastFetchedAt = Date.now();
      } catch (err) {
        this.error = err && err.message ? err.message : 'Unknown ads error';
        this.currentAd = null;
        this.source = 'none';
        this.impressionTracked = false;
        this.impressionTracking = false;
      } finally {
        this.loading = false;
      }
    },

    dismiss() {
      if (!this.currentAd) return;
      const id = String(this.currentAd.ad_id);
      const dismissed = readDismissed();
      dismissed.add(id);
      writeDismissed(dismissed);
      this.currentAd = null;
      this.source = 'dismissed';
      this.impressionTracked = false;
      this.impressionTracking = false;
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
    trackClick() {
      if (!this.currentAd || !this.currentAd.destination_url) return false;
      if (!isDecisionActive(this.currentAd)) return false;

      const decisionId = String(this.currentAd.decision_id || '').trim();
      if (!decisionId) return false;

      const url = this.currentAd.destination_url;
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

export default useAdsStore;
