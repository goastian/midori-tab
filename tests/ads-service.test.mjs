import assert from 'node:assert/strict'
import test from 'node:test'

import AdsService, {
  REWARDS_INTEREST_STATE_KEY,
  VISITOR_ID_KEY,
  impressionRetryDelayMs,
  isDecisionActive,
  retryAfterDelayMs,
} from '../src/services/AdsService.js'

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
    async remove(key) {
      delete state[key]
    },
    async keys() {
      return Object.keys(state)
    },
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
      async json() {
        return next.body
      },
      body: null,
    }
  }
  fn.calls = calls
  return fn
}

function makeService(options = {}) {
  const storage = options.storage || memoryStorage()
  const fetchFn = options.fetchFn || makeFetch([])
  return {
    storage,
    fetchFn,
    service: new AdsService({
      baseUrl: 'https://ads.astian.org',
      storage,
      fetchFn,
      now: options.now || (() => Date.now()),
      sleepFn: options.sleepFn || (async () => {}),
      ...options.extra,
    }),
  }
}

test('fetchNewTabAds returns a fresh signed decision', async () => {
  const { storage, fetchFn, service } = makeService({
    fetchFn: makeFetch([{ status: 200, body: fakeAdResponse() }]),
  })

  const result = await service.fetchNewTabAds({ device_type: 'desktop', country: 'US', language: 'en' })

  assert.equal(result.source, 'fresh')
  assert.equal(result.ad.ad_id, 42)
  assert.ok(Number.isFinite(result.latency_ms))
  assert.equal(fetchFn.calls.length, 1)
  assert.match(fetchFn.calls[0].url, /\/api\/v1\/ads\/newtab\?/)
  assert.match(fetchFn.calls[0].url, /device_type=desktop/)
  assert.match(fetchFn.calls[0].url, /country=US/)
  assert.match(fetchFn.calls[0].url, /language=en/)
})

function fakeAdResponse(overrides = {}) {
  return {
    contract_version: 'ads-channel-v1',
    format_id: 'newtab_icon_v1',
    channel: 'midori_tab',
    placement: 'new_tab',
    ad_id: 42,
    title: 'Private Search',
    icon_url: 'https://ads.astian.org/img/icon.png',
    image_url: 'https://ads.astian.org/img/icon.png',
    destination_url: 'https://ads.astian.org/api/v1/ads/click/abc',
    impression_token: 'jwt-token',
    attribution_token: 'attr-token',
    opportunity_id: 'opp-1',
    request_id: 'req-1',
    decision_id: 'dec-1',
    expires_at: Math.floor((Date.now() + 60 * 60 * 1000) / 1000),
    disclosure_required: true,
    sponsor_label: 'Sponsored',
    billing: {
      model: 'vcpm',
      funding_type: 'prepaid',
      amount_micros: 1_000_000,
      currency: 'USD',
    },
    transparency: {
      data_used: ['browsing_history'],
      frequency_cap_per_day: 3,
      feedback_enabled: true,
      legacy: false,
    },
    ...overrides,
  }
}

test('fetchNewTabAds persists a visitor id used on the request', async () => {
  const storage = memoryStorage()
  const fetchFn = makeFetch([{ status: 200, body: fakeAdResponse() }])
  const service = new AdsService({
    baseUrl: 'https://ads.astian.org',
    storage,
    fetchFn,
  })

  await service.fetchNewTabAds()
  const visitorId = storage.state[VISITOR_ID_KEY]
  assert.ok(typeof visitorId === 'string' && visitorId.length > 10)
  assert.match(fetchFn.calls[0].url, new RegExp(`visitor_id=${visitorId}`))
})

test('fetchNewTabAds attaches the active Midori Rewards token to the ad decision request', async () => {
  const storage = memoryStorage({
    [REWARDS_INTEREST_STATE_KEY]: { status: 'active', rewardToken: 'reward-token' },
  })
  const fetchFn = makeFetch([{ status: 200, body: fakeAdResponse() }])
  const service = new AdsService({ baseUrl: 'https://ads.astian.org', storage, fetchFn })

  await service.fetchNewTabAds()

  assert.equal(fetchFn.calls[0].opts.headers['X-Wallet-Token'], 'reward-token')
})

test('fetchNewTabAds returns null ad with source none on 204', async () => {
  const { service, fetchFn } = makeService({
    fetchFn: makeFetch([{ status: 204, body: null }]),
  })

  const result = await service.fetchNewTabAds()

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})

