import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureProfile, openNewTab, readStorage, sleep, startRemoteFixture, waitUntil } from './remote-fixture.mjs';

const text = (page, selector) => page.evaluate(query => document.querySelector(query)?.textContent.replace(/\s+/g, ' ').trim() ?? null, selector);
const exists = (page, selector) => page.evaluate(query => Boolean(document.querySelector(query)), selector);
const stats = page => page.evaluate(() => [...document.querySelectorAll('.pw-stat-value')].map(node => node.textContent.replace(/\s+/g, ' ').trim()));
const widgetHeight = page => page.evaluate(() => document.querySelector('.privacy-widget').closest('.widget-card').getBoundingClientRect().height);
const setFlags = (page, flags) => page.evaluate(value => localStorage.setItem('__integration_flags', JSON.stringify(value)), flags);
const waitLoaded = (page, timeout = 15_000) => page.waitForFunction(() => document.querySelector('.privacy-widget')
  && !document.querySelector('.pw-badge--loading'), null, { timeout });

async function withFixture({ engine, extensionPath }, run) {
  const fixture = await startRemoteFixture();
  const prepared = fixture.prepareExtension(extensionPath);
  const { openContextWithRetry, closeContext, parseOptions } = await import('../../scripts/measure-newtab.mjs');
  const session = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', prepared.directory, '--smoke', '--reps', '1']));
  try { return await run({ fixture, session }); }
  finally {
    try { await closeContext(session); }
    finally { await fixture.close(); prepared.cleanup(); }
  }
}

function saveReport(outputDir, name, report) {
  if (!outputDir) return;
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, name), `${JSON.stringify(report, null, 2)}\n`);
}

/** NT-18: the widget against every behaviour of the Midori bridge and its fallbacks. */
export async function runPrivacyIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const report = { passed: false, cases: [] };
  const record = (id, evidence = {}) => report.cases.push({ id, status: 'passed', ...evidence });
  try {
    return await withFixture({ engine, extensionPath }, async ({ session }) => {
      const open = async flags => {
        await configureProfile(session, { widgets: ['privacy'], flags: { privacy: flags } });
        return openNewTab(session);
      };

      let page = await open('noDenominator');
      await waitLoaded(page);
      let values = await stats(page);
      assert.equal(values[0], '321', 'The blocked total comes from the provider');
      assert.match(values[1], /^— ?Not available$/, `Requests without a denominator are unavailable, not zero: ${JSON.stringify(values)}`);
      assert.match(values[2], /^— ?Not available$/, 'The block rate without a denominator is unavailable, not 0%');
      assert.equal(values[3], '5');
      assert.equal(await text(page, '.pw-badge'), 'On');
      assert.match(await text(page, '.pw-categories'), /Scripts ?300/);
      const reference = await widgetHeight(page);
      assert.equal(await page.evaluate(() => document.querySelector('.pw-stat-value[title]')?.title), 'Not available');
      record('nt18-rate-without-denominator-is-unavailable', { values });
      await page.close();

      page = await open('full');
      await waitLoaded(page);
      values = await stats(page);
      assert.deepEqual(values, ['120', '1.0K', '12%', '4'], 'A complete report shows every figure');
      assert.equal(await exists(page, '.pw-sr-only'), false);
      assert.ok(Math.abs(await widgetHeight(page) - reference) <= 1, 'The widget keeps its height between states');
      record('nt18-complete-report', { values });
      await page.close();

      for (const mode of ['fail', 'empty']) {
        page = await open(mode);
        await waitLoaded(page);
        assert.equal(await text(page, '.pw-empty-text'), 'Midori Privacy is not installed or not responding.', `${mode}: a clear message, no invented figures`);
        assert.equal(await exists(page, '.pw-stat'), false, `${mode}: no figures are shown`);
        assert.equal(await text(page, '.pw-badge'), 'Off');
        const height = await widgetHeight(page);
        assert.ok(Math.abs(height - reference) <= 1, `${mode}: the widget keeps its height (${height} vs ${reference})`);
        assert.deepEqual(page.errors, [], `${mode}: the failure does not break the page`);
        if (mode === 'fail') {
          // The provider comes back: the next refresh shows real figures again.
          await sleep(page, 2200);
          await setFlags(page, { privacy: 'full' });
          await page.evaluate(() => window.dispatchEvent(new CustomEvent('midori:privacy-stats-updated')));
          await page.waitForFunction(() => document.querySelector('.pw-stat-value')?.textContent.trim() === '120', null, { timeout: 8000 });
          assert.equal(await text(page, '.pw-badge'), 'On');
          record('nt18-provider-recovers-after-failure');
        }
        record(`nt18-${mode}-provider-shows-unavailable`);
        await page.close();
      }

      page = await open('hang');
      const started = Date.now();
      await waitLoaded(page, 20_000);
      const waitedMs = Date.now() - started;
      assert.equal(await text(page, '.pw-empty-text'), 'Midori Privacy is not installed or not responding.');
      assert.equal(await exists(page, '.pw-stat'), false);
      assert.ok(waitedMs < 14_000, `A provider that never answers is given up after its timeouts (${waitedMs} ms)`);
      assert.ok(await page.evaluate(() => window.__integrationPrivacyCalls) >= 1);
      assert.deepEqual(page.errors, []);
      record('nt18-silent-provider-times-out', { waitedMs });
      await page.close();
      report.passed = true;
      return report;
    });
  } finally { saveReport(outputDir, 'privacy.json', report); }
}

