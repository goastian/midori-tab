import assert from 'node:assert/strict';
import test from 'node:test';

import RewardsInterestService, {
  REWARDS_INTEREST_ID_KEY,
  REWARDS_INTEREST_STATE_KEY,
  RewardsError,
} from '../src/services/RewardsInterestService.js';

const UUID = '3f2b8c64-5d1e-4a7b-9c3d-1e2f3a4b5c6d';
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, get: async (key, fallback) => (data.has(key) ? data.get(key) : fallback), set: async (key, value) => { data.set(key, value); } };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function create({ fetchFn, storage = memoryStorage(), timeout = 2500 } = {}) {
  const requests = [];
  const service = new RewardsInterestService({ baseUrl: 'https://ads.test', storage, timeout, idFactory: () => UUID,
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), init, body: init.body ? JSON.parse(init.body) : null });
      return fetchFn(String(url), init, requests.length);
    } });
  return { service, storage, requests };
}

const active = { status: 'active', reward_token: 'token-123' };

test('a registration sends only the anonymous id, the country and the consent, and keeps the server token', async () => {
  const { service, storage, requests } = create({ fetchFn: () => json(active) });
  const state = await service.register('es', { termsAccepted: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://ads.test/api/v1/public/viewer-rewards-interest');
  assert.deepEqual(requests[0].body, { anonymous_id: UUID, country_code: 'ES', source: 'midori_tab', terms_accepted: true });
  assert.equal(requests[0].init.credentials, 'omit');
  assert.equal(state.status, 'active');
  assert.equal(state.rewardToken, 'token-123');
  assert.deepEqual(storage.data.get(REWARDS_INTEREST_STATE_KEY), state);
  assert.equal(storage.data.get(REWARDS_INTEREST_ID_KEY), UUID);
});

test('simultaneous registrations share one request', async () => {
  let release;
  const { service, requests } = create({ fetchFn: () => new Promise(resolve => { release = () => resolve(json(active)); }) });
  const first = service.register('ES', { termsAccepted: true });
  const second = service.register('ES', { termsAccepted: true });
  await tick();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(requests.length, 1);
  assert.equal(a, b);
});

test('registering again after success does not register twice', async () => {
  const { service, requests } = create({ fetchFn: () => json(active) });
  const first = await service.register('ES', { termsAccepted: true });
  const second = await service.register('ES', { termsAccepted: true });
  assert.equal(requests.length, 1);
  assert.deepEqual(second, first);
  await service.register('MX', { termsAccepted: true });
  assert.equal(requests.length, 2, 'A different country is a real change');
});

test('two documents registering at once take turns and the second reuses the first result', async () => {
  const storage = memoryStorage();
  const held = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, writable: true, value: { locks: {
    request: (_name, _options, task) => {
      const run = (held.at(-1) || Promise.resolve()).then(task);
      held.push(run.catch(() => {}));
      return run;
    },
  } } });
  try {
    let hits = 0;
    const fetchFn = async () => { hits += 1; await tick(20); return json(active); };
    const first = create({ fetchFn, storage });
    const second = create({ fetchFn, storage });
    const [a, b] = await Promise.all([first.service.register('ES', { termsAccepted: true }), second.service.register('ES', { termsAccepted: true })]);
    assert.equal(hits, 1);
    assert.equal(a.rewardToken, b.rewardToken);
  } finally { delete globalThis.navigator.locks; }
});

test('a server error, a network failure or a timeout leave a pending local choice, not an active account', async () => {
  const cases = {
    server: () => json({ error: 'down' }, 503),
    network: () => { throw new TypeError('NetworkError'); },
    timeout: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
    'active without a token': () => json({ status: 'active' }),
  };
  for (const [name, fetchFn] of Object.entries(cases)) {
    const { service, storage } = create({ fetchFn, timeout: 40 });
    const state = await service.register('ES', { termsAccepted: true });
    assert.equal(state.status, 'pending_sync', name);
    assert.equal(state.rewardToken ?? null, null, name);
    assert.equal(state.countryCode, 'ES');
    assert.equal(state.termsAccepted, true);
    assert.equal(storage.data.get(REWARDS_INTEREST_STATE_KEY).status, 'pending_sync');
  }
});

test('a pending registration can be retried and then becomes active', async () => {
  let online = false;
  const { service, requests } = create({ fetchFn: () => (online ? json(active) : json({}, 500)) });
  assert.equal((await service.register('ES', { termsAccepted: true })).status, 'pending_sync');
  online = true;
  const retried = await service.register('ES', { termsAccepted: true });
  assert.equal(retried.status, 'active');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].body.anonymous_id, requests[1].body.anonymous_id, 'The retry reuses the same anonymous id');
});

