import { fetchBlobWithTimeout } from './fetchJsonWithTimeout.js';

const CACHE_NAME = 'midori-favicons-v1';
const MAX_ICON_BYTES = 64 * 1024;
const MAX_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 128;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class FaviconService {
  constructor({ cacheStorage = globalThis.caches, fetchFn = globalThis.fetch?.bind(globalThis), now = Date.now,
    privilegedFetch = ['moz-extension:', 'chrome-extension:'].includes(globalThis.location?.protocol),
    imageFactory = () => new Image(), imageTimeoutMs = 15000,
  } = {}) {
    this.cacheStorage = cacheStorage;
    this.fetchFn = fetchFn;
    this.now = now;
    this.privilegedFetch = privilegedFetch;
    this.imageFactory = imageFactory;
    this.imageTimeoutMs = imageTimeoutMs;
  }

  url(domain) {
    return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`;
  }

  async loadIcon(domain, { signal } = {}) {
    // Android can embed the page outside the extension origin. The provider
    // allows image loads but does not send CORS headers for ordinary fetch().
    if (this.privilegedFetch) {
      try { return { blob: await this.fetchIcon(domain, { signal }) }; }
      catch (error) {
        if (signal?.aborted || error?.name !== 'TypeError') throw error;
        this.privilegedFetch = false;
      }
    }
    return { url: await this.loadImage(domain, { signal }) };
  }

  loadImage(domain, { signal } = {}) {
    if (signal?.aborted) return Promise.reject(new DOMException('Request cancelled', 'AbortError'));
    return new Promise((resolve, reject) => {
      const image = this.imageFactory();
      const url = this.url(domain);
      const finish = error => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        signal?.removeEventListener('abort', onAbort);
        if (error) { image.removeAttribute('src'); reject(error); }
        else resolve(url);
      };
      const onAbort = () => finish(new DOMException('Request cancelled', 'AbortError'));
      const timer = setTimeout(() => finish(new Error('Favicon image timed out')), this.imageTimeoutMs);
      image.onload = () => finish(image.naturalWidth ? null : new Error('Invalid favicon image'));
      image.onerror = () => finish(new Error('Favicon image failed'));
      image.referrerPolicy = 'no-referrer';
      // Do not set crossOrigin: displaying the original icon needs no CORS.
      signal?.addEventListener('abort', onAbort, { once: true });
      image.src = url;
    });
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
