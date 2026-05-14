import { getJson, setJsonDebounced } from './StorageService.js';

const CACHE_KEY = 'midori_weather_cache_v1';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 8;
const CACHE_MAX_BYTES = 80_000;
const FETCH_TIMEOUT_MS = 7000;

function roundCoord(value) {
  return Math.round(Number(value) * 100) / 100;
}

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
    // Ignore storage quota errors.
  }
}

function getConditionKey(code) {
  if (code === 0) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 80, 81, 82].includes(code)) return 'rain';
  if ([66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'unknown';
}

class WeatherService {
  async getForecast({ latitude, longitude, unit = 'metric', forceRefresh = false, signal = null }) {
    const lat = roundCoord(latitude);
    const lon = roundCoord(longitude);
    const cacheId = `${lat}|${lon}|${unit}`;
    const cache = await readCache();
    const now = Date.now();

    if (!forceRefresh && cache[cacheId] && now - cache[cacheId].timestamp < CACHE_TTL_MS) {
      return { ...cache[cacheId].data, fromCache: true };
    }

    const temperatureUnit = unit === 'imperial' ? 'fahrenheit' : 'celsius';
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'temperature_2m,weather_code,wind_speed_10m');
    url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,weather_code');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('temperature_unit', temperatureUnit);

    let response;
    let timeoutId = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller ? globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS) : null;
      if (signal && controller) {
        if (signal.aborted) controller.abort();
        else signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      response = await fetch(url.toString(), {
        cache: forceRefresh ? 'reload' : 'default',
        signal: controller?.signal,
      });
    } catch (error) {
      if (cache[cacheId]) {
        return { ...cache[cacheId].data, fromCache: true, stale: true };
      }
      throw error;
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }

    if (!response.ok) {
      if (cache[cacheId]) {
        return { ...cache[cacheId].data, fromCache: true, stale: true };
      }
      throw new Error(`Weather request failed: ${response.status}`);
    }

    const payload = await response.json();
    const current = payload.current || {};
    const daily = payload.daily || {};

    const data = {
      temperature: current.temperature_2m,
      wind: current.wind_speed_10m,
      conditionCode: current.weather_code,
      conditionKey: getConditionKey(current.weather_code),
      high: Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] : null,
      low: Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] : null,
      dailyConditionCode: Array.isArray(daily.weather_code) ? daily.weather_code[0] : null,
      timezone: payload.timezone || 'UTC',
      fetchedAt: new Date().toISOString(),
      unit,
      latitude: lat,
      longitude: lon,
    };

    cache[cacheId] = {
      timestamp: now,
      data,
    };
    writeCache(cache);

    return { ...data, fromCache: false };
  }
}

export const weatherService = new WeatherService();
export default weatherService;
