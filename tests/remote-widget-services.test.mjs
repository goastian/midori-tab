import assert from 'node:assert/strict';
import test, { after, beforeEach, mock } from 'node:test';

const state = {};
globalThis.localStorage = {
  getItem: key => (Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null),
  setItem: (key, value) => { state[key] = String(value); },
  removeItem: key => { delete state[key]; },
};
delete globalThis.browser;
delete globalThis.chrome;

const { flushAllPending, getJson } = await import('../src/services/StorageService.js');
const { default: weatherService } = await import('../src/services/WeatherService.js');
const { default: currencyService } = await import('../src/services/CurrencyService.js');
const { FreeNewsService, NEWS_MAX_ARTICLES } = await import('../src/services/FreeNewsService.js');
const { classifyRemoteError, describeRemoteState, formatAge } = await import('../src/utils/remoteStatus.js');
const { getWidgetCopy } = await import('../src/i18n/widget-copy.js');

const realFetch = globalThis.fetch;
const WEATHER_KEY = 'midori_weather_cache_v1';
const CURRENCY_KEY = 'midori_currency_cache_v1';
const NEWS_KEY = 'midori_news_snapshots_v1';
const HOUR = 60 * 60 * 1000;

let calls;

function install(handler) {
  calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return handler(String(url), options);
  };
}

function json(body, { status = 200 } = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function seed(key, value) {
  state[key] = JSON.stringify({ __midoriStorageVersion: 1, value, updatedAt: Date.now() });
}

const stored = key => JSON.parse(state[key]).value;

beforeEach(() => {
  for (const key of Object.keys(state)) delete state[key];
  globalThis.fetch = realFetch;
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
});

after(() => { flushAllPending(); globalThis.fetch = realFetch; });

const forecastPayload = (temperature = 21) => ({
  current: { temperature_2m: temperature, weather_code: 0, wind_speed_10m: 9 },
  daily: { temperature_2m_max: [25], temperature_2m_min: [14], weather_code: [1] },
  timezone: 'Europe/Madrid',
});

const place = { latitude: 40.4168, longitude: -3.7038, unit: 'metric' };

function seededWeather(ageMs, overrides = {}) {
  seed(WEATHER_KEY, { '40.42|-3.7|metric': { timestamp: Date.now() - ageMs, data: {
    temperature: 17, wind: 4, conditionCode: 0, conditionKey: 'clear', high: 20, low: 10, dailyConditionCode: 1,
    timezone: 'UTC', fetchedAt: new Date(Date.now() - ageMs).toISOString(), unit: 'metric', latitude: 40.42, longitude: -3.7, ...overrides } } });
}

test('weather: a fresh snapshot is reused without any request', async () => {
  seededWeather(60_000);
  install(() => { throw new Error('must not be called'); });
  const result = await weatherService.getForecast(place);
  assert.equal(result.temperature, 17);
  assert.equal(result.fromCache, true);
  assert.equal(calls.length, 0);
});

test('weather: offline reuses an aged snapshot and says why, instead of failing', async () => {
  seededWeather(3 * HOUR);
  install(() => { throw new TypeError('NetworkError when attempting to fetch resource.'); });
  const result = await weatherService.getForecast(place);
  assert.equal(result.stale, true);
  assert.equal(result.fromCache, true);
  assert.equal(result.temperature, 17, 'The saved reading is returned, not an invented one');
  assert.equal(result.failureKind, 'network');
  assert.ok(Date.parse(result.fetchedAt) < Date.now() - 2 * HOUR, 'The original reading time is kept so the age can be shown');
  assert.equal(calls.length, 1);
  assert.equal(stored(WEATHER_KEY)['40.42|-3.7|metric'].data.temperature, 17, 'A failure does not rewrite the snapshot');
});

test('weather: provider errors keep the snapshot and classify the cause', async () => {
  seededWeather(3 * HOUR);
  for (const [status, kind] of [[503, 'unavailable'], [429, 'rateLimited']]) {
    install(() => json({ error: true }, { status }));
    const result = await weatherService.getForecast(place);
    assert.equal(result.stale, true);
    assert.equal(result.failureKind, kind);
  }
});

test('weather: without a snapshot the error reaches the widget with a classifiable cause', async () => {
  install(() => json({}, { status: 500 }));
  await assert.rejects(() => weatherService.getForecast(place), error => classifyRemoteError(error) === 'unavailable');
  install(() => { throw new TypeError('fetch failed'); });
  await assert.rejects(() => weatherService.getForecast(place), error => classifyRemoteError(error) === 'network');
  assert.equal(state[WEATHER_KEY], undefined, 'Nothing is cached after failures');
});

test('weather: a 200 without readings is a failure and does not replace a good snapshot', async () => {
  seededWeather(3 * HOUR);
  install(() => json({ current: {}, daily: {} }));
  const result = await weatherService.getForecast(place);
  assert.equal(result.stale, true);
  assert.equal(result.temperature, 17);
  assert.equal(stored(WEATHER_KEY)['40.42|-3.7|metric'].data.temperature, 17);
  localStorage.removeItem(WEATHER_KEY);
  await assert.rejects(() => weatherService.getForecast(place));
});

test('weather: a cancelled request is reported as cancelled and never answered from the snapshot', async () => {
  seededWeather(3 * HOUR);
  install(() => new Promise(() => {}));
  const controller = new AbortController();
  const pending = weatherService.getForecast({ ...place, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(() => weatherService.getForecast({ ...place, signal: controller.signal }), { name: 'AbortError' });
});

test('weather: a request that never answers times out and falls back to the snapshot', async () => {
  seededWeather(3 * HOUR);
  install((_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))));
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = weatherService.getForecast(place);
    await new Promise(resolve => setImmediate(resolve));
    mock.timers.tick(7000);
    const result = await pending;
    assert.equal(result.stale, true);
    assert.equal(result.failureKind, 'timeout');
  } finally { mock.timers.reset(); }
});

