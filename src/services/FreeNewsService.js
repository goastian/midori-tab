const API_BASE_URL = 'https://api.freenewsapi.io/v1/news';
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 18;
const REQUEST_TIMEOUT_MS = 8_000;
const DETAIL_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const DETAIL_REQUEST_INTERVAL_MS = 550;

export const NEWS_COUNTRIES = Object.freeze([
  'AR', 'AU', 'BR', 'CA', 'CL', 'CO', 'DE', 'ES', 'FR', 'GB', 'IN', 'IT', 'JP', 'KR', 'MX', 'PE', 'PT', 'US',
]);

export const NEWS_LANGUAGES = Object.freeze([
  'ar', 'de', 'en', 'es', 'fr', 'it', 'ja', 'ko', 'pt',
]);

export const NEWS_TOPICS = Object.freeze([
  'world', 'politics', 'business', 'technology', 'science', 'health', 'entertainment', 'sports',
]);

function configuredApiKey() {
  return String(import.meta?.env?.VITE_FREENEWS_API_KEY || '').trim();
}

function cleanText(value, maxLength = 120) {
  return String(value || '').trim().slice(0, maxLength);
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(value => cleanText(value, 48).toLowerCase())
    .filter(Boolean))];
}

export function isSafeHttpUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch (_) {
    return false;
  }
}

export function normalizeNewsFilters(filters = {}) {
  const country = cleanText(filters.country, 2).toUpperCase();
  const language = cleanText(filters.language, 12).toLowerCase();
  const topic = cleanText(filters.topic, 48).toLowerCase();

  return {
    query: cleanText(filters.query, 120),
    country: NEWS_COUNTRIES.includes(country) ? country : '',
    language: NEWS_LANGUAGES.includes(language) ? language : '',
    topic: NEWS_TOPICS.includes(topic) ? topic : '',
    cursor: cleanText(filters.cursor, 1024),
  };
}

export function buildFreeNewsUrl(filters = {}) {
  const normalized = normalizeNewsFilters(filters);
  const url = new URL(API_BASE_URL);

  // The provider removed its legacy `q` parameter. Searches are now title-based.
  if (normalized.query) url.searchParams.set('in_title', normalized.query);
  if (normalized.country) url.searchParams.set('country', normalized.country.toLowerCase());
  if (normalized.language) url.searchParams.set('language', normalized.language);
  if (normalized.topic) url.searchParams.set('topic', normalized.topic);
  if (normalized.cursor) url.searchParams.set('cursor', normalized.cursor);

  return url;
}

export function buildFreeNewsDetailUrl(uuid) {
  const id = cleanText(uuid, 128);
  const url = new URL('https://api.freenewsapi.io/v1/details');
  if (id) url.searchParams.set('uuid', id);
  return url;
}

export function normalizeFreeNewsArticle(article = {}) {
  const originalUrl = article.original_url || article.url || article.link || '';
  const thumbnail = article.thumbnail || article.image || article.image_url || '';

  return {
    id: cleanText(article.uuid || article.id, 128),
    title: cleanText(article.title, 300),
    subtitle: cleanText(article.subtitle || article.description, 420),
    publisher: cleanText(article.publisher || article.source?.name, 120),
    publishedAt: cleanText(article.published_at || article.publishedAt, 64),
    url: isSafeHttpUrl(originalUrl) ? originalUrl : '',
    thumbnail: isSafeHttpUrl(thumbnail) ? thumbnail : '',
    topics: uniqueStrings(article.topics || article.topic ? (article.topics || [article.topic]) : []),
    countries: uniqueStrings(article.countries),
    languages: uniqueStrings(article.languages),
  };
}

