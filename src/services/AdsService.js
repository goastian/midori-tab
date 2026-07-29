/**
 * AdsService — fetches sponsored shortcuts for the New Tab from Ads.
 *
 * Constraints (critical service for New Tab UX):
 * - Must NEVER block render. All network calls happen with a timeout.
 * - Every New Tab load requests a new signed decision/lease.
 * - Decisions and impression tokens are never persisted or reused.
 * - Privacy: send only coarse context plus a random, New-Tab-only visitor UUID.
 *   The UUID is generated locally; it is never derived from device attributes.
 */

const DEFAULT_TIMEOUT_MS = 6000;
const LEGACY_CACHE_KEY_PREFIX = 'ads:newtab:';
const VISITOR_ID_KEY = 'ads:newtab:visitor_id:v1';
const EXPIRY_SAFETY_MS = 30 * 1000;
const DEFAULT_IMPRESSION_ATTEMPTS = 2;
const DEFAULT_IMPRESSION_RETRY_DELAY_MS = 200;
const MAX_IMPRESSION_RETRY_DELAY_MS = 5000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_EVENT_TYPES = new Set([
  'feedback_relevant',
  'feedback_irrelevant',
  'ad_dismissed',
  'ad_opt_out',
  'accidental_click_guard',
  'client_performance',
]);

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) return '';
  const trimmed = String(rawBaseUrl).trim().replace(/\/+$/, '');
  return trimmed;
}

