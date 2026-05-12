import assert from 'node:assert/strict'
import test from 'node:test'

import AdsService, { buildCacheKey } from '../src/services/AdsService.js'

function memoryStorage(seed = {}) {
  const state = { ...seed }
  return {
    state,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null
    },
    async set(key, value) {
      state[key] = value
    },
  }
}

function fakeAdResponse(overrides = {}) {
  return {
    ad_id: 42,
    title: 'Private Search',
    image_url: 'https://example.com/img.png',
    cta: 'Try it',
    destination_url: 'https://ads.astian.org/api/v1/ads/click/abc',
    impression_token: 'jwt-token',
    ...overrides,
  }
}

function makeFetch(responses) {
  const calls = []
  const queue = [...responses]
  const fn = async (url, opts = {}) => {
    calls.push({ url: String(url), opts })
    const next = queue.shift()
    if (!next) throw new Error('no more responses queued')
    if (next instanceof Error) throw next
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      async json() { return next.body },
    }
  }
  fn.calls = calls
  return fn
}

test('buildCacheKey normalizes country and language', () => {
  assert.equal(buildCacheKey({ country: 'US', language: 'EN' }), 'ads:newtab:us:en')
  assert.equal(buildCacheKey({ country: '', language: '' }), 'ads:newtab:xx:en')
})

test('fetchNewTabAds returns fresh ad and writes cache', async () => {
  const storage = memoryStorage()
  const fetchFn = makeFetch([{ status: 200, body: fakeAdResponse() }])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
    now: () => 1_000_000,
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'fresh')
  assert.equal(result.ad.ad_id, 42)
  const cached = storage.state['ads:newtab:us:en']
  assert.ok(cached)
  assert.equal(cached.ad.ad_id, 42)
  assert.equal(cached.fetchedAt, 1_000_000)
  assert.equal(fetchFn.calls.length, 1)
  assert.match(fetchFn.calls[0].url, /\/api\/v1\/ads\/newtab\?/)
  assert.match(fetchFn.calls[0].url, /country=US/)
  assert.match(fetchFn.calls[0].url, /language=en/)
})

test('fetchNewTabAds returns cache within TTL without hitting network', async () => {
  const cachedAd = fakeAdResponse({ ad_id: 7 })
  const storage = memoryStorage({
    'ads:newtab:us:en': { ad: cachedAd, fetchedAt: 1_000_000 },
  })
  const fetchFn = makeFetch([])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
    ttl: 15 * 60 * 1000,
    now: () => 1_000_000 + 5 * 60 * 1000, // 5 min later
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'cache')
  assert.equal(result.ad.ad_id, 7)
  assert.equal(fetchFn.calls.length, 0)
})

test('fetchNewTabAds falls back to stale cache on network error', async () => {
  const cachedAd = fakeAdResponse({ ad_id: 9 })
  const storage = memoryStorage({
    'ads:newtab:us:en': { ad: cachedAd, fetchedAt: 1_000_000 },
  })
  const fetchFn = makeFetch([new Error('offline')])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
    ttl: 60_000,
    now: () => 1_000_000 + 5 * 60 * 1000, // past TTL
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'stale')
  assert.equal(result.ad.ad_id, 9)
})

test('fetchNewTabAds returns none when 404 and no cache', async () => {
  const storage = memoryStorage()
  const fetchFn = makeFetch([{ status: 404, body: { message: 'No ad' } }])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
    now: () => 1_000_000,
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})

test('fetchNewTabAds rejects malformed response (no ad_id)', async () => {
  const storage = memoryStorage()
  const fetchFn = makeFetch([{ status: 200, body: { title: 'broken' } }])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
    now: () => 1_000_000,
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})

test('fetchNewTabAds discards cache older than 7-day hard cap', async () => {
  const cachedAd = fakeAdResponse()
  const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000
  const storage = memoryStorage({
    'ads:newtab:us:en': { ad: cachedAd, fetchedAt: eightDaysAgo },
  })
  const fetchFn = makeFetch([new Error('offline')])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
  })

  const result = await service.fetchNewTabAds({ country: 'US', language: 'en' })

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})
