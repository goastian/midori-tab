import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePrivacyStats } from '../../src/services/privacyStats.js';
import { BASE_TAB_SETTINGS, readStorage, sleep, waitUntil } from './remote-fixture.mjs';

const text = (page, selector) => page.evaluate(query => document.querySelector(query)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);

const formatCompact = value => (value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}K` : String(value));

async function reachable(url) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(8000) })).ok; } catch { return false; }
}

async function openWithSettings(session, { widgets, storage = {} }) {
  const prepare = await session.context.newPage();
  await prepare.goto(session.url);
  await prepare.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
  await prepare.evaluate(async ({ enabled, tab, values }) => {
    const api = globalThis.browser || globalThis.chrome;
    localStorage.setItem('tabStore', JSON.stringify(tab));
    localStorage.setItem('widgetsStore', JSON.stringify({ enabled: Object.fromEntries(['search', ...enabled].map(key => [key, true])), order: ['search', ...enabled] }));
    localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
    for (const [key, value] of Object.entries(values)) {
      const payload = { __midoriStorageVersion: 1, value, updatedAt: Date.now() };
      localStorage.setItem(key, JSON.stringify(payload));
      await api.storage.local.set({ [key]: payload });
    }
  }, { enabled: widgets, tab: { ...BASE_TAB_SETTINGS, background: { type: 'Solid', default: false, color: '#10201b' } }, values: storage });
  await prepare.close();
  const page = await session.context.newPage();
  page.errors = [];
  page.on('pageerror', error => { if (!/after context unloaded/.test(error.message)) page.errors.push(String(error.message || error)); });
  await page.goto(session.url);
  await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
  return page;
}

/** The installed package, with its real host bridge and its real network: Privacy and open.er-api.com. */
export async function runRealPackageIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const report = { passed: false, cases: [] };
  const record = (id, evidence = {}) => report.cases.push({ id, status: 'passed', ...evidence });
  const { openContextWithRetry, closeContext, parseOptions } = await import('../../scripts/measure-newtab.mjs');
  const session = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', extensionPath, '--smoke', '--reps', '1']));
  try {
    assert.equal(session.metadata.fullExtensionInstalled, true, 'The complete package, with its host API, must be installed');

    // Privacy: whichever provider the host offers, the widget shows exactly its figures, and "rate" only with a denominator.
    let page = await openWithSettings(session, { widgets: ['privacy'] });
    const providers = async () => page.evaluate(async () => {
      const api = globalThis.browser;
      const message = { action: 'get-stats-summary', schemaVersion: 2 };
      const ask = async (...args) => { try { return await api.runtime.sendMessage(...args); } catch (error) { return { error: String(error.message || error) }; } };
      return { native: await ask(message),
        companion: await ask('midori-protection@astian.org', message),
        legacy: await ask('pimgloaejdgobcgjahbgippfilfdpcfa', message) };
    });
    await page.waitForFunction(() => document.querySelector('.privacy-widget') && !document.querySelector('.pw-badge--loading'), null, { timeout: 20_000 });
    const before = await providers();
    const isReport = response => response && typeof response === 'object' && !response.error && 'totalBlocked' in response;
    const order = ['native', 'companion', 'legacy'];
    const answering = order.find(name => isReport(before[name])) || null;
    const nativeBridge = isReport(before.native) ? 'answers' : `does not answer (${JSON.stringify(before.native)})`;
    if (answering) {
      const expected = normalizePrivacyStats(before[answering]);
      const after = await providers();
      const alsoExpected = normalizePrivacyStats(after[answering] || before[answering]);
      const tiles = await page.evaluate(() => [...document.querySelectorAll('.pw-stat-value')].map(node => node.textContent.replace(/\s+/g, ' ').trim()));
      const tileFor = stats => [formatCompact(stats.totalBlocked),
        stats.totalRequests === null ? null : formatCompact(stats.totalRequests),
        stats.blockRate === null ? null : (stats.blockRate >= 10 ? `${Math.round(stats.blockRate)}%` : `${stats.blockRate.toFixed(1)}%`),
        formatCompact(stats.pageBlocked)];
      for (const [index, value] of tiles.entries()) {
        const candidates = [expected, alsoExpected].map(stats => tileFor(stats)[index]);
        if (candidates.every(candidate => candidate === null)) assert.match(value, /^— ?Not available$/, `Tile ${index} has no data and must say so, not show a number: ${value}`);
        else assert.ok(candidates.includes(value), `Tile ${index} shows ${value}, the ${answering} provider reported ${candidates}`);
      }
      assert.equal(await text(page, '.pw-badge'), expected.enabled ? 'On' : 'Off');
      if (expected.blockRate === null) assert.match(tiles[2], /^— ?Not available$/, 'A rate without a denominator is shown as unavailable');
      record('nt18-host-privacy-bridge-and-fallback', { answering, nativeBridge, response: before[answering], tiles });
    } else {
      assert.equal(await text(page, '.pw-empty-text'), 'Midori Privacy is not installed or not responding.');
      assert.equal(await page.evaluate(() => Boolean(document.querySelector('.pw-stat'))), false, 'No figures are invented without a provider');
      record('nt18-host-without-provider-shows-unavailable', { nativeBridge, before });
    }
    assert.deepEqual(page.errors, []);
    await page.close();

    // open.er-api.com from the real package: permissions and CORS.
    if (!await reachable('https://open.er-api.com/v6/latest/USD')) {
      report.cases.push({ id: 'nt16-open-er-api-cors-in-real-package', status: 'skipped', reason: 'open.er-api.com is not reachable from this machine' });
    } else {
      page = await openWithSettings(session, { widgets: ['currency'], storage: { midori_currency_settings_v1: { from: 'USD', to: 'EUR', amountInput: '10' } } });
      const direct = await page.evaluate(async () => {
        try {
          const response = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'reload' });
          const payload = await response.json();
          return { ok: response.ok, result: payload.result, eur: payload.rates?.EUR, origin: location.origin };
        } catch (error) { return { error: `${error.name}: ${error.message}`, origin: location.origin }; }
      });
      assert.equal(direct.error, undefined, `The extension page must be allowed to read open.er-api.com (${direct.error})`);
      assert.equal(direct.ok, true);
      assert.equal(direct.result, 'success');
      assert.equal(typeof direct.eur, 'number');
      assert.match(direct.origin, /^moz-extension:/);
      const startedAt = Date.now();
      let retried = false;
      await waitUntil(async () => {
        // The provider is a public service: one explicit refresh is allowed if its first answer was lost.
        if (!retried && Date.now() - startedAt > 12_000 && await text(page, '.currency-status')) {
          retried = true;
          await page.click('.currency-refresh');
        }
        return /^€\d/.test(await text(page, '.currency-value') || '');
      },
        async () => `The Currency widget must show a live conversion from the real provider (value ${await text(page, '.currency-value')}, status ${await text(page, '.currency-status')})`, 30_000);
      await sleep(page, 400);
      assert.equal(await text(page, '.currency-status'), '', 'No error or stale notice after a live conversion');
      await waitUntil(async () => Boolean((await readStorage(page, 'midori_currency_cache_v1'))?.USD?.data?.providerTime), 'The live rates are saved as a snapshot', 8000);
      assert.deepEqual(page.errors, []);
      record('nt16-open-er-api-cors-in-real-package', { origin: direct.origin, eurRate: direct.eur, value: await text(page, '.currency-value') });
      await page.close();
    }
    report.passed = true;
    return report;
  } finally {
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'real-package.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    await closeContext(session);
  }
}
