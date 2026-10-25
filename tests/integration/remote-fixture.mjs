import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturePng } from './startup-visual.mjs';

/** Hosts the New Tab talks to. Only the origin changes in the isolated copy; paths, headers and code stay production. */
const HOSTS = {
  'https://api.open-meteo.com': 'weather',
  'https://geocoding-api.open-meteo.com': 'geocoding',
  'https://open.er-api.com': 'currency',
  'https://api.freenewsapi.io': 'news',
  'https://ipwho.is': 'ipwho',
  'https://nominatim.openstreetmap.org': 'nominatim',
  'https://ads.astian.org': '',
  'https://icons.duckduckgo.com': 'icons',
  'https://api.github.com': 'github',
};

const RATES = {
  USD: { USD: 1, EUR: 0.9, JPY: 150, GBP: 0.8 },
  EUR: { EUR: 1, USD: 1.25, JPY: 170, GBP: 0.88 },
};

const CITIES = { Alpha: [10, 10], Beta: [20, 20] };

export const WEATHER_TEMPERATURE = { celsius: 21, fahrenheit: 70 };

function article(index, prefix, base) {
  return { uuid: `${prefix}-${index}`, title: `${prefix} story ${index}`, description: `Summary ${index}`, publisher: 'Fixture News',
    published_at: '2026-10-24T10:00:00Z', original_url: `https://news.example/${prefix}/${index}`,
    topics: ['world'], thumbnail: `${base}/thumb.png` };
}

/**
 * Local stand-in for every remote service. Each service can be told to misbehave:
 * `fixture.rule('currency', { mode: 'hang' })`, modes ok | status | drop | hang | delay, optionally limited with `times`.
 */
