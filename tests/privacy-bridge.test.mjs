import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

let instance = 0;
const calls = [];

function installRuntime(handler) {
  calls.length = 0;
  globalThis.browser = { runtime: {
    getURL: () => 'moz-extension://midori-tab/',
    sendMessage: (first, second) => {
      const external = typeof first === 'string';
      calls.push({ target: external ? first : 'self', message: external ? second : first });
      return handler({ target: external ? first : 'self', message: external ? second : first });
    },
  } };
}

const load = () => import(`../src/services/privacyStats.js?instance=${++instance}`);
const summary = overrides => ({ totalBlocked: 120, totalRequests: 1000, pageBlocked: 4, pageRequests: 40, enabled: true, state: 'ready',
  categories: { scripts: 80, images: 40 }, ...overrides });

beforeEach(() => { delete globalThis.chrome; });

test('the native Midori bridge answers first and asks for the v2 summary', async () => {
  installRuntime(({ target }) => Promise.resolve(target === 'self' ? summary() : null));
  const { requestPrivacyStats } = await load();
  const response = await requestPrivacyStats();
  assert.equal(response.totalBlocked, 120);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].message, { action: 'get-stats-summary', schemaVersion: 2 });
});

test('an empty answer from the host falls back to the companion extensions in order', async () => {
  installRuntime(({ target }) => Promise.resolve(target === 'self' ? {} : target === 'pimgloaejdgobcgjahbgippfilfdpcfa' ? summary({ totalBlocked: 7 }) : null));
  const { requestPrivacyStats } = await load();
  const response = await requestPrivacyStats();
  assert.equal(response.totalBlocked, 7);
  assert.deepEqual(calls.map(call => call.target), ['self', 'midori-protection@astian.org', 'pimgloaejdgobcgjahbgippfilfdpcfa']);
  await requestPrivacyStats();
  assert.equal(calls.at(-2).target, 'self');
  assert.equal(calls.at(-1).target, 'pimgloaejdgobcgjahbgippfilfdpcfa', 'The working companion is remembered');
});

test('a provider that fails, errors, or answers with something that is not a report yields null', async () => {
  for (const handler of [
    () => Promise.reject(new Error('Extension context invalidated')),
    () => Promise.resolve({ error: 'boom' }),
    () => Promise.resolve({}),
    () => Promise.resolve('ok'),
    () => Promise.resolve({ totalBlocked: 3, error: 'partial' }),
    () => { throw new Error('sync failure'); },
  ]) {
    installRuntime(handler);
    const { requestPrivacyStats } = await load();
    assert.equal(await requestPrivacyStats(), null);
  }
});

test('a companion answering with an empty object is not accepted as a report', async () => {
  installRuntime(() => Promise.resolve({}));
  const { requestPrivacyStats, normalizePrivacyStats } = await load();
  assert.equal(await requestPrivacyStats(), null);
  assert.equal(normalizePrivacyStats({}), null, 'No blocked total means no figures at all');
});

test('a provider that never answers does not leave the widget waiting', async () => {
  installRuntime(({ target }) => (target === 'self' ? new Promise(() => {}) : Promise.resolve(summary({ totalBlocked: 9 }))));
  const { requestPrivacyStats } = await load();
  const started = Date.now();
  const response = await requestPrivacyStats({ timeoutMs: 30 });
  assert.equal(response.totalBlocked, 9, 'The next provider is tried after the timeout');
  assert.ok(Date.now() - started < 1000);
  installRuntime(() => new Promise(() => {}));
  const { requestPrivacyStats: again } = await load();
  assert.equal(await again({ timeoutMs: 20 }), null);
});

test('the block rate is unavailable, not zero, when there is no denominator', async () => {
  const { normalizePrivacyStats } = await load();
  for (const data of [
    summary({ totalRequests: undefined }),
    summary({ totalRequests: null }),
    summary({ totalRequests: 0 }),
    summary({ totalRequests: 50 }),
    summary({ capabilities: { requestCounts: false } }),
    summary({ totalRequests: 'many' }),
  ]) {
    const stats = normalizePrivacyStats(data);
    assert.equal(stats.blockRate, null, JSON.stringify(data));
    assert.equal(stats.totalBlocked, 120, 'The blocked total is still reported');
    assert.equal(stats.totalRequests, null, 'Requests are unavailable too');
  }
  const idle = normalizePrivacyStats({ totalBlocked: 0, totalRequests: 0 });
  assert.equal(idle.totalRequests, 0, 'A real zero is a figure');
  assert.equal(idle.blockRate, null, 'but a rate over zero requests is not');
  const stats = normalizePrivacyStats(summary());
  assert.equal(stats.blockRate, 12);
  assert.equal(stats.totalRequests, 1000);
});

test('invalid blocked totals are rejected instead of shown as zero', async () => {
  const { normalizePrivacyStats } = await load();
  for (const totalBlocked of [null, undefined, '', 'abc', -5, NaN, Infinity]) {
    assert.equal(normalizePrivacyStats({ totalBlocked, totalRequests: 100 }), null, String(totalBlocked));
  }
  assert.equal(normalizePrivacyStats(null), null);
  assert.equal(normalizePrivacyStats('x'), null);
  assert.equal(normalizePrivacyStats({ totalBlocked: 0, totalRequests: 100 }).totalBlocked, 0, 'A real zero is kept');
});

test('page figures and categories are normalised and optional capabilities are respected', async () => {
  const { normalizePrivacyStats } = await load();
  const stats = normalizePrivacyStats(summary({ pageRequests: undefined, categories: { scripts: -3, frames: 'x', xhr: 5.9 }, enabled: false, state: 'LOADING' }));
  assert.equal(stats.pageRequests, null);
  assert.deepEqual(stats.categories, { scripts: 0, frames: 0, xhr: 5, images: 0, media: 0, fonts: 0, other: 0 });
  assert.equal(stats.enabled, false);
  assert.equal(stats.state, 'loading');
  assert.equal(normalizePrivacyStats(summary({ capabilities: { pageRequestCounts: false } })).pageRequests, null);
});

test('companion candidates follow the browser family', async () => {
  const { getPrivacyExtensionCandidates } = await load();
  assert.deepEqual(getPrivacyExtensionCandidates('moz-extension:'), ['midori-protection@astian.org', 'pimgloaejdgobcgjahbgippfilfdpcfa']);
  assert.deepEqual(getPrivacyExtensionCandidates('chrome-extension:'), ['pimgloaejdgobcgjahbgippfilfdpcfa', 'midori-protection@astian.org']);
});
