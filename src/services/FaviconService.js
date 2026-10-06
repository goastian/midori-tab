import { fetchBlobWithTimeout } from './fetchJsonWithTimeout.js';

const CACHE_NAME = 'midori-favicons-v1';
const MAX_ICON_BYTES = 64 * 1024;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class FaviconService {
  constructor({ cacheStorage = globalThis.caches, fetchFn = globalThis.fetch?.bind(globalThis), now = Date.now } = {}) {
    this.cacheStorage = cacheStorage;
    this.fetchFn = fetchFn;
    this.now = now;
  }

  url(domain) {
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
  }

  async readCached(domain) {
    try {
      const cache = await this.cacheStorage?.open(CACHE_NAME);
      const response = await cache?.match(this.url(domain));
      if (!response) return null;
      const blob = await response.blob();
      if (!blob.size || blob.size > MAX_ICON_BYTES || !blob.type.startsWith('image/')) return null;
      return { blob, stale: this.now() - Number(response.headers.get('x-midori-fetched-at') || 0) > MAX_AGE_MS };
    } catch {
      return null;
    }
  }

  async fetchIcon(domain, { signal } = {}) {
    const { response, payload: blob } = await fetchBlobWithTimeout(this.url(domain), {
      fetchFn: this.fetchFn, signal, timeoutMs: 6000,
      credentials: 'omit', referrerPolicy: 'no-referrer',
    });
    if (!response.ok || !blob?.size || blob.size > MAX_ICON_BYTES || !blob.type.startsWith('image/')) {
      throw new Error('Invalid favicon response');
    }
    if (signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
    try {
      const cache = await this.cacheStorage?.open(CACHE_NAME);
      if (cache) {
        await cache.put(this.url(domain), new Response(blob, { headers: {
          'content-type': blob.type,
          'x-midori-fetched-at': String(this.now()),
          'x-midori-bytes': String(blob.size),
        } }));
        void this.prune(cache).catch(() => {});
      }
    } catch {
      // A cache/quota failure must not prevent the fetched favicon from displaying.
    }
    return blob;
  }

  async remove(domain) {
    try { await (await this.cacheStorage?.open(CACHE_NAME))?.delete(this.url(domain)); } catch { /* optional cache */ }
  }

  async prune(cache) {
    const entries = await Promise.all((await cache.keys()).map(async request => {
      const response = await cache.match(request);
      return { request, bytes: Number(response?.headers.get('x-midori-bytes') || 0),
        time: Number(response?.headers.get('x-midori-fetched-at') || 0) };
    }));
    entries.sort((a, b) => b.time - a.time);
    let bytes = 0;
    for (let index = 0; index < entries.length; index += 1) {
      bytes += entries[index].bytes;
      if (index >= MAX_CACHE_ENTRIES || bytes > MAX_CACHE_BYTES) await cache.delete(entries[index].request);
    }
  }
}

export default new FaviconService();
