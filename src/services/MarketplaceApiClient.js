import { fetchJsonWithTimeout } from './fetchJsonWithTimeout.js';

const DEFAULT_TIMEOUT = 8000;

function normalizeBaseUrl(rawBaseUrl) {
  if (!rawBaseUrl) return '';

  const trimmed = String(rawBaseUrl).trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

function resolveBaseUrl() {
  const explicitBaseUrl = import.meta.env?.VITE_MARKETPLACE_API_BASE_URL;
  const legacyServer = import.meta.env?.VITE_PASSPORT_SERVER;

  if (explicitBaseUrl) {
    return normalizeBaseUrl(explicitBaseUrl);
  }

  if (legacyServer) {
    return normalizeBaseUrl(legacyServer);
  }

  return '';
}

function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl}${path}`);

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (Array.isArray(value)) {
      value.forEach(item => {
        if (item !== undefined && item !== null && item !== '') {
          url.searchParams.append(key, item);
        }
      });
      return;
    }
    url.searchParams.set(key, String(value));
  });

  return url;
}

export default class MarketplaceApiClient {
  constructor(options = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl || resolveBaseUrl());
    this.timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT;
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  async getCatalog(params = {}, options = {}) {
    return this.#getJson('/catalog', params, options);
  }

  async getAsset(slug) {
    return this.#getJson(`/assets/${encodeURIComponent(slug)}`);
  }

  getDownloadUrl(slug, version) {
    if (!this.isConfigured() || !slug) return '';
    return buildUrl(this.baseUrl, `/assets/${encodeURIComponent(slug)}/download`, { version }).toString();
  }

  async #getJson(path, params = {}, options = {}) {
    if (!this.isConfigured()) {
      throw new Error('Marketplace API base URL is not configured.');
    }

    const { response, payload } = await fetchJsonWithTimeout(buildUrl(this.baseUrl, path, params), {
      timeoutMs: this.timeout,
      signal: options.signal,
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Marketplace request failed with status ${response.status}.`);
    return payload;
  }
}
