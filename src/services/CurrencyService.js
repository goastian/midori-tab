const CACHE_KEY = 'midori_currency_cache_v1';
const CACHE_TTL_MS = 45 * 60 * 1000;

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore storage failures.
  }
}

class CurrencyService {
  async getRates(base = 'USD') {
    const normalizedBase = String(base || 'USD').toUpperCase();
    const cache = readCache();
    const now = Date.now();

    if (cache[normalizedBase] && now - cache[normalizedBase].timestamp < CACHE_TTL_MS) {
      return { ...cache[normalizedBase].data, fromCache: true };
    }

    const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(normalizedBase)}`;
    let response;
    try {
      response = await fetch(url, { cache: 'no-store' });
    } catch (error) {
      if (cache[normalizedBase]) {
        return { ...cache[normalizedBase].data, fromCache: true, stale: true };
      }
      throw error;
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