function normalizeContractLanguage(value) {
  return String(value || '').trim().toLowerCase().startsWith('es') ? 'es' : 'en';
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
      async remove(key) {
        return new Promise((resolve) => {
          try {
            browserAPI.storage.local.remove([key], () => resolve());
          } catch (_) {
            resolve();
          }
        });
      },
      async keys() {
        return new Promise((resolve) => {
          try {
            browserAPI.storage.local.get(null, (result) => {
              resolve(result && typeof result === 'object' ? Object.keys(result) : []);
            });
          } catch (_) {
            resolve([]);
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
    async remove(key) {
      if (!ls) return;
      try {
        ls.removeItem(key);
      } catch (_) { /* ignore */ }
    },
    async keys() {
      if (!ls) return [];
      try {
        return Array.from({ length: ls.length }, (_, index) => ls.key(index))
          .filter(Boolean);
      } catch (_) {
        return [];
      }
    },
  };
}

function buildLegacyCacheKey({ country, language }) {
  const c = (country || 'XX').toLowerCase();
  const l = (language || 'en').toLowerCase();
  return `${LEGACY_CACHE_KEY_PREFIX}${c}:${l}`;
}

function createRandomUuid() {
  const cryptoAPI = (typeof globalThis !== 'undefined') ? globalThis.crypto : null;
  if (typeof cryptoAPI?.randomUUID === 'function') {
    return cryptoAPI.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoAPI?.getRandomValues === 'function') {
    cryptoAPI.getRandomValues(bytes);
  } else {
    // Extension pages normally expose Web Crypto. Keep a UUID fallback so an
    // unusual runtime can never issue an Ads request without visitor_id.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

function isLocalHostname(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

function isDecisionActive(ad, now = Date.now, safetyMs = 0) {
  const expiresAtMs = Number(ad?.expires_at || 0) * 1000;
  return Number.isSafeInteger(expiresAtMs)
    && expiresAtMs > (Number(now()) + Math.max(0, Number(safetyMs) || 0));
}

function isRetryableImpressionStatus(status) {
  return status === 408
    || status === 425
    || status === 429
    || (status >= 500 && status <= 599);
}

function retryAfterDelayMs(response, now = Date.now) {
  const rawValue = String(response?.headers?.get?.('retry-after') || '').trim();
  if (!rawValue) return null;

  if (/^\d+(?:\.\d+)?$/.test(rawValue)) {
    return Math.min(
      MAX_IMPRESSION_RETRY_DELAY_MS,
      Math.max(0, Math.ceil(Number(rawValue) * 1000)),
    );
  }

  const retryAt = Date.parse(rawValue);
  if (!Number.isFinite(retryAt)) return null;
  return Math.min(
    MAX_IMPRESSION_RETRY_DELAY_MS,
    Math.max(0, retryAt - Number(now())),
  );
}

function impressionRetryDelayMs({ attempt, response, random = Math.random, now = Date.now } = {}) {
  const retryAfter = retryAfterDelayMs(response, now);
  if (retryAfter !== null) return retryAfter;

  const exponent = Math.max(0, Math.min(Number(attempt || 1) - 1, 4));
  const ceiling = Math.min(
    MAX_IMPRESSION_RETRY_DELAY_MS,
    DEFAULT_IMPRESSION_RETRY_DELAY_MS * (2 ** exponent),
  );
  const jitter = Math.max(0, Math.min(1, Number(random()) || 0));
  return Math.max(50, Math.round(ceiling * (0.5 + (jitter * 0.5))));
}

function defaultSleep(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs));
}

export default class AdsService {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || resolveBaseUrl());
    this.path = options.path || resolveNewtabPath();
    this.timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT_MS;
    this.storage = options.storage || defaultStorage();
    this.fetchFn = options.fetchFn || ((typeof globalThis !== 'undefined' && globalThis.fetch) ? globalThis.fetch.bind(globalThis) : null);
    this.now = options.now || (() => Date.now());
    this.sleep = options.sleepFn || defaultSleep;
    this.random = options.randomFn || Math.random;
    this.visitorIdFactory = options.visitorIdFactory || createRandomUuid;
    this.eventIdFactory = options.eventIdFactory || createRandomUuid;
    this.legacyCacheCleanupDone = false;
  }

  isConfigured() {
    return Boolean(this.baseUrl && this.fetchFn);
  }

  /**
   * Fetch a New Tab ad. Returns { ad, source } where:
   *   - ad: object | null
   *   - source: 'fresh' | 'none' | 'error'
   */
  async fetchNewTabAds({ device_type = 'desktop', country = '', language = 'en' } = {}) {
    await this.#removeLegacyDecisionCache({ country, language });
    const startedAt = Number(this.now());

    if (!this.isConfigured()) {
      return { ad: null, source: 'none', latency_ms: 0 };
    }

    try {
      const ad = await this.#requestAd({ device_type, country, language });
      const latencyMs = Math.max(0, Math.round(Number(this.now()) - startedAt));
      return ad
        ? { ad, source: 'fresh', latency_ms: latencyMs }
        : { ad: null, source: 'none', latency_ms: latencyMs };
    } catch (error) {
      // Keep New Tab rendering non-blocking while preserving the distinction
      // between expected no-fill and an operational Ads failure.
      return {
        ad: null,
        source: 'error',
        error: error instanceof Error ? error.message : 'Ads request failed',
        latency_ms: Math.max(0, Math.round(Number(this.now()) - startedAt)),
      };
    }
  }

  /**
   * Record a leased impression. Retrying is safe because the signed decision
   * is the server-side idempotency key; only a successful 2xx is acknowledged.
   */
  async trackImpression(impressionToken, options = {}) {
    if (
      !this.isConfigured()
      || typeof impressionToken !== 'string'
      || !impressionToken.trim()
      || !isDecisionActive({ expires_at: options.expiresAt }, this.now)
    ) {
      return false;
    }

    const requestedAttempts = Number(options.maxAttempts);
    const maxAttempts = Number.isSafeInteger(requestedAttempts) && requestedAttempts > 0
      ? Math.min(requestedAttempts, 3)
      : DEFAULT_IMPRESSION_ATTEMPTS;
    const endpoint = `${this.baseUrl}/api/v1/ads/impression`;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      let retryResponse = null;
      try {
        const response = await this.fetchFn(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          credentials: 'omit',
          keepalive: true,
          body: JSON.stringify({ impression_token: impressionToken }),
        });

        if (response.ok) return true;
        try { await response.body?.cancel?.(); } catch (_) { /* ignore */ }
        if (!isRetryableImpressionStatus(response.status)) return false;
        retryResponse = response;
      } catch (_) {
        // A network failure may have happened before or after server commit.
        // Replaying the same signed decision is intentionally idempotent.
      }

      if (attempt < maxAttempts) {
        await this.sleep(impressionRetryDelayMs({
          attempt,
          response: retryResponse,
          random: this.random,
          now: this.now,
        }));
      }
    }

    return false;
  }

  /**
   * Record privacy-safe UX evidence tied to the signed decision. Arbitrary
   * metadata is intentionally unsupported; only bounded numeric guardrails
   * cross the extension boundary.
   */
  async trackClientEvent(eventType, impressionToken, options = {}) {
    if (
      !this.isConfigured()
      || !CLIENT_EVENT_TYPES.has(eventType)
      || typeof impressionToken !== 'string'
      || !impressionToken.trim()
      || !isDecisionActive({ expires_at: options.expiresAt }, this.now)
    ) {
      return false;
    }

    const eventId = this.eventIdFactory();
    if (typeof eventId !== 'string' || !UUID_PATTERN.test(eventId)) return false;

    const metrics = {};
    for (const key of [
      'request_latency_ms',
      'layout_shift_micros',
      'interaction_latency_ms',
    ]) {
      const value = Number(options.metrics?.[key]);
      if (Number.isSafeInteger(value) && value >= 0) metrics[key] = value;
    }

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/v1/ads/client-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        credentials: 'omit',
        keepalive: true,
        body: JSON.stringify({
          event_id: eventId.toLowerCase(),
          event_type: eventType,
          impression_token: impressionToken,
          metrics,
        }),
      });
      return response.ok;
    } catch (_) {
      return false;
    }
  }

  async #requestAd({ device_type, country, language }) {
    const url = new URL(`${this.baseUrl}${this.path}`);
    if (device_type) url.searchParams.set('device_type', device_type);
    if (country) url.searchParams.set('country', country);
    url.searchParams.set('language', normalizeContractLanguage(language));
    const visitorId = await this.#resolveVisitorId();
    // visitor_id is part of the deployed ads.astian.org contract. Never send
    // the request without it and keep it in the query string for compatibility.
    url.searchParams.set('visitor_id', visitorId);

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

      if (response.status === 204 || response.status === 404) return null;
      if (!response.ok) throw new Error(`Ads request failed: ${response.status}`);

      const data = this.#normalizeContract(await response.json());
      if (!this.#isValidContract(data)) return null;
      return data;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async #removeLegacyDecisionCache(context) {
    if (this.legacyCacheCleanupDone) return;
    this.legacyCacheCleanupDone = true;

    try {
      if (typeof this.storage.keys === 'function' && typeof this.storage.remove === 'function') {
        const keys = await this.storage.keys();
        const decisionKeys = keys.filter(key => (
          typeof key === 'string'
          && key.startsWith(LEGACY_CACHE_KEY_PREFIX)
          && key !== VISITOR_ID_KEY
        ));
        await Promise.all(decisionKeys.map(key => this.storage.remove(key)));
        return;
      }

      // Compatibility with injected/older storage adapters that cannot list
      // keys: remove at least the legacy entry for the current context.
      const currentLegacyKey = buildLegacyCacheKey(context);
      if (typeof this.storage.remove === 'function') {
        await this.storage.remove(currentLegacyKey);
      } else {
        await this.storage.set(currentLegacyKey, null);
      }
    } catch (_) { /* ignore */ }
  }

  async #resolveVisitorId() {
    let stored = null;
    try {
      stored = await this.storage.get(VISITOR_ID_KEY);
    } catch (_) { /* generate a replacement below */ }

    if (typeof stored === 'string' && UUID_PATTERN.test(stored)) {
      return stored.toLowerCase();
    }

    let generated = null;
    try {
      generated = this.visitorIdFactory();
    } catch (_) { /* handled by the invariant below */ }

    if (typeof generated !== 'string' || !UUID_PATTERN.test(generated)) {
      throw new Error('Unable to create required Ads visitor ID');
    }

    const visitorId = generated.toLowerCase();
    try {
      await this.storage.set(VISITOR_ID_KEY, visitorId);
    } catch (_) { /* this lease can still use the generated in-memory ID */ }

    return visitorId;
  }

  #isDecisionValid(ad) {
    return isDecisionActive(ad, this.now, EXPIRY_SAFETY_MS);
  }

  #normalizeContract(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
    const iconUrl = data.icon_url || data.image_url || '';
    const disclosureRequired = typeof data.disclosure_required === 'boolean'
      ? data.disclosure_required
      : data.billing?.funding_type === 'prepaid';
    const hasTransparency = Object.prototype.hasOwnProperty.call(data, 'transparency');
    const transparency = data.transparency && typeof data.transparency === 'object'
      && !Array.isArray(data.transparency)
      ? data.transparency
      : null;
    return {
      ...data,
      icon_url: iconUrl,
      image_url: data.image_url || iconUrl,
      disclosure_required: disclosureRequired,
      sponsor_label: disclosureRequired && typeof data.sponsor_label === 'string'
        ? data.sponsor_label.trim()
        : null,
      attribution_token: typeof data.attribution_token === 'string'
        ? data.attribution_token.trim()
        : '',
      transparency: !disclosureRequired
        ? null
        : (transparency
        ? {
          data_used: Array.isArray(transparency.data_used)
            ? transparency.data_used.filter(value => typeof value === 'string')
            : [],
          frequency_cap_per_day: Number.isSafeInteger(transparency.frequency_cap_per_day)
            ? Math.max(0, transparency.frequency_cap_per_day)
            : 0,
          feedback_enabled: transparency.feedback_enabled === true,
          legacy: false,
        }
        : (hasTransparency ? null : {
          data_used: [],
          frequency_cap_per_day: 0,
          feedback_enabled: false,
          legacy: true,
        })),
    };
  }

  #isValidBilling(billing) {
    if (!billing || typeof billing !== 'object' || Array.isArray(billing)) return false;
    if (billing.model !== 'vcpm') return false;
    if (!['house', 'prepaid'].includes(billing.funding_type)) return false;
    if (!Number.isSafeInteger(billing.amount_micros) || billing.amount_micros < 0) return false;
    if (!/^[A-Z]{3}$/.test(billing.currency)) return false;
    return billing.funding_type !== 'house' || billing.amount_micros === 0;
  }

  #isAllowedAssetUrl(rawUrl) {
    try {
      const asset = new URL(rawUrl);
      const apiUrl = new URL(this.baseUrl);
      const allowedApiProtocol = apiUrl.protocol === 'https:'
        || (apiUrl.protocol === 'http:' && isLocalHostname(apiUrl.hostname));
      return allowedApiProtocol
        && asset.protocol === apiUrl.protocol
        && asset.origin === apiUrl.origin;
    } catch (_) {
      return false;
    }
  }

  #isValidContract(data) {
    if (!data || data.contract_version !== 'ads-channel-v1') return false;
    if (data.format_id !== 'newtab_icon_v1') return false;
    if (data.channel !== 'midori_tab' || data.placement !== 'new_tab') return false;
    const validAdId = (Number.isSafeInteger(data.ad_id) && data.ad_id > 0)
      || (typeof data.ad_id === 'string' && data.ad_id.trim().length > 0);
    const requiredStrings = [
      data.opportunity_id,
      data.request_id,
      data.decision_id,
      data.title,
      data.icon_url,
      data.destination_url,
      data.impression_token,
      data.attribution_token,
    ];
    if (!validAdId || requiredStrings.some(value => typeof value !== 'string' || !value.trim())) return false;
    const fundingType = data.billing?.funding_type;
    if (
      typeof data.disclosure_required !== 'boolean'
      || data.disclosure_required !== (fundingType === 'prepaid')
    ) return false;
    if (!data.disclosure_required) {
      if (data.sponsor_label !== null || data.transparency !== null) return false;
    } else if (
      typeof data.sponsor_label !== 'string'
      || !data.sponsor_label.trim()
      || !data.transparency
      || !Array.isArray(data.transparency.data_used)
      || !Number.isSafeInteger(data.transparency.frequency_cap_per_day)
      || typeof data.transparency.feedback_enabled !== 'boolean'
      || (
        data.transparency.legacy !== true
        && (
          data.transparency.data_used.length === 0
          || data.transparency.feedback_enabled !== true
        )
      )
    ) return false;
    if (
      !this.#isAllowedAssetUrl(data.icon_url)
      || !this.#isAllowedAssetUrl(data.image_url)
      || !this.#isValidBilling(data.billing)
    ) return false;
    if (!this.#isDecisionValid(data)) return false;

    try {
      const destination = new URL(data.destination_url);
      const apiUrl = new URL(this.baseUrl);
      const allowedApiProtocol = apiUrl.protocol === 'https:'
        || (apiUrl.protocol === 'http:' && isLocalHostname(apiUrl.hostname));
      return allowedApiProtocol
        && destination.protocol === apiUrl.protocol
        && destination.origin === apiUrl.origin
        && destination.pathname.startsWith('/api/v1/ads/click/');
    } catch (_) {
      return false;
    }
  }
}

export {
  VISITOR_ID_KEY,
  impressionRetryDelayMs,
  isDecisionActive,
  retryAfterDelayMs,
};