export function deriveTrendTopics(articles = []) {
  const counts = new Map();
  for (const article of articles) {
    for (const topic of article?.topics || []) {
      counts.set(topic, (counts.get(topic) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([topic, count]) => ({ topic, count }));
}

export function bindBrowserFetch(fetchSource = globalThis) {
  if (!fetchSource || typeof fetchSource.fetch !== 'function') return null;
  return fetchSource.fetch.bind(fetchSource);
}

function normalizePayload(payload = {}) {
  const articles = (Array.isArray(payload.data) ? payload.data : [])
    .map(normalizeFreeNewsArticle)
    .filter(article => article.id && article.title);

  const meta = payload.meta || {};
  return {
    articles,
    meta: {
      hasMore: Boolean(meta.has_more),
      nextCursor: cleanText(meta.next_cursor, 1024),
      returned: Number.isFinite(Number(meta.returned)) ? Number(meta.returned) : articles.length,
    },
  };
}

function canonicalCacheKey(filters) {
  const normalized = normalizeNewsFilters(filters);
  return JSON.stringify({
    query: normalized.query.toLocaleLowerCase(),
    country: normalized.country,
    language: normalized.language,
    topic: normalized.topic,
    cursor: normalized.cursor,
  });
}

function relaxedNewsFilters(filters = {}) {
  const normalized = normalizeNewsFilters(filters);
  if (normalized.cursor) return [];

  const candidates = [];
  let candidate = { ...normalized };
  // A category is the narrowest preference. If there is no matching recent
  // article, retain location/language before relaxing the language as well.
  for (const key of ['topic', 'language']) {
    if (!candidate[key]) continue;
    candidate = { ...candidate, [key]: '' };
    candidates.push(candidate);
  }
  return candidates;
}

class FreeNewsResponseError extends Error {
  constructor(status) {
    super(`FreeNewsAPI respondió con estado ${status}.`);
    this.name = 'FreeNewsResponseError';
    this.status = status;
  }
}

function abortDetailRequest() {
  const error = new Error('Article image request superseded.');
  error.name = 'AbortError';
  return error;
}

export class FreeNewsService {
  constructor({
    apiKey = configuredApiKey(),
    fetchFn,
    now = () => Date.now(),
  } = {}) {
    this.apiKey = String(apiKey || '').trim();
    // Keep the native browser function bound once. Chrome and Firefox reject
    // unbound Window.fetch calls with "Illegal invocation".
    this.fetchFn = fetchFn || bindBrowserFetch();
    this.now = now;
    this.cache = new Map();
    this.detailCache = new Map();
    this.detailRequests = new Map();
    this.detailQueue = Promise.resolve();
    this.lastDetailRequestAt = 0;
    this.detailGeneration = 0;
  }

  isConfigured() {
    return Boolean(this.apiKey) && typeof this.fetchFn === 'function';
  }

  clearCache() {
    this.cache.clear();
    this.detailCache.clear();
  }

  cancelQueuedArticleDetails() {
    this.detailGeneration += 1;
    for (const { controller } of this.detailRequests.values()) controller?.abort();
  }

  async requestJson(url, { signal } = {}) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    let timedOut = false;
    const timeoutId = controller ? globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS) : null;
    if (signal && controller) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await this.fetchFn(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'x-api-key': this.apiKey,
        },
        credentials: 'omit',
        signal: controller?.signal,
      });

      if (!response.ok) throw new FreeNewsResponseError(response.status);
      return response.json();
    } catch (error) {
      if (timedOut && error?.name === 'AbortError') error.isTimeout = true;
      throw error;
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  }

  requestPayload(filters, options = {}) {
    return this.requestJson(buildFreeNewsUrl(filters).toString(), options);
  }

  async fetchArticleDetails(uuid) {
    const id = cleanText(uuid, 128);
    if (!id) return null;
    const generation = this.detailGeneration;

    const cached = this.detailCache.get(id);
    if (cached && this.now() - cached.timestamp < DETAIL_CACHE_TTL_MS) return cached.value;
    const inFlight = this.detailRequests.get(id);
    if (inFlight?.generation === generation) return inFlight.request;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;

    const request = this.detailQueue.then(async () => {
      if (generation !== this.detailGeneration) throw abortDetailRequest();
      const waitMs = Math.max(0, DETAIL_REQUEST_INTERVAL_MS - (this.now() - this.lastDetailRequestAt));
      if (waitMs) await new Promise(resolve => globalThis.setTimeout(resolve, waitMs));
      if (generation !== this.detailGeneration) throw abortDetailRequest();
      this.lastDetailRequestAt = this.now();
      const payload = await this.requestJson(buildFreeNewsDetailUrl(id).toString(), {
        signal: controller?.signal,
      });
      const value = normalizeFreeNewsArticle(payload?.data || {});
      this.detailCache.set(id, { timestamp: this.now(), value });
      return value;
    });

    this.detailQueue = request.catch(() => undefined);
    this.detailRequests.set(id, { generation, request, controller });
    try {
      return await request;
    } finally {
      if (this.detailRequests.get(id)?.request === request) this.detailRequests.delete(id);
    }
  }

  async fetchNews(filters = {}, { force = false, signal } = {}) {
    if (!this.isConfigured()) {
      throw new Error('FreeNewsAPI no está configurada. Añade VITE_FREENEWS_API_KEY al archivo .env de Midori Tab.');
    }

    const cacheKey = canonicalCacheKey(filters);
    const cached = this.cache.get(cacheKey);
    const now = this.now();
    if (!force && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return { ...cached.value, fromCache: true, isStale: false };
    }

    try {
      const value = normalizePayload(await this.requestPayload(filters, { signal }));
      if (!value.articles.length) {
        for (const fallbackFilters of relaxedNewsFilters(filters)) {
          const fallbackKey = canonicalCacheKey(fallbackFilters);
          const fallbackCached = this.cache.get(fallbackKey);
          const fallbackValue = !force && fallbackCached && now - fallbackCached.timestamp < CACHE_TTL_MS
            ? fallbackCached.value
            : normalizePayload(await this.requestPayload(fallbackFilters, { signal }));
          this.cache.set(fallbackKey, { timestamp: now, value: fallbackValue });
          if (!fallbackValue.articles.length) continue;

          const result = { ...fallbackValue, filterFallback: true };
          this.cache.set(cacheKey, { timestamp: now, value: result });
          this.pruneCache();
          return { ...result, fromCache: false, isStale: false, searchFallback: false };
        }
      }
      this.cache.set(cacheKey, { timestamp: now, value });
      this.pruneCache();
      return { ...value, fromCache: false, isStale: false, searchFallback: false };
    } catch (error) {
      const fallbackFilters = { ...filters, query: '' };
      const fallbackCacheKey = canonicalCacheKey(fallbackFilters);
      const fallbackCached = this.cache.get(fallbackCacheKey);
      const hasFreshFallback = fallbackCached && now - fallbackCached.timestamp < CACHE_TTL_MS;
      const canUseSearchFallback = Boolean(
        normalizeNewsFilters(filters).query
        && !signal?.aborted
        && (error?.isTimeout || Number(error?.status) === 429 || Number(error?.status) >= 500),
      );
      if (canUseSearchFallback) {
        const value = {
          ...(hasFreshFallback
            ? fallbackCached.value
            : normalizePayload(await this.requestPayload(fallbackFilters, { signal }))),
          searchFallback: true,
        };
        this.cache.set(cacheKey, { timestamp: now, value });
        this.pruneCache();
        return { ...value, fromCache: false, isStale: false };
      }
      if (error?.name === 'AbortError') throw error;
      if (cached?.value) return { ...cached.value, fromCache: true, isStale: true };
      throw error;
    }
  }

  pruneCache() {
    while (this.cache.size > CACHE_MAX_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }
}

const freeNewsService = new FreeNewsService();

export default freeNewsService;