test('fetchNewTabAds returns none when no campaign is available', async () => {
  const { service, fetchFn } = makeService({
    fetchFn: makeFetch([{ status: 404, body: { message: 'No ad' } }]),
  })

  const result = await service.fetchNewTabAds()

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})

test('fetchNewTabAds reports an error without blocking on network failure', async () => {
  const { service } = makeService({
    fetchFn: makeFetch([new Error('offline')]),
  })

  const result = await service.fetchNewTabAds()

  assert.equal(result.source, 'error')
  assert.equal(result.ad, null)
  assert.ok(typeof result.error === 'string')
})

test('fetchNewTabAds rejects malformed responses that fail the contract', async () => {
  const { service } = makeService({
    fetchFn: makeFetch([{ status: 200, body: { contract_version: 'ads-channel-v1', title: 'broken' } }]),
  })

  const result = await service.fetchNewTabAds()

  assert.equal(result.source, 'none')
  assert.equal(result.ad, null)
})

test('isDecisionActive gates expired decisions with an expiry safety margin', () => {
  // now() is ms; expires_at is in seconds (the service multiplies it by 1000).
  const now = () => 1_000_000

  assert.equal(
    isDecisionActive({ expires_at: 1031 }, now, 30_000),
    true,
  )
  assert.equal(
    isDecisionActive({ expires_at: 1029 }, now, 30_000),
    false,
  )
})

test('retryAfterDelayMs parses header seconds and caps the delay', () => {
  const now = () => Date.now()
  const seconds = retryAfterDelayMs({
    headers: { get: () => '3' },
  }, now)
  assert.ok(Number.isFinite(seconds) && seconds >= 2000 && seconds <= 5000)

  const dateHeader = retryAfterDelayMs({
    headers: { get: () => new Date(now() + 4000).toUTCString() },
  }, now)
  assert.ok(Number.isFinite(dateHeader) && dateHeader >= 3000 && dateHeader <= 5000)

  const missing = retryAfterDelayMs({ headers: { get: () => null } }, now)
  assert.equal(missing, null)
})

test('impressionRetryDelayMs applies exponential backoff with jitter', () => {
  const random = () => 0
  const backoff = impressionRetryDelayMs({ attempt: 3, random })
  assert.ok(backoff >= 50 && backoff <= 5000)
  const fast = impressionRetryDelayMs({ attempt: 1, random: () => 0.5 })
  assert.ok(fast >= 50 && fast <= 5000)
})

test('trackImpression POSTs the signed decision once with keepalive', async () => {
  const { fetchFn, service } = makeService({
    fetchFn: makeFetch([{ status: 200, body: null }]),
  })
  const ad = fakeAdResponse()

  const accepted = await service.trackImpression('jwt-token', {
    expiresAt: ad.expires_at,
  })

  assert.equal(accepted, true)
  assert.equal(fetchFn.calls.length, 1)
  assert.equal(fetchFn.calls[0].opts.method, 'POST')
  assert.match(fetchFn.calls[0].url, /\/api\/v1\/ads\/impression$/)
  assert.equal(fetchFn.calls[0].opts.keepalive, true)
})

test('trackImpression does not fire when the decision is expired', async () => {
  const { fetchFn, service } = makeService({
    fetchFn: makeFetch([{ status: 200, body: null }]),
  })
  const expired = Math.floor((Date.now() - 60 * 60 * 1000) / 1000)

  const accepted = await service.trackImpression('jwt-token', { expiresAt: expired })

  assert.equal(accepted, false)
  assert.equal(fetchFn.calls.length, 0)
})

test('trackClientEvent only accepts the allow-listed event types', async () => {
  const { fetchFn, service } = makeService({
    fetchFn: makeFetch([{ status: 200, body: null }]),
  })
  const ad = fakeAdResponse()

  const invalid = await service.trackClientEvent('nope', 'jwt-token', { expiresAt: ad.expires_at })
  assert.equal(invalid, false)
  assert.equal(fetchFn.calls.length, 0)

  const valid = await service.trackClientEvent('ad_dismissed', 'jwt-token', { expiresAt: ad.expires_at })
  assert.equal(valid, true)
  assert.equal(fetchFn.calls.length, 1)
  assert.match(fetchFn.calls[0].url, /\/api\/v1\/ads\/client-event$/)
})
