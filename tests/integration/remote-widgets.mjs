import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureProfile, hideAndReturn, openNewTab, readStorage, sleep, startRemoteFixture, stopTracking, trackBoxes, waitUntil } from './remote-fixture.mjs';

const HOUR = 60 * 60 * 1000;
const text = (page, selector) => page.evaluate(query => document.querySelector(query)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);
const exists = (page, selector) => page.evaluate(query => Boolean(document.querySelector(query)), selector);
const waitText = async (page, selector, predicate, label, timeout = 15_000) => {
  let last = null;
  await waitUntil(async () => {
    last = await text(page, selector);
    return last !== null && predicate(last);
  }, () => `${label}: ${selector} was ${JSON.stringify(last)}`, timeout);
};

/** Gecko replays a request when the connection is reset, so one application attempt can be several hits. */
const attemptsOf = (entries, gapMs = 400) => entries.reduce((count, entry, index) => (
  index === 0 || entry.at - entries[index - 1].at > gapMs ? count + 1 : count), 0);

const WEATHER_SETTINGS = { midori_weather_settings_v1: { unit: 'metric', latitude: 10, longitude: 10, locationLabel: 'Alpha, Fixture', locationSource: 'manual' } };
const CURRENCY_SETTINGS = { midori_currency_settings_v1: { from: 'USD', to: 'EUR', amountInput: '10' } };
const setSelect = (page, selector, value) => page.evaluate(({ query, next }) => {
  const select = document.querySelector(query);
  select.value = next;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}, { query: selector, next: value });

/** Moves the saved snapshots back in time, in the mirror and in extension storage. */
async function ageSnapshots(page, key, ageMs) {
  await page.evaluate(async ({ name, age }) => {
    const api = globalThis.browser || globalThis.chrome;
    const stored = (await api.storage.local.get(name))[name];
    const mirror = (() => { try { return JSON.parse(localStorage.getItem(name)); } catch { return null; } })();
    const payload = [stored, mirror].filter(Boolean).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
    if (!payload) throw new Error(`No snapshot saved under ${name}`);
    const before = Date.now() - age;
    for (const entry of Object.values(payload.value)) {
      entry.timestamp = before;
      if (entry.data?.fetchedAt) entry.data.fetchedAt = new Date(before).toISOString();
    }
    payload.updatedAt = Date.now() + 1;
    await api.storage.local.set({ [name]: payload });
    localStorage.setItem(name, JSON.stringify(payload));
  }, { name: key, age: ageMs });
}

async function whenPersisted(page, key) {
  await waitUntil(async () => (await readStorage(page, key)) !== null, `${key} must be persisted`, 8000);
}

