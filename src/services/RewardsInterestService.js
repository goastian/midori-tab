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

  async register(countryCode, { termsAccepted = false } = {}) {
    const country = String(countryCode || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !this.fetchFn) throw new Error('Select a valid country or region.');
    if (!termsAccepted) throw new Error('Accept the Rewards terms and tax declaration to continue.');
    const anonymousId = await this.#anonymousId();
    const controller = typeof AbortController === 'undefined' ? null : new AbortController();
    const timeoutId = controller ? setTimeout(() => controller.abort(), this.timeout) : null;

    try {
      const response = await this.fetchFn(`${this.baseUrl}/api/v1/public/viewer-rewards-interest`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        credentials: 'omit',
        signal: controller?.signal,
        body: JSON.stringify({ anonymous_id: anonymousId, country_code: country, source: 'midori_tab', terms_accepted: true }),
      });
      if (!response.ok) return this.#savePending(country, termsAccepted);
      const responseBody = await response.json();
      const token = typeof responseBody.reward_token === 'string' ? responseBody.reward_token.trim() : '';
      const next = {
        countryCode: country,
        // Only a server-issued token confirms an active earning identity.
        status: responseBody.status === 'active' && token !== '' ? 'active' : 'pending_sync',
        rewardToken: token || null,
        payoutDestinationSet: false,
        termsAccepted: true,
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

      return this.#savePending(country, termsAccepted);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  async #savePending(country, termsAccepted = false) {
    const next = { countryCode: country, status: 'pending_sync', termsAccepted: Boolean(termsAccepted), registeredAt: Date.now() };
    await this.storage.set(REWARDS_INTEREST_STATE_KEY, next);
    return next;
  }

  async setPayoutDestination(destination) {
    const state = await this.state();
    const value = String(destination || '').trim();
    if (!state?.rewardToken || value.length < 3 || !this.fetchFn) throw new Error('Enter a valid Juky account or address.');
    const response = await this.fetchFn(`${this.baseUrl}/api/v1/public/viewer-rewards-payout-destination`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Wallet-Token': state.rewardToken },
      credentials: 'omit',
      body: JSON.stringify({ destination: value }),
    });
    if (!response.ok) throw new Error('We could not save your Juky destination.');
    const next = { ...state, payoutDestinationSet: true };
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