test('weather: the snapshot store keeps at most eight places and separates units', async () => {
  install(() => json(forecastPayload()));
  for (let index = 0; index < 12; index += 1) {
    await weatherService.getForecast({ latitude: 10 + index, longitude: 20, unit: 'metric' });
  }
  await weatherService.getForecast({ latitude: 50, longitude: 20, unit: 'imperial' });
  flushAllPending();
  const cache = stored(WEATHER_KEY);
  assert.ok(Object.keys(cache).length <= 8, `${Object.keys(cache).length} entries`);
  assert.ok(cache['50|20|imperial'], 'The newest entry survives');
  assert.ok(!cache['10|20|metric'], 'The oldest entry is dropped');
  assert.equal(await weatherService.getCachedForecast({ latitude: 50, longitude: 20, unit: 'metric' }), null,
    'A snapshot of another unit is never offered');
  assert.ok(new Blob([state[WEATHER_KEY]]).size < 80_000);
});

test('weather: the cached snapshot reports its age without any request', async () => {
  seededWeather(3 * HOUR);
  install(() => { throw new Error('must not be called'); });
  const cached = await weatherService.getCachedForecast(place);
  assert.equal(cached.stale, true);
  assert.equal(cached.fromCache, true);
  assert.equal(calls.length, 0);
});

const ratesPayload = { result: 'success', base_code: 'USD', rates: { USD: 1, EUR: 0.9, JPY: 150 }, time_last_update_utc: 'Sat, 24 Oct 2026 00:00:00 +0000' };

function seededRates(ageMs, base = 'USD') {
  seed(CURRENCY_KEY, { [base]: { timestamp: Date.now() - ageMs, data: {
    base, rates: { USD: 1, EUR: 0.8 }, fetchedAt: new Date(Date.now() - ageMs).toISOString(), providerTime: null } } });
}

test('currency: offline reuses an aged snapshot and keeps the old rate, marked stale', async () => {
  seededRates(2 * 24 * HOUR);
  install(() => { throw new TypeError('NetworkError'); });
  const result = await currencyService.getRates('usd');
  assert.equal(result.stale, true);
  assert.equal(result.rates.EUR, 0.8);
  assert.equal(result.failureKind, 'network');
  assert.equal(currencyService.convert(10, result.rates, 'eur'), 8);
});

test('currency: rates of one base are never offered for another', async () => {
  seededRates(HOUR, 'USD');
  assert.equal(await currencyService.getCachedRates('EUR'), null);
  install(() => { throw new TypeError('NetworkError'); });
  await assert.rejects(() => currencyService.getRates('EUR'));
});

