/**
 * AdsService — fetches native ads for the New Tab from ads.astian.org.
 *
 * Constraints (critical service for New Tab UX):
 * - Must NEVER block render. All network calls happen with a timeout.
 * - Cache for 15 minutes in chrome.storage.local (with localStorage fallback).
 * - On network failure, return last valid cache (offline fallback) regardless of TTL.
 * - Privacy: send only device_type, country, language. Never IP, fingerprints, or cookies.
 */

const DEFAULT_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const CACHE_KEY_PREFIX = 'ads:newtab:';
const STALE_FALLBACK_MAX_MS = 7 * 24 * 60 * 60 * 1000; // 7 days hard cap

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) return '';
  const trimmed = String(rawBaseUrl).trim().replace(/\/+$/, '');
  return trimmed;
}

function resolveBaseUrl() {
  const explicit = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env.VITE_ADS_API_BASE
    : null;
  return normalizeBaseUrl(explicit || 'https://ads.astian.org');
}

function resolveNewtabPath() {
  const explicit = (typeof import.meta !== 'undefined' && import.meta.env)
    ? import.meta.env.VITE_ADS_NEWTAB_PATH
    : null;
  const path = String(explicit || '/api/v1/ads/newtab').trim();
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Storage adapter: prefers chrome.storage.local (extension) and falls back to
 * localStorage for development / non-extension contexts.
 */
function defaultStorage() {
  const browserAPI = (typeof globalThis !== 'undefined' && (globalThis.chrome || globalThis.browser)) || null;
  const hasChromeStorage = browserAPI && browserAPI.storage && browserAPI.storage.local;

  if (hasChromeStorage) {
    return {
      async get(key) {
        return new Promise((resolve) => {
          try {
            browserAPI.storage.local.get([key], (result) => {
              resolve(result && result[key] !== undefined ? result[key] : null);
            });
          } catch (_) {
            resolve(null);
          }
        });
      },
      async set(key, value) {
        return new Promise((resolve) => {
          try {
            browserAPI.storage.local.set({ [key]: value }, () => resolve());
          } catch (_) {
            resolve();
          }
        });
      },
    };
  }

  // localStorage fallback
  const ls = (typeof globalThis !== 'undefined' && globalThis.localStorage) ? globalThis.localStorage : null;
  return {
    async get(key) {
      if (!ls) return null;
      try {
        const raw = ls.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (_) {
        return null;
      }
    },
    async set(key, value) {
      if (!ls) return;
      try {
        ls.setItem(key, JSON.stringify(value));
      } catch (_) { /* quota: ignore */ }
    },
  };
}

function buildCacheKey({ country, language }) {
  const c = (country || 'XX').toLowerCase();
  const l = (language || 'en').toLowerCase();
  return `${CACHE_KEY_PREFIX}${c}:${l}`;
}

export default class AdsService {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || resolveBaseUrl());
    this.path = options.path || resolveNewtabPath();
    this.timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT_MS;
    this.ttl = Number(options.ttl) > 0 ? Number(options.ttl) : CACHE_TTL_MS;
    this.storage = options.storage || defaultStorage();
    this.fetchFn = options.fetchFn || ((typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch.bind(globalThis) : null);
    this.now = options.now || (() => Date.now());
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.fetchFn);
  }

  /**
   * Fetch a New Tab ad. Returns { ad, source } where:
   *   - ad: object | null
   *   - source: 'fresh' | 'cache' | 'stale' | 'none'
   */
  async fetchNewTabAds({ device_type = 'desktop', country = '', language = 'en' } = {}) {
    const cacheKey = buildCacheKey({ country, language });
    const cached = await this.#readCache(cacheKey);

    if (cached && this.#isFresh(cached)) {
      return { ad: cached.ad, source: 'cache' };
    }

    if (!this.isConfigured()) {
      return cached ? { ad: cached.ad, source: 'stale' } : { ad: null, source: 'none' };
    }

    try {
      const ad = await this.#requestAd({ device_type, country, language });
      if (ad) {
        await this.#writeCache(cacheKey, ad);
        return { ad, source: 'fresh' };
      }
      // Server replied 404 / no ad — keep stale cache as graceful fallback.
      return cached ? { ad: cached.ad, source: 'stale' } : { ad: null, source: 'none' };
    } catch (_err) {
      // Network failure / timeout — fall back to last cache if not too old.
      if (cached && this.#isWithinHardCap(cached)) {
        return { ad: cached.ad, source: 'stale' };
      }
      return { ad: null, source: 'none' };
    }
  }

  async #requestAd({ device_type, country, language }) {
    const url = new URL(`${this.baseUrl}${this.path}`);
    if (device_type) url.searchParams.set('device_type', device_type);
    if (country) url.searchParams.set('country', country);
    if (language) url.searchParams.set('language', language);

    const controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), this.timeout)
      : null;

    try {
      const response = await this.fetchFn(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        signal: controller ? controller.signal : undefined,
      });

      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Ads request failed: ${response.status}`);

      const data = await response.json();
      if (!data || !data.ad_id || !data.destination_url) return null;
      return data;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async #readCache(key) {
    try {
      const raw = await this.storage.get(key);
      if (!raw || typeof raw !== 'object') return null;
      if (!raw.ad || !raw.fetchedAt) return null;
      return raw;
    } catch (_) {
      return null;
    }
  }

  async #writeCache(key, ad) {
    const entry = { ad, fetchedAt: this.now() };
    try {
      await this.storage.set(key, entry);
    } catch (_) { /* ignore */ }
  }

  #isFresh(entry) {
    return (this.now() - Number(entry.fetchedAt || 0)) < this.ttl;
  }

  #isWithinHardCap(entry) {
    return (this.now() - Number(entry.fetchedAt || 0)) < STALE_FALLBACK_MAX_MS;
  }
}

export { CACHE_TTL_MS, buildCacheKey };