export async function runRemoteWidgetsIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const fixture = await startRemoteFixture();
  const prepared = fixture.prepareExtension(extensionPath);
  const report = { passed: false, cases: [] };
  const pages = [];
  let local;
  const record = (id, evidence = {}) => report.cases.push({ id, status: 'passed', ...evidence });
  const open = async options => { const page = await openNewTab(local, options); pages.push(page); return page; };
  const closeAll = async () => { while (pages.length) await pages.pop().close().catch(() => {}); };
  const reset = async options => {
    await closeAll();
    fixture.clearRules();
    await configureProfile(local, options);
    await new Promise(resolve => setTimeout(resolve, 200));
    fixture.log.length = 0;
  };
  try {
    const { openContextWithRetry, parseOptions } = await import('../../scripts/measure-newtab.mjs');
    local = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', prepared.directory, '--smoke', '--reps', '1']));

    // NT-15: nothing remote before interaction, never more than two tasks, one with data saver.
    for (const service of ['weather', 'currency', 'news', 'ipwho', 'icons']) fixture.rule(service, { mode: 'delay', delayMs: 250 });
    await reset({ widgets: ['weather', 'currency', 'rss'], storage: { ...CURRENCY_SETTINGS } });
    for (const service of ['weather', 'currency', 'news', 'ipwho', 'icons']) fixture.rule(service, { mode: 'delay', delayMs: 250 });
    fixture.resetPeak();
    let page = await open();
    const cards = ['weather', 'currency', 'privacy'].map(name => `.widget-card[data-widget="${name}"]`);
    await trackBoxes(page, [...cards, '.speed-dial-grid', '.search-box, .search-form']);
    await waitText(page, '.weather-temp', value => value === '31°C', 'Weather must load after the barrier', 20_000);
    await waitText(page, '.currency-value', value => value !== '--', 'Currency must load after the barrier');
    await waitUntil(() => exists(page, '.news-story'), 'News must load after the barrier');
    await sleep(page, 800);
    const early = fixture.log.filter(entry => entry.at < page.interactionEpoch - 2);
    assert.deepEqual(early, [], 'No remote request may start before the interaction barrier');
    for (const service of ['weather', 'currency', 'news', 'icons']) assert.ok(fixture.requests(service).length > 0, `${service} must be requested`);
    assert.ok(fixture.state.peak <= 2, `At most two remote tasks at once, saw ${fixture.state.peak}`);
    const boxes = await stopTracking(page);
    for (const [selector, range] of Object.entries(boxes)) {
      assert.ok(range.frames > 5, `${selector} was observed`);
      assert.ok(range.maxHeight - range.minHeight <= 1 && range.maxTop - range.minTop <= 1,
        `Loading remote content must not move ${selector}: height ${range.minHeight}-${range.maxHeight}, top ${range.minTop}-${range.maxTop}`);
    }
    const newsStories = await page.evaluate(() => document.querySelectorAll('.news-story').length);
    assert.ok(newsStories > 1 && newsStories <= 80, `The news list stays within its limit (${newsStories})`);
    record('nt15-barrier-and-two-task-budget', { peak: fixture.state.peak, requests: fixture.log.length, firstRequestAfterBarrierMs: Math.min(...fixture.log.map(entry => entry.at)) - page.interactionEpoch });

    await reset({ widgets: ['weather', 'currency', 'rss'], storage: { ...CURRENCY_SETTINGS }, flags: { saveData: true } });
    for (const service of ['weather', 'currency', 'news', 'ipwho', 'icons']) fixture.rule(service, { mode: 'delay', delayMs: 200 });
    fixture.resetPeak();
    page = await open();
    assert.equal(await page.evaluate(() => navigator.connection?.saveData), true, 'The data saver flag must be visible to the page');
    await waitText(page, '.weather-temp', value => value === '31°C', 'Weather must still load with data saver', 25_000);
    await waitText(page, '.currency-value', value => value !== '--', 'Currency must still load with data saver', 25_000);
    await waitUntil(() => exists(page, '.news-story'), 'News must still load with data saver', 25_000);
    assert.equal(fixture.state.peak, 1, 'Data saver allows one remote task at a time');
    record('nt15-data-saver-single-task', { peak: fixture.state.peak });

    // Headless Chromium keeps every tab visible, so hiding can only be exercised in Midori Gecko.
    const canHide = engine === 'firefox';
    if (!canHide) report.cases.push({ id: 'nt15-hide-abort-and-resume', status: 'skipped', reason: 'headless Chromium never reports a hidden tab' });

    // NT-15: hiding aborts what is running, nothing starts while hidden, returning resumes without a stuck state.
    if (canHide) {
      await reset({ widgets: ['weather', 'currency'], storage: { ...WEATHER_SETTINGS, ...CURRENCY_SETTINGS } });
      fixture.rule('currency', { mode: 'hang', times: 1 });
      page = await open();
      await waitUntil(() => fixture.requests('currency').length >= 1, `The currency request must be in flight: ${JSON.stringify(fixture.log.map(entry => `${entry.service}${entry.path}`))}`);
      await waitText(page, '.weather-temp', value => value === '31°C', 'Weather loads while currency hangs');
      await page.evaluate(() => {
        window.__hiddenSample = () => ({
          busy: document.querySelector('.currency-result')?.getAttribute('aria-busy'),
          refreshDisabled: document.querySelector('.currency-refresh')?.disabled,
          status: document.querySelector('.currency-status')?.textContent.trim(),
          value: document.querySelector('.currency-value')?.textContent.trim(),
        });
      });
      const before = fixture.log.length;
      const trip = await hideAndReturn(page, { hiddenMs: 900 });
      const hung = fixture.requests('currency')[0];
      assert.ok(hung.abortedAt && hung.abortedAt >= trip.hiddenAt - 50 && hung.abortedAt <= trip.hiddenAt + 1500, 'The in-flight request is aborted when the tab is hidden');
      assert.deepEqual(fixture.log.slice(before).filter(entry => entry.at > trip.hiddenAt + 50 && entry.at < trip.visibleAt - 50), [],
        'No remote task may start while the tab is hidden');
      assert.equal(trip.whileHidden.busy, 'false', 'An aborted request leaves no loading state behind');
      assert.equal(trip.whileHidden.refreshDisabled, false, 'The refresh button stays usable');
      await waitText(page, '.currency-value', value => value === '€9.00', 'Currency recovers after returning');
      assert.equal(await text(page, '.currency-status'), '', 'No error or loading text remains');
      assert.equal(await page.evaluate(() => document.querySelector('.currency-refresh').disabled), false);
      assert.ok(fixture.requests('currency').length >= 2, 'A fresh request is made after returning');
      assert.deepEqual(page.errors, []);
      record('nt15-hide-abort-and-resume', { hungAbortedAfterMs: hung.abortedAt - trip.hiddenAt, whileHidden: trip.whileHidden, requests: fixture.requests('currency').length });
    }

    // NT-15: disabling a widget cancels its request, enabling it again loads normally.
    await reset({ widgets: ['weather'], storage: { ...WEATHER_SETTINGS } });
    fixture.rule('weather', { mode: 'hang', times: 1 });
    page = await open();
    await waitUntil(() => fixture.requests('weather').filter(entry => entry.path === '/v1/forecast').length === 1, 'The forecast request must be in flight');
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetsStore').toggle('weather'));
    await page.waitForFunction(() => !document.querySelector('.weather-widget'));
    const disabledAt = Date.now();
    const cancelled = fixture.requests('weather')[0];
    await waitUntil(() => cancelled.abortedAt, 'Disabling the widget must abort its request', 3000);
    await sleep(page, 900);
    assert.equal(fixture.requests('weather', disabledAt).length, 0, 'A disabled widget makes no requests');
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('widgetsStore').toggle('weather'));
    await waitText(page, '.weather-temp', value => value === '31°C', 'The re-enabled widget loads');
    assert.deepEqual(page.errors, []);
    record('nt15-disable-aborts-and-enable-resumes', { abortedAfterMs: cancelled.abortedAt - disabledAt });

    // NT-15: the Ads decision keeps its visibility contract: an aborted decision is asked again on return.
    if (canHide) {
      await reset({ widgets: [], tab: { showAds: true } });
      fixture.rule('ads', { mode: 'hang', times: 1 });
      page = await open();
      await waitUntil(() => fixture.requests('ads').some(entry => entry.path === '/api/v1/ads/newtab'), 'The Ads decision request must be in flight');
      assert.ok(fixture.requests('ads')[0].at >= page.interactionEpoch - 2, 'Ads waits for the interaction barrier');
      const adsTrip = await hideAndReturn(page, { hiddenMs: 600 });
      assert.ok(fixture.requests('ads')[0].abortedAt, 'The pending Ads decision is aborted when hidden');
      await page.waitForFunction(() => document.querySelector('.sponsored-link .speed-dial-title')?.textContent === 'Integration sponsor', null, { timeout: 15_000 });
      const decisions = fixture.requests('ads').filter(entry => entry.path === '/api/v1/ads/newtab');
      assert.equal(decisions.length, 2, 'A new decision is requested after returning');
      assert.ok(decisions[1].at >= adsTrip.visibleAt - 100, 'The new decision starts only after returning');
      assert.equal(fixture.state.decision, 1, 'Only one decision was actually issued');
      record('nt15-ads-visibility-and-new-decision', { decisions: decisions.length });
    }

    // NT-16: weather offline and failing.
    await reset({ widgets: ['weather'], storage: { ...WEATHER_SETTINGS } });
    page = await open();
    await waitText(page, '.weather-temp', value => value === '31°C', 'Weather loads online');
    await whenPersisted(page, 'midori_weather_cache_v1');
    await sleep(page, 1200);
    await ageSnapshots(page, 'midori_weather_cache_v1', 3 * HOUR);
    await page.close(); pages.pop();
    fixture.log.length = 0;
    fixture.rule('weather', { mode: 'drop' });
    page = await open();
    await waitText(page, '.weather-temp', value => value === '31°C', 'The aged snapshot is shown without waiting for the network');
    await waitText(page, '.weather-stale', value => /Could not reach the service\./.test(value) && /saved data from 3 hours ago/.test(value), 'The failure and the age are explained');
    assert.equal(await text(page, '.weather-temp'), '31°C', 'The saved reading stays visible');
    assert.deepEqual(await page.evaluate(() => [document.querySelector('.weather-body')?.getAttribute('aria-busy'),
      document.querySelector('.weather-actions .weather-btn:nth-child(2)').disabled]), ['false', false], 'The widget is not left loading');
    await sleep(page, 2200);
    const hits = fixture.requests('weather').length;
    const attempts = attemptsOf(fixture.requests('weather'));
    assert.equal(attempts, 1, `A failure is not retried in a loop (${hits} connection attempts)`);
    const bodyHeight = await page.evaluate(() => document.querySelector('.weather-body').getBoundingClientRect().height);
    // Another unit has no snapshot: the other unit's value must not be shown under the new suffix.
    await page.click('.weather-actions .weather-btn:nth-child(1)');
    await waitText(page, '.weather-actions .weather-btn:nth-child(1)', value => value === '°F', 'The unit changes');
    await waitUntil(() => exists(page, '.weather-state--error'), 'Without data for that unit the widget reports the failure');
    assert.equal(await exists(page, '.weather-temp'), false, 'No reading of the other unit is shown');
    assert.match(await text(page, '.weather-state--error'), /Could not reach the service\./);
    fixture.clearRules();
    await page.click('.weather-actions .weather-btn:nth-child(2)');
    await waitText(page, '.weather-temp', value => value === '80°F', 'Refreshing restores a reading in the selected unit');
    assert.equal(await text(page, '.weather-stale'), '', 'No stale notice after a successful refresh');
    record('nt16-weather-offline-snapshot-unit-and-no-loop', { attempts, bodyHeight });

    // NT-16: weather location change and late responses.
    fixture.rule('weather', { mode: 'delay', delayMs: 1600, times: 1 });
    await page.click('.weather-actions .weather-btn:nth-child(2)');
    await sleep(page, 250);
    await page.fill('.weather-city input', 'Beta');
    await page.click('.weather-footer .weather-link:last-child');
    await waitText(page, '.weather-location', value => value === 'Beta, Fixture', 'The new place is selected');
    await waitText(page, '.weather-temp', value => value === '90°F', 'The new place shows its own reading');
    await sleep(page, 2000);
    assert.equal(await text(page, '.weather-temp'), '90°F', 'A late answer for the previous place never replaces the new one');
    assert.equal(await text(page, '.weather-location'), 'Beta, Fixture');
    record('nt16-weather-late-response-ignored');

    await page.fill('.weather-city input', 'Nowhere');
    await page.click('.weather-footer .weather-link:last-child');
    await waitText(page, '.weather-stale', value => value === 'City not found.', 'An unknown city has a clear message');
    fixture.rule('geocoding', { mode: 'drop' });
    await page.fill('.weather-city input', 'Alpha');
    await page.click('.weather-footer .weather-link:last-child');
    await waitText(page, '.weather-stale', value => /Could not reach the service\./.test(value), 'A failing city lookup says the service is unreachable, not that the city is missing');
    fixture.clearRules();
    record('nt16-weather-lookup-errors');

    // NT-16: currency.
    await reset({ widgets: ['currency'], storage: { ...CURRENCY_SETTINGS } });
    page = await open();
    await waitText(page, '.currency-value', value => value === '€9.00', 'Currency loads online');
    await whenPersisted(page, 'midori_currency_cache_v1');
    await sleep(page, 1200);
    await ageSnapshots(page, 'midori_currency_cache_v1', 2 * 24 * HOUR);
    await page.close(); pages.pop();
    fixture.rule('currency', { mode: 'drop' });
    page = await open();
    await waitText(page, '.currency-value', value => value === '€9.00', 'The aged rate is shown immediately');
    await waitText(page, '.currency-status', value => /Could not reach the service\./.test(value) && /saved data from 2 days ago/.test(value), 'The failure and the age of the rate are explained');
    assert.match(await text(page, '.currency-meta'), /Rate: 1 USD = 0\.9 EUR/);
    // A base without a snapshot must not be converted with another base's rates.
    await setSelect(page, '.currency-field:nth-of-type(2) select', 'GBP');
    await waitText(page, '.currency-meta', value => value === 'Rate unavailable', 'No rate is shown for a base that failed');
    assert.equal(await text(page, '.currency-value'), '--');
    await waitText(page, '.currency-status', value => /Could not reach the service\./.test(value), 'The failure is explained for the new base');
    fixture.clearRules();
    await page.click('.currency-refresh');
    await waitText(page, '.currency-value', value => value === '€9.00', 'A forced refresh restores conversion');
    // Late response for the previous base is ignored.
    await setSelect(page, '.currency-field:nth-of-type(3) select', 'JPY');
    fixture.rule('currency', { mode: 'delay', delayMs: 1600, times: 1 });
    await setSelect(page, '.currency-field:nth-of-type(2) select', 'USD');
    await sleep(page, 250);
    await setSelect(page, '.currency-field:nth-of-type(2) select', 'EUR');
    await waitText(page, '.currency-value', value => value === '¥1,700', 'The selected base converts with its own rates');
    await sleep(page, 2000);
    assert.equal(await text(page, '.currency-value'), '¥1,700', 'A late answer for the previous base never replaces the current one');
    assert.equal(await text(page, '.currency-status'), '');
    record('nt16-currency-offline-snapshot-base-and-late-response');

    // NT-16: news.
    await reset({ widgets: ['rss'] });
    page = await open({ until: () => document.querySelectorAll('.news-story').length > 1 });
    const stories = await page.evaluate(() => [...document.querySelectorAll('.news-story h5')].map(node => node.textContent));
    assert.ok(stories.length <= 80 && stories.every(title => title.startsWith('ALL story')), 'The list is capped and belongs to the selected filters');
    assert.match(await text(page, '.news-section-heading span'), /^Updated /);
    await whenPersisted(page, 'midori_news_snapshots_v1');
    await sleep(page, 1200);
    const snapshots = await readStorage(page, 'midori_news_snapshots_v1');
    assert.ok(Object.keys(snapshots).length <= 4);
    assert.ok(Object.values(snapshots).every(entry => entry.value.articles.length <= 40), 'Persisted snapshots keep at most 40 stories');
    assert.ok(Buffer.byteLength(JSON.stringify(snapshots)) <= 180_000, 'The persisted snapshot stays within its byte limit');
    await ageSnapshots(page, 'midori_news_snapshots_v1', 3 * HOUR);
    await page.close(); pages.pop();
    fixture.rule('news', { mode: 'drop' });
    page = await open({ until: () => document.querySelectorAll('.news-story').length > 1 });
    await waitText(page, '.news-section-heading span', value => /Showing the last available update\. \(3 hours ago\)/.test(value), 'The saved stories are marked with their age');
    assert.equal(await exists(page, '.news-empty--error'), false, 'Saved stories are not replaced by an error');
    assert.equal(await page.evaluate(() => document.querySelector('.news-icon-button').disabled), false);
    // Another filter that fails must not keep showing the previous filter's stories.
    await setSelect(page, '.news-filter-field:nth-of-type(1) select', 'MX');
    await waitUntil(() => exists(page, '.news-empty--error'), 'A failed filter change reports the failure');
    assert.equal(await exists(page, '.news-story'), false, 'Stories of another filter are removed');
    assert.match(await text(page, '.news-empty--error'), /Could not reach the service\./);
    fixture.clearRules();
    await page.click('.news-empty--error .news-action');
    await waitUntil(async () => (await page.evaluate(() => [...document.querySelectorAll('.news-story h5')].every(node => node.textContent.startsWith('MX story')) && document.querySelectorAll('.news-story').length > 1)),
      'Retrying loads the stories of the selected country');
    // Late response for a previous filter is ignored.
    fixture.rule('news', { mode: 'delay', delayMs: 1600, times: 1 });
    await setSelect(page, '.news-filter-field:nth-of-type(1) select', 'AR');
    await sleep(page, 400);
    await setSelect(page, '.news-filter-field:nth-of-type(1) select', 'BR');
    await waitUntil(async () => (await page.evaluate(() => [...document.querySelectorAll('.news-story h5')].every(node => node.textContent.startsWith('BR story')) && document.querySelectorAll('.news-story').length > 1)),
      'The latest filter shows its own stories', 20_000);
    await sleep(page, 2200);
    const finalTitles = await page.evaluate(() => [...document.querySelectorAll('.news-story h5')].map(node => node.textContent));
    assert.ok(finalTitles.every(title => title.startsWith('BR story')), 'A late response for a previous filter never replaces the current stories');
    assert.deepEqual(page.errors, []);
    record('nt16-news-offline-snapshot-filter-failure-and-late-response', { stories: stories.length });

    report.passed = true;
    return report;
  } finally {
    report.fixtureRequests = fixture.log.length;
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'remote-widgets.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    await closeAll();
    try { if (local) { const { closeContext } = await import('../../scripts/measure-newtab.mjs'); await closeContext(local); } }
    finally { await fixture.close(); prepared.cleanup(); }
  }
}
