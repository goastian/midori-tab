import { getJson, quotaSafeSet } from './StorageService.js';

export const REWARDS_INTEREST_ID_KEY = 'midori:rewards:interest-id:v1';
export const REWARDS_INTEREST_STATE_KEY = 'midori:rewards:interest-state:v1';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A preliminary choice must never make the New Tab wait on a remote service.
const DEFAULT_TIMEOUT_MS = 2500;

function baseUrl() {
  const value = import.meta.env?.VITE_ADS_API_BASE || 'https://ads.astian.org';
  return String(value).trim().replace(/\/+$/, '');
}

function createUuid() {
  const cryptoAPI = globalThis.crypto;
  if (typeof cryptoAPI?.randomUUID === 'function') return cryptoAPI.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoAPI.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default class RewardsInterestService {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || baseUrl();
    this.fetchFn = options.fetchFn || globalThis.fetch?.bind(globalThis);
    this.timeout = Number(options.timeout) || DEFAULT_TIMEOUT_MS;
    this.storage = options.storage || { get: getJson, set: quotaSafeSet };
    this.idFactory = options.idFactory || createUuid;
  }

  async state() {
    return (await this.storage.get(REWARDS_INTEREST_STATE_KEY, null)) || null;
  }

  async register(countryCode) {
    const country = String(countryCode || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !this.fetchFn) throw new Error('Select a valid country or region.');
    const anonymousId = await this.#anonymousId();
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timeoutId = controller ? setTimeout(() => controller.abort(), this.timeout) : null;

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/v1/public/viewer-rewards-interest`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'omit',
        signal: controller?.signal,
        body: JSON.stringify({ anonymous_id: anonymousId, country_code: country, source: 'midori_tab' }),
      });
      if (!response.ok) return this.#savePending(country);
      const responseBody = await response.json();
      const next = {
        countryCode: country,
        // Only the backend's explicit preliminary status is confirmation.
        status: responseBody.status === 'preliminary' ? 'preliminary' : 'pending_sync',
        registeredAt: Date.now(),
      };
      await this.storage.set(REWARDS_INTEREST_STATE_KEY, next);
      return next;
    } catch (error) {
      // The local choice is still useful and contains no account or payment data.
      // Keep it for an explicit retry after Astian Ads is reachable again.
      if (error?.message === 'Select a valid country or region.' || error?.message === 'Unable to create a local Rewards ID.') {
        throw error;
      }

      return this.#savePending(country);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async #savePending(country) {
    const next = { countryCode: country, status: 'pending_sync', registeredAt: Date.now() };
    await this.storage.set(REWARDS_INTEREST_STATE_KEY, next);
    return next;
  }

  async #anonymousId() {
    const stored = await this.storage.get(REWARDS_INTEREST_ID_KEY, null);
    if (typeof stored === 'string' && UUID_PATTERN.test(stored)) return stored.toLowerCase();
    const id = this.idFactory();
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) throw new Error('Unable to create a local Rewards ID.');
    await this.storage.set(REWARDS_INTEREST_ID_KEY, id.toLowerCase());
    return id.toLowerCase();
  }
}