test('currency: provider failures and malformed answers keep the snapshot', async () => {
  seededRates(2 * HOUR);
  for (const response of [() => json({}, { status: 500 }), () => json({ result: 'error' }), () => json({ result: 'success', rates: {} }),
    () => json({ result: 'success', rates: { EUR: 'abc' } }), () => json(null)]) {
    install(response);
    const result = await currencyService.getRates('USD');
    assert.equal(result.stale, true);
    assert.equal(result.rates.EUR, 0.8);
  }
  assert.equal(stored(CURRENCY_KEY).USD.data.rates.EUR, 0.8);
  localStorage.removeItem(CURRENCY_KEY);
  install(() => json({ result: 'error' }));
  await assert.rejects(() => currencyService.getRates('USD'), error => classifyRemoteError(error) === 'unavailable');
});

test('currency: fresh answers update the snapshot, the TTL avoids requests and forcing bypasses it', async () => {
  install(() => json(ratesPayload));
  const first = await currencyService.getRates('USD');
  assert.equal(first.fromCache, false);
  assert.equal(first.rates.EUR, 0.9);
  const second = await currencyService.getRates('USD');
  assert.equal(second.fromCache, true);
  assert.equal(calls.length, 1);
  await currencyService.getRates('USD', { forceRefresh: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/open\.er-api\.com\/v6\/latest\/USD$/);
});

test('currency: the snapshot store keeps at most eight bases and conversion rejects invalid input', async () => {
  install(url => json({ ...ratesPayload, base_code: url.split('/').pop() }));
  for (const base of ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'MXN', 'BRL', 'RUB', 'INR']) await currencyService.getRates(base);
  flushAllPending();
  assert.ok(Object.keys(stored(CURRENCY_KEY)).length <= 8);
  assert.equal(currencyService.convert('abc', { EUR: 1 }, 'EUR'), null);
  assert.equal(currencyService.convert(5, { EUR: 'x' }, 'EUR'), null);
  assert.equal(currencyService.convert(5, null, 'EUR'), null);
});

function article(index, extra = {}) {
  return { uuid: `story-${index}`, title: `Story ${index}`, description: 'Summary', publisher: 'Fixture News',
    published_at: '2026-10-24T10:00:00Z', original_url: `https://news.example/${index}`, topics: ['world'], ...extra };
}

function newsService(handler, options = {}) {
  const requests = [];
  const service = new FreeNewsService({ apiKey: 'fixture-key', now: () => Date.now(), ...options, fetchFn: async (url, init) => {
    requests.push({ url: String(url), init });
    return handler(String(url), init);
  } });
  return { service, requests };
}

const filters = { country: 'ES', language: 'es', topic: 'world' };

test('news: offline shows the saved stories as stale with their original time', async () => {
  let now = Date.now();
  const online = newsService(() => json({ data: [article(1), article(2)], meta: { has_more: false } }), { now: () => now });
  const fresh = await online.service.fetchNews(filters);
  assert.equal(fresh.fromCache, false);
  flushAllPending();
  now += 3 * HOUR;
  const offline = newsService(() => { throw new TypeError('NetworkError'); }, { now: () => now });
  const result = await offline.service.fetchNews(filters);
  assert.equal(result.isStale, true);
  assert.equal(result.fromCache, true);
  assert.deepEqual(result.articles.map(item => item.id), ['story-1', 'story-2']);
  assert.ok(now - result.fetchedAt >= 3 * HOUR - 1000, 'The age of the snapshot is preserved');
  assert.equal(offline.requests.length, 1, 'One attempt is made before falling back');
});

test('news: without a snapshot the failure is reported, never an empty or invented list', async () => {
  const offline = newsService(() => { throw new TypeError('NetworkError'); });
  await assert.rejects(() => offline.service.fetchNews(filters), error => classifyRemoteError(error) === 'network');
  const limited = newsService(() => json({}, { status: 429 }));
  await assert.rejects(() => limited.service.fetchNews(filters), error => classifyRemoteError(error) === 'rateLimited');
  const unconfigured = newsService(() => json({}), { apiKey: '' });
  await assert.rejects(() => unconfigured.service.fetchNews(filters), error => classifyRemoteError(error) === 'notConfigured');
  assert.equal(unconfigured.requests.length, 0);
});

test('news: snapshots of other filters are not reused', async () => {
  const online = newsService(() => json({ data: [article(1)], meta: {} }));
  await online.service.fetchNews(filters);
  flushAllPending();
  const offline = newsService(() => { throw new TypeError('NetworkError'); });
  await assert.rejects(() => offline.service.fetchNews({ ...filters, country: 'MX' }));
  assert.equal(await offline.service.getSnapshot({ ...filters, topic: 'sports' }), null);
});

