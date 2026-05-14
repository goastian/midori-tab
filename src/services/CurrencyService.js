import { getJson, setJsonDebounced } from './StorageService.js';

const CACHE_KEY = 'midori_currency_cache_v1';
const CACHE_TTL_MS = 45 * 60 * 1000;
const CACHE_MAX_ENTRIES = 8;
const CACHE_MAX_BYTES = 120_000;
const FETCH_TIMEOUT_MS = 7000;

async function readCache() {
  const parsed = await getJson(CACHE_KEY, {});
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeCache(cache) {
  const entries = Object.entries(cache)
    .sort(([, left], [, right]) => (right.timestamp || 0) - (left.timestamp || 0))
    .slice(0, CACHE_MAX_ENTRIES);
  try {
    setJsonDebounced(CACHE_KEY, Object.fromEntries(entries), {
      delayMs: 800,
      maxBytes: CACHE_MAX_BYTES,
    });
  } catch {
    // Ignore storage failures.
  }
}

class CurrencyService {
  async getRates(base = 'USD', options = {}) {
    const normalizedBase = String(base || 'USD').toUpperCase();
    const cache = await readCache();
    const now = Date.now();

    if (!options.forceRefresh && cache[normalizedBase] && now - cache[normalizedBase].timestamp < CACHE_TTL_MS) {
      return { ...cache[normalizedBase].data, fromCache: true };
    }

    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(normalizedBase)}`;
    let response;
    let timeoutId = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
      if (options.signal && controller) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      response = await fetch(url, {
        cache: options.forceRefresh ? 'reload' : 'default',
        signal: controller?.signal,
      });
    } catch (error) {
      if (cache[normalizedBase]) {
        return { ...cache[normalizedBase].data, fromCache: true, stale: true };
      }
      throw error;
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (cache[normalizedBase]) {
        return { ...cache[normalizedBase].data, fromCache: true, stale: true };
      }
      throw new Error(`Currency request failed: ${response.status}`);
    }

    const payload = await response.json();
    if (payload.result !== 'success' || !payload.rates) {
      if (cache[normalizedBase]) {
        return { ...cache[normalizedBase].data, fromCache: true, stale: true };
      }
      throw new Error('Currency service unavailable');
    }

    const data = {
      base: payload.base_code || normalizedBase,
      rates: payload.rates,
      fetchedAt: new Date().toISOString(),
      providerTime: payload.time_last_update_utc || null,
    };

    cache[normalizedBase] = {
      timestamp: now,
      data,
    };
    writeCache(cache);

    return { ...data, fromCache: false };
  }

  convert(amount, rates, to) {
    const target = String(to || '').toUpperCase();
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount)) return null;
    const rate = rates?.[target];
    if (!Number.isFinite(rate)) return null;
    return numericAmount * rate;
  }
}

export const currencyService = new CurrencyService();
export default currencyService;