test('cancelling stops the request and writes nothing', async () => {
  let seenSignal;
  const { service, storage } = create({ fetchFn: (_url, init) => new Promise((_, reject) => {
    seenSignal = init.signal;
    init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  }) });
  const controller = new AbortController();
  const pending = service.register('ES', { termsAccepted: true, signal: controller.signal });
  await tick(10);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(seenSignal.aborted, true, 'The HTTP request itself is aborted');
  assert.equal(storage.data.has(REWARDS_INTEREST_STATE_KEY), false, 'A cancelled registration does not become pending');
  assert.equal(service.registrationPromise, null, 'The service can register again');
});

test('a response that arrives after cancelling is ignored', async () => {
  const controller = new AbortController();
  const { service, storage } = create({ fetchFn: async () => { controller.abort(); return json(active); } });
  await assert.rejects(service.register('ES', { termsAccepted: true, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(storage.data.has(REWARDS_INTEREST_STATE_KEY), false);
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(create({ fetchFn: () => json(active) }).service.register('ES', { termsAccepted: true, signal: aborted.signal }), { name: 'AbortError' });
});

test('invalid input is rejected with a code and never reaches the network', async () => {
  const { service, requests } = create({ fetchFn: () => json(active) });
  await assert.rejects(service.register('ZZ', { termsAccepted: true }), error => error instanceof RewardsError && error.code === 'invalid-country');
  await assert.rejects(service.register('ES', { termsAccepted: false }), error => error.code === 'terms-required');
  await assert.rejects(service.register('', { termsAccepted: true }), error => error.code === 'invalid-country');
  assert.equal(requests.length, 0);
  const bad = new RewardsInterestService({ baseUrl: 'https://ads.test', storage: memoryStorage(), idFactory: () => 'not-a-uuid', fetchFn: async () => json(active) });
  await assert.rejects(bad.register('ES', { termsAccepted: true }), error => error.code === 'id');
});

test('the anonymous id is created once and reused', async () => {
  const storage = memoryStorage();
  let created = 0;
  const service = new RewardsInterestService({ baseUrl: 'https://ads.test', storage, idFactory: () => { created += 1; return UUID; }, fetchFn: async () => json({}, 500) });
  await service.register('ES', { termsAccepted: true });
  await service.register('MX', { termsAccepted: true });
  assert.equal(created, 1);
});

const activeState = { countryCode: 'ES', status: 'active', rewardToken: 'token-123', payoutDestinationSet: false, termsAccepted: true };

test('the payout destination is saved with the server token and marks the state', async () => {
  const storage = memoryStorage({ [REWARDS_INTEREST_STATE_KEY]: activeState });
  const { service, requests } = create({ storage, fetchFn: () => new Response(null, { status: 204 }) });
  const state = await service.setPayoutDestination('  juky:abc  ');
  assert.equal(state.payoutDestinationSet, true);
  assert.equal(requests[0].init.method, 'PUT');
  assert.equal(requests[0].init.headers['X-Wallet-Token'], 'token-123');
  assert.deepEqual(requests[0].body, { destination: 'juky:abc' });
  assert.equal(storage.data.get(REWARDS_INTEREST_STATE_KEY).payoutDestinationSet, true);
});

test('payout failures are classified, keep the state and can be retried', async () => {
  const storage = memoryStorage({ [REWARDS_INTEREST_STATE_KEY]: activeState });
  const failures = [
    [() => new Response(null, { status: 500 }), 'payout-failed'],
    [() => { throw new TypeError('NetworkError'); }, 'network'],
    [(_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))), 'timeout'],
  ];
  for (const [fetchFn, code] of failures) {
    const { service } = create({ storage, fetchFn, timeout: 40 });
    await assert.rejects(service.setPayoutDestination('juky:abc'), error => error.code === code, code);
    assert.equal(storage.data.get(REWARDS_INTEREST_STATE_KEY).payoutDestinationSet, false);
  }
  const { service } = create({ storage, fetchFn: () => new Response(null, { status: 200 }) });
  assert.equal((await service.setPayoutDestination('juky:abc')).payoutDestinationSet, true);
});

test('a payout needs an active registration and a plausible destination, and can be cancelled', async () => {
  const pendingStorage = memoryStorage({ [REWARDS_INTEREST_STATE_KEY]: { countryCode: 'ES', status: 'pending_sync' } });
  const noToken = create({ storage: pendingStorage, fetchFn: () => new Response(null, { status: 200 }) });
  await assert.rejects(noToken.service.setPayoutDestination('juky:abc'), error => error.code === 'invalid-destination');
  assert.equal(noToken.requests.length, 0);
  const storage = memoryStorage({ [REWARDS_INTEREST_STATE_KEY]: activeState });
  const short = create({ storage, fetchFn: () => new Response(null, { status: 200 }) });
  await assert.rejects(short.service.setPayoutDestination('ab'), error => error.code === 'invalid-destination');
  const controller = new AbortController();
  const slow = create({ storage, fetchFn: (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))) });
  const pending = slow.service.setPayoutDestination('juky:abc', { signal: controller.signal });
  await tick(10);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(storage.data.get(REWARDS_INTEREST_STATE_KEY).payoutDestinationSet, false);
});