test('news: lists are limited to the maximum and persisted snapshots stay bounded', async () => {
  const many = newsService(() => json({ data: Array.from({ length: 200 }, (_, index) => article(index, { description: 'x'.repeat(400) })), meta: { has_more: true, next_cursor: 'c' } }));
  const result = await many.service.fetchNews(filters);
  assert.equal(result.articles.length, NEWS_MAX_ARTICLES);
  for (const topic of ['politics', 'business', 'technology', 'science', 'health']) await many.service.fetchNews({ ...filters, topic });
  flushAllPending();
  const snapshots = stored(NEWS_KEY);
  assert.ok(Object.keys(snapshots).length <= 4, `${Object.keys(snapshots).length} snapshots`);
  assert.ok(new Blob([state[NEWS_KEY]]).size <= 180_000, 'The persisted snapshot stays within its byte limit');
  for (const entry of Object.values(snapshots)) assert.ok(entry.value.articles.length <= 40);
});

test('news: a cancelled request is never answered with saved stories', async () => {
  const online = newsService(() => json({ data: [article(1)], meta: {} }));
  await online.service.fetchNews(filters);
  flushAllPending();
  let release;
  const slow = newsService((_url, init) => new Promise((resolve, reject) => {
    release = resolve;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }));
  const controller = new AbortController();
  const pending = slow.service.fetchNews(filters, { force: true, signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  release?.(json({ data: [article(99)], meta: {} }));
});

test('news: a failing text search falls back to the latest stories and says so', async () => {
  const service = newsService(url => (url.includes('in_title') ? json({}, { status: 503 }) : json({ data: [article(7)], meta: {} })));
  const result = await service.service.fetchNews({ ...filters, query: 'election' });
  assert.equal(result.searchFallback, true);
  assert.deepEqual(result.articles.map(item => item.id), ['story-7']);
});

test('error classification covers connectivity, timeouts, limits and unknown failures', () => {
  assert.equal(classifyRemoteError(new TypeError('x'), true), 'network');
  assert.equal(classifyRemoteError(new TypeError('x'), false), 'offline');
  assert.equal(classifyRemoteError(Object.assign(new Error('t'), { isTimeout: true }), true), 'timeout');
  assert.equal(classifyRemoteError({ status: 429 }, true), 'rateLimited');
  assert.equal(classifyRemoteError({ status: 500 }, true), 'unavailable');
  assert.equal(classifyRemoteError(new Error('?'), true), 'unavailable');
});

test('user-facing remote messages exist in every language and include the age of saved data', async () => {
  const now = Date.parse('2026-10-24T12:00:00Z');
  for (const locale of ['en', 'es', 'pt', 'fr', 'de', 'ru', 'zh', 'ja', 'it']) {
    const copy = getWidgetCopy(locale).remoteStatus;
    for (const key of ['offline', 'network', 'timeout', 'rateLimited', 'unavailable', 'notConfigured', 'savedFrom', 'retry']) {
      assert.ok(copy[key], `${locale}.remoteStatus.${key}`);
    }
    assert.match(copy.savedFrom, /\{age\}/);
    const { default: messages } = await import(`../src/i18n/locales/${locale}.js`);
    assert.ok(messages.privacy.stats.unavailable, `${locale}: privacy.stats.unavailable`);
    for (const key of ['invalid-country', 'terms-required', 'invalid-destination', 'payout-failed', 'timeout', 'network']) {
      assert.ok(getWidgetCopy(locale).rewardsErrors[key], `${locale}.rewardsErrors.${key}`);
    }
  }
  const copy = getWidgetCopy('en').remoteStatus;
  const message = describeRemoteState(copy, 'offline', { fetchedAt: now - 3 * HOUR, locale: 'en', now });
  assert.equal(message, 'You are offline. Showing saved data from 3 hours ago.');
  assert.equal(describeRemoteState(copy, 'timeout', { locale: 'en', now }), copy.timeout);
  assert.equal(formatAge('not a date', 'en', now), '');
  assert.equal(formatAge(now - 10_000, 'es', now), 'este minuto');
  assert.equal(formatAge(now - 3 * 24 * HOUR, 'es', now), 'hace 3 días');
});

test('persisted caches are readable through the storage layer', async () => {
  seededWeather(HOUR);
  assert.ok((await getJson(WEATHER_KEY, {}))['40.42|-3.7|metric']);
});