export async function startRemoteFixture() {
  const rules = new Map();
  const log = [];
  const png = readFileSync(new URL('../../public/icons/48.png', import.meta.url));
  const state = { inflight: 0, peak: 0, decision: 0 };
  let base;

  function nextRule(service) {
    const rule = rules.get(service);
    if (!rule) return { mode: 'ok' };
    if (rule.times !== undefined && --rule.times <= 0) rules.delete(service);
    return rule;
  }

  function body(service, url, request) {
    const params = url.searchParams;
    const path = url.pathname;
    if (service === 'weather') {
      const unit = params.get('temperature_unit') === 'fahrenheit' ? 'fahrenheit' : 'celsius';
      const temperature = WEATHER_TEMPERATURE[unit] + Math.round(Number(params.get('latitude')) || 0);
      return { current: { temperature_2m: temperature, weather_code: 0, wind_speed_10m: 9 },
        daily: { temperature_2m_max: [temperature + 3], temperature_2m_min: [temperature - 4], weather_code: [1] }, timezone: 'UTC' };
    }
    if (service === 'geocoding') {
      const name = params.get('name');
      const [latitude, longitude] = CITIES[name] || [30, 30];
      return { results: name === 'Nowhere' ? [] : [{ name, latitude, longitude, country: 'Fixture' }] };
    }
    if (service === 'ipwho') return { success: true, latitude: 10, longitude: 10, city: 'Alpha', country: 'Fixture' };
    if (service === 'nominatim') return { address: { city: 'Alpha', country: 'Fixture' } };
    if (service === 'currency') {
      const code = path.split('/').pop();
      return { result: 'success', base_code: code, rates: RATES[code] || RATES.USD, time_last_update_utc: 'Sat, 24 Oct 2026 00:00:00 +0000' };
    }
    if (service === 'news') {
      if (path.endsWith('/details')) return { data: article(0, params.get('uuid') || 'detail', base) };
      const prefix = (params.get('country') || 'ALL').toUpperCase();
      return { data: Array.from({ length: 200 }, (_, index) => article(index, prefix, base)),
        meta: { has_more: true, next_cursor: 'cursor', returned: 200 } };
    }
    if (service === 'ads' && path === '/api/v1/ads/newtab') {
      state.decision += 1;
      return { contract_version: 'ads-channel-v1', format_id: 'newtab_icon_v1', channel: 'midori_tab', placement: 'new_tab',
        ad_id: 42, title: 'Integration sponsor', icon_url: `${base}/sponsor.png`, image_url: `${base}/sponsor.png`,
        destination_url: `${base}/api/v1/ads/click/fixture`, impression_token: `impression-${state.decision}`,
        attribution_token: `attribution-${state.decision}`, opportunity_id: `opportunity-${state.decision}`,
        request_id: `request-${state.decision}`, decision_id: `decision-${state.decision}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600, disclosure_required: true, sponsor_label: 'Sponsored',
        billing: { model: 'vcpm', funding_type: 'prepaid', amount_micros: 1_000_000, currency: 'USD' },
        transparency: { data_used: ['language'], frequency_cap_per_day: 3, feedback_enabled: true } };
    }
    if (service === 'ads' && path === '/api/v1/public/viewer-rewards-interest') return { status: 'active', reward_token: 'fixture-token' };
    return request.method === 'GET' ? {} : null;
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://fixture.local');
    const [, first, ...tail] = url.pathname.split('/');
    // The Ads and Rewards API live at the origin root: its contract requires assets and click URLs there.
    const service = first === 'api' ? 'ads' : first;
    const rest = first === 'api' ? ['api', ...tail] : tail;
    const entry = { service, method: request.method, path: `/${rest.join('/')}`, search: url.search, at: Date.now(),
      abortedAt: null, doneAt: null, rule: null, body: null };
    log.push(entry);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString();
    try { entry.body = text ? JSON.parse(text) : null; } catch { entry.body = text; }
    // Images that the page loads by itself are not remote tasks of the queue.
    const counted = url.pathname !== '/thumb.png' && url.pathname !== '/sponsor.png';
    if (counted) {
      state.inflight += 1;
      state.peak = Math.max(state.peak, state.inflight);
    }
    let finished = false;
    const finish = () => { if (finished || !counted) return; finished = true; state.inflight -= 1; };
    response.on('close', () => { if (!entry.doneAt) entry.abortedAt = Date.now(); finish(); });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); entry.doneAt = Date.now(); return; }
    const rule = nextRule(service === 'ads' && url.pathname.includes('viewer-rewards-payout') ? 'rewardsPayout'
      : service === 'ads' && url.pathname.includes('viewer-rewards-interest') ? 'rewardsInterest' : service);
    entry.rule = rule.mode;
    if (rule.mode === 'drop') { request.socket.destroy(); return; }
    if (rule.mode === 'hang') return;
    if (rule.mode === 'delay') await new Promise(resolve => setTimeout(resolve, rule.delayMs));
    if (response.destroyed) return;
    const complete = (status, type, payload) => { response.writeHead(status, { 'Content-Type': type }); response.end(payload); entry.doneAt = Date.now(); };
    if (rule.mode === 'status') { complete(rule.status || 500, 'application/json', '{"error":"fixture"}'); return; }
    if (service === 'icons') { complete(200, 'image/png', png); return; }
    if (service === 'github') { complete(404, 'application/json', '{}'); return; }
    if (service === 'asset') {
      const name = rest.filter(part => part !== 'download' && part !== 'api' && part !== 'v1' && part !== 'assets').pop() || 'a';
      complete(200, 'image/png', fixturePng(rule.tint || ASSET_TINTS[name] || [120, 120, 120]));
      return;
    }
    if (service === 'img') { complete(200, 'image/png', fixturePng(IMG_TINTS[rest[0]?.replace('.png', '')] || [120, 120, 120])); return; }
    if (url.pathname === '/thumb.png') { complete(200, 'image/png', png); return; }
    if (service === 'ads' && url.pathname.includes('viewer-rewards-payout')) { complete(204, 'application/json', ''); return; }
    if (service === 'ads' && url.pathname.includes('/click/')) { complete(200, 'text/plain', 'ok'); return; }
    if (url.pathname === '/sponsor.png') { complete(200, 'image/png', png); return; }
    const payload = body(service, url, request);
    complete(200, 'application/json', payload === null ? '' : JSON.stringify(payload));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;

  return {
    base, log, state,
    rule(service, rule) { rules.set(service, { ...rule }); },
    clearRules() { rules.clear(); },
    requests(service, since = 0) { return log.filter(entry => entry.service === service && entry.at >= since); },
    resetPeak() { state.peak = state.inflight; },
    async close() {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    },
    /** Copy of the extension whose remote origins point at this fixture. */
    prepareExtension(extensionPath, { extraScripts = [] } = {}) {
      const directory = mkdtempSync(join(tmpdir(), 'midori-remote-fixture-'));
      cpSync(extensionPath, directory, { recursive: true });
      const touched = [];
      for (const relative of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js'))) {
        const path = join(directory, relative);
        let source = readFileSync(path, 'utf8');
        let changed = false;
        for (const [origin, service] of Object.entries(HOSTS)) {
          if (!source.includes(origin)) continue;
          source = source.replaceAll(origin, service ? `${base}/${service}` : base);
          changed = true;
        }
        // A build without the key (CI) still has to exercise the real news widget.
        const unconfigured = source.replace(/isConfigured\(\)\{return Boolean\(this\.apiKey\)&&/, 'isConfigured(){return ');
        if (unconfigured !== source) { source = unconfigured; changed = true; }
        if (changed) { writeFileSync(path, source); touched.push(relative); }
      }
      assert.ok(touched.some(file => /RewardsPreliminaryModal/.test(file)), 'The Rewards endpoint must be configurable in the isolated copy');
      assert.ok(touched.some(file => /RssWidget/.test(file)), 'The news endpoint must be configurable in the isolated copy');
      const html = join(directory, 'index.html');
      const tags = ['/integration-remote-init.js', ...extraScripts].map(src => `<script src="${src}"></script>`).join('');
      writeFileSync(html, readFileSync(html, 'utf8').replace(/<head>/i, `<head>${tags}`));
      writeFileSync(join(directory, 'integration-blank.html'), '<!doctype html><meta charset="utf-8"><title>blank</title>');
      writeFileSync(join(directory, 'integration-remote-init.js'), `(${installPageControls.toString()})();\n`);
      return { directory, touched, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
    },
  };
}

const ASSET_TINTS = { a: [214, 80, 80], b: [60, 110, 220], c: [60, 190, 90] };
const IMG_TINTS = { green: [214, 239, 187], blue: [177, 211, 242] };

/** Runs in the New Tab before any application code. Flags live in localStorage so a test can change them between pages. */
function installPageControls() {
  const flags = () => { try { return JSON.parse(localStorage.getItem('__integration_flags') || '{}'); } catch { return {}; } };
  if (flags().saveData) Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  const live = window.__integrationBlobs = new Set();
  const create = URL.createObjectURL.bind(URL);
  const revoke = URL.revokeObjectURL.bind(URL);
  window.__integrationBlobLog = [];
  URL.createObjectURL = object => {
    const url = create(object);
    live.add(url);
    window.__integrationBlobLog.push({ event: 'create', size: object?.size ?? null, url });
    return url;
  };
  URL.revokeObjectURL = url => {
    live.delete(url);
    window.__integrationBlobLog.push({ event: 'revoke', url });
    return revoke(url);
  };
  const runtime = globalThis.browser?.runtime;
  const send = runtime?.sendMessage?.bind(runtime);
  if (!send) return;
  runtime.sendMessage = (...args) => {
    const mode = flags().privacy;
    if (!mode || !args.some(argument => argument?.action === 'get-stats-summary')) return send(...args);
    window.__integrationPrivacyCalls = (window.__integrationPrivacyCalls || 0) + 1;
    if (mode === 'fail') return Promise.reject(new Error('Extension context invalidated'));
    if (mode === 'empty') return Promise.resolve({});
    if (mode === 'hang') return new Promise(() => {});
    if (mode === 'noDenominator') {
      return Promise.resolve({ totalBlocked: 321, pageBlocked: 5, categories: { scripts: 300, images: 21 },
        capabilities: { requestCounts: false, pageRequestCounts: false }, enabled: true, state: 'ready' });
    }
    if (mode === 'full') {
      return Promise.resolve({ totalBlocked: 120, totalRequests: 1000, pageBlocked: 4, pageRequests: 40, enabled: true, state: 'ready',
        categories: { scripts: 80, images: 40 } });
    }
    return send(...args);
  };
}

export const sleep = (page, ms) => page.evaluate(delay => new Promise(resolve => setTimeout(resolve, delay)), ms);

export async function waitUntil(predicate, message, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  assert.fail(typeof message === 'function' ? await message() : message);
}

/** Writes values the way StorageService does, in the mirror and in extension storage. */
export async function seedStorage(page, values) {
  await page.evaluate(async entries => {
    const api = globalThis.browser || globalThis.chrome;
    const payload = {};
    for (const [key, value] of Object.entries(entries)) {
      payload[key] = { __midoriStorageVersion: 1, value, updatedAt: Date.now(), origin: 'integration-seed' };
      localStorage.setItem(key, JSON.stringify(payload[key]));
    }
    await api.storage.local.set(payload);
  }, values);
}

export async function readStorage(page, key) {
  return page.evaluate(async name => {
    const api = globalThis.browser || globalThis.chrome;
    const stored = (await api.storage.local.get(name))[name];
    const mirror = (() => { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } })();
    const newest = [stored, mirror].filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    return newest?.value ?? null;
  }, key);
}

export const BASE_TAB_SETTINGS = { theme: 'dark', autoTheme: false, density: 'comfortable', showAds: false, showSpeedDials: true,
  speedDialSize: 'tiny', speedDialColumns: 7, speedDialLimit: 8, showAddSpeedDialButton: true, widgetsEnabled: true,
  widgetColumns: 3, openLink: 'Self Tab', background: { type: 'Solid', default: false, color: '#10201b' } };

/** Leaves the profile empty except for the given New Tab configuration. */
export async function configureProfile(session, { widgets = [], tab = {}, storage = {}, flags = {} } = {}) {
  const page = await session.context.newPage();
  try {
    // A document of the extension without the application: nothing is requested while the profile is rewritten.
    await page.goto(new URL('/integration-blank.html', session.url).href);
    await page.evaluate(async () => {
      localStorage.clear();
      await (globalThis.browser || globalThis.chrome).storage.local.clear();
      for (const name of await caches.keys()) await caches.delete(name);
    });
    await page.evaluate(({ widgets: enabled, tab: tabSettings, flags: pageFlags }) => {
      localStorage.setItem('tabStore', JSON.stringify(tabSettings));
      localStorage.setItem('widgetsStore', JSON.stringify({ enabled: Object.fromEntries(['search', ...enabled].map(key => [key, true])),
        order: ['search', ...enabled] }));
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
      localStorage.setItem('__integration_flags', JSON.stringify(pageFlags));
    }, { widgets, tab: { ...BASE_TAB_SETTINGS, ...tab }, flags });
    if (Object.keys(storage).length) await seedStorage(page, storage);
  } finally { await page.close(); }
}

/** Opens a New Tab and waits for the interaction barrier. Page errors are collected on `page.errors`. */
export async function openNewTab(session, { until } = {}) {
  const page = await session.context.newPage();
  page.errors = [];
  // Requests of a page that was just closed report their cancellation to whichever page is evaluated next.
  page.on('pageerror', error => { if (!/after context unloaded/.test(error.message)) page.errors.push(String(error.message || error)); });
  await page.goto(session.url);
  await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
  page.interactionEpoch = await page.evaluate(() => performance.timeOrigin + window.__midoriPerf.marks['interaction-ready']);
  if (until) await page.waitForFunction(until, null, { timeout: 20_000 });
  return page;
}

/** Covers the New Tab with another real tab, runs `window.__hiddenSample()` while hidden, then returns to it. */
export async function hideAndReturn(page, { hiddenMs = 700 } = {}) {
  return page.evaluate(async ({ hiddenMs: wait }) => {
    const api = globalThis.browser || globalThis.chrome;
    const measured = await api.tabs.getCurrent();
    const waitFor = state => new Promise((resolve, reject) => {
      if (document.visibilityState === state) { resolve(); return; }
      const timeout = setTimeout(() => { document.removeEventListener('visibilitychange', changed); reject(new Error(`The tab did not become ${state}`)); }, 8000);
      function changed() {
        if (document.visibilityState !== state) return;
        clearTimeout(timeout);
        document.removeEventListener('visibilitychange', changed);
        resolve();
      }
      document.addEventListener('visibilitychange', changed);
    });
    const read = () => window.__hiddenSample?.() ?? null;
    const covering = await api.tabs.create({ windowId: measured.windowId, url: 'about:blank', active: true });
    try {
      await waitFor('hidden');
      const hiddenAt = Date.now();
      await new Promise(resolve => setTimeout(resolve, wait));
      const whileHidden = read();
      await api.tabs.update(measured.id, { active: true });
      await waitFor('visible');
      return { hiddenAt, visibleAt: Date.now(), whileHidden };
    } finally { await api.tabs.remove(covering.id); }
  }, { hiddenMs });
}

/** Records, every frame, the box of each selector so a test can prove nothing moved while content loaded or came back. */
export async function trackBoxes(page, selectors) {
  await page.evaluate(list => {
    const ranges = window.__boxRanges = Object.fromEntries(list.map(selector => [selector, { frames: 0, minHeight: Infinity, maxHeight: -Infinity,
      minTop: Infinity, maxTop: -Infinity, minLeft: Infinity, maxLeft: -Infinity }]));
    window.__boxTracking = true;
    (function frame() {
      if (!window.__boxTracking) return;
      for (const selector of list) {
        const element = document.querySelector(selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const range = ranges[selector];
        range.frames += 1;
        range.minHeight = Math.min(range.minHeight, rect.height); range.maxHeight = Math.max(range.maxHeight, rect.height);
        range.minTop = Math.min(range.minTop, rect.top); range.maxTop = Math.max(range.maxTop, rect.top);
        range.minLeft = Math.min(range.minLeft, rect.left); range.maxLeft = Math.max(range.maxLeft, rect.left);
      }
      requestAnimationFrame(frame);
    })();
  }, selectors);
}

export async function stopTracking(page) {
  return page.evaluate(() => { window.__boxTracking = false; return window.__boxRanges; });
}