async function openRewards(page) {
  await page.click('.bottom-actions .action-btn:nth-child(3)');
  await page.waitForFunction(() => document.querySelector('.rewards-modal h1'));
}

async function chooseCountry(page, code = 'ES') {
  await page.click('.rewards-primary');
  await page.waitForFunction(() => document.querySelector('#rewards-country'));
  await page.evaluate(value => {
    const select = document.querySelector('#rewards-country');
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }, code);
  if (!await page.evaluate(() => document.querySelector('.rewards-consent input').checked)) await page.click('.rewards-consent input');
  await page.waitForFunction(() => !document.querySelector('.rewards-primary').disabled);
}

const title = page => text(page, '#rewards-title');
const modalGone = page => page.waitForFunction(() => !document.querySelector('.rewards-scrim'));
const rewardsRequests = (fixture, method = 'POST') => fixture.log.filter(entry => entry.path === '/api/v1/public/viewer-rewards-interest' && entry.method === method);

/** NT-19: registration, closing, cancelling and failing the network. */
export async function runRewardsIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const report = { passed: false, cases: [] };
  const record = (id, evidence = {}) => report.cases.push({ id, status: 'passed', ...evidence });
  try {
    return await withFixture({ engine, extensionPath }, async ({ fixture, session }) => {
      const reset = async () => {
        fixture.clearRules();
        await configureProfile(session, { widgets: [] });
        await new Promise(resolve => setTimeout(resolve, 150));
        fixture.log.length = 0;
      };

      // A registration followed by the payout destination; a double click registers once.
      await reset();
      let page = await openNewTab(session);
      await openRewards(page);
      assert.equal(await title(page), 'Prepare Rewards for your region');
      await chooseCountry(page, 'ES');
      await page.evaluate(() => { const button = document.querySelector('.rewards-primary'); button.click(); button.click(); button.click(); });
      await page.waitForFunction(() => document.querySelector('#rewards-juky'), null, { timeout: 10_000 });
      assert.equal(rewardsRequests(fixture).length, 1, 'Several clicks send one registration');
      const posted = rewardsRequests(fixture)[0].body;
      assert.deepEqual(Object.keys(posted).sort(), ['anonymous_id', 'country_code', 'source', 'terms_accepted'], 'Only the documented fields are sent');
      assert.equal(posted.country_code, 'ES');
      assert.match(posted.anonymous_id, /^[0-9a-f-]{36}$/);
      await page.fill('#rewards-juky', 'juky:fixture');
      fixture.rule('rewardsPayout', { mode: 'status', status: 500, times: 1 });
      await page.evaluate(() => { const button = document.querySelector('.rewards-primary'); button.click(); button.click(); });
      await page.waitForFunction(() => document.querySelector('.rewards-error'), null, { timeout: 10_000 });
      assert.equal(await text(page, '.rewards-error'), 'We could not save your Juky destination. Try again.', 'A rejected destination has a clear message');
      assert.equal(fixture.log.filter(entry => entry.method === 'PUT').length, 1, 'Double clicking the payout sends it once');
      await page.click('.rewards-primary');
      await page.waitForFunction(() => document.querySelector('#rewards-title')?.textContent === 'Preliminary registration active', null, { timeout: 10_000 });
      const put = fixture.log.filter(entry => entry.method === 'PUT');
      assert.equal(put.length, 2, 'The payout is retried explicitly');
      assert.deepEqual(put[1].body, { destination: 'juky:fixture' });
      const saved = await readStorage(page, 'midori:rewards:interest-state:v1');
      assert.equal(saved.status, 'active');
      assert.equal(saved.payoutDestinationSet, true);
      await page.click('.rewards-primary');
      await modalGone(page);
      await openRewards(page);
      assert.equal(await title(page), 'Preliminary registration active', 'Reopening shows the saved state without registering again');
      assert.equal(rewardsRequests(fixture, 'POST').length, 1);
      record('nt19-register-once-and-payout-destination', { requests: fixture.log.filter(entry => entry.path.includes('rewards') && entry.method !== 'OPTIONS').length });
      await page.close();

      // Closing the modal while the request is in flight: nothing reopens it and nothing is saved.
      await reset();
      fixture.rule('rewardsInterest', { mode: 'hang', times: 1 });
      page = await openNewTab(session);
      await openRewards(page);
      await chooseCountry(page, 'MX');
      await page.click('.rewards-primary');
      await waitUntil(() => rewardsRequests(fixture).length === 1, 'The registration request must be sent');
      await page.evaluate(() => document.querySelector('.rewards-close').click());
      await modalGone(page);
      const closedAt = Date.now();
      await waitUntil(() => rewardsRequests(fixture)[0].abortedAt || rewardsRequests(fixture)[0].doneAt, 'The request ends', 5000);
      assert.ok(rewardsRequests(fixture)[0].abortedAt, 'Closing the modal aborts the request instead of letting it finish');
      await sleep(page, 1800);
      assert.equal(await exists(page, '.rewards-scrim'), false, 'A late response never reopens the modal');
      assert.equal(await readStorage(page, 'midori:rewards:interest-state:v1'), null, 'A cancelled registration saves nothing');
      await openRewards(page);
      assert.equal(await title(page), 'Prepare Rewards for your region', 'Reopening starts from the beginning');
      await page.click('.rewards-close');
      await modalGone(page);
      record('nt19-close-cancels-and-late-response-is-ignored', { abortedAfterMs: rewardsRequests(fixture)[0].abortedAt - closedAt });
      await page.close();

      // A slow service ends in a pending state that can be retried; the same anonymous id is reused.
      await reset();
      fixture.rule('rewardsInterest', { mode: 'delay', delayMs: 4000, times: 1 });
      page = await openNewTab(session);
      await openRewards(page);
      await chooseCountry(page, 'ES');
      await page.click('.rewards-primary');
      await page.waitForFunction(() => document.querySelector('#rewards-title')?.textContent === 'Registration pending', null, { timeout: 10_000 });
      assert.equal(await readStorage(page, 'midori:rewards:interest-state:v1').then(state => state.status), 'pending_sync');
      assert.equal(await exists(page, '.rewards-primary:disabled'), false, 'The pending step can be retried');
      await page.click('.rewards-primary');
      await page.waitForFunction(() => document.querySelector('#rewards-juky'), null, { timeout: 10_000 });
      const posts = rewardsRequests(fixture, 'POST');
      assert.equal(posts.length, 2);
      assert.equal(posts[0].body.anonymous_id, posts[1].body.anonymous_id, 'The retry reuses the anonymous id');
      record('nt19-timeout-pending-and-retry');
      await page.close();

      // A dropped connection also ends pending, and the pending state survives reopening.
      await reset();
      fixture.rule('rewardsInterest', { mode: 'drop' });
      page = await openNewTab(session);
      await openRewards(page);
      await chooseCountry(page, 'ES');
      await page.click('.rewards-primary');
      await page.waitForFunction(() => document.querySelector('#rewards-title')?.textContent === 'Registration pending', null, { timeout: 10_000 });
      await page.click('.rewards-close');
      await modalGone(page);
      await openRewards(page);
      assert.equal(await title(page), 'Registration pending', 'A pending registration is remembered');
      await page.click('.rewards-secondary');
      await page.waitForFunction(() => document.querySelector('#rewards-country'));
      assert.equal(await page.evaluate(() => document.querySelector('#rewards-country').value), 'ES', 'The chosen country is kept');
      record('nt19-network-failure-is-pending-and-remembered');
      await page.close();

      // Two New Tabs registering together register once.
      await reset();
      fixture.rule('rewardsInterest', { mode: 'delay', delayMs: 700, times: 1 });
      const first = await openNewTab(session);
      const second = await openNewTab(session);
      await openRewards(first);
      await chooseCountry(first, 'ES');
      await openRewards(second);
      await chooseCountry(second, 'ES');
      await first.click('.rewards-primary');
      await second.click('.rewards-primary');
      await first.waitForFunction(() => document.querySelector('#rewards-juky'), null, { timeout: 10_000 });
      await second.waitForFunction(() => document.querySelector('#rewards-juky'), null, { timeout: 10_000 });
      assert.equal(rewardsRequests(fixture, 'POST').length, 1, 'Two New Tabs registering at once send one registration');
      record('nt19-two-new-tabs-register-once');
      await first.close();
      await second.close();

      report.passed = true;
      return report;
    });
  } finally { saveReport(outputDir, 'rewards.json', report); }
}
