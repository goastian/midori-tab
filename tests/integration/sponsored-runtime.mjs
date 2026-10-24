import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeContext, openContextWithRetry, parseOptions } from '../../scripts/measure-newtab.mjs';

function observeReadiness() {
  window.addEventListener('midori:perf-mark', event => {
    if (event.detail?.name !== 'interaction-ready') return;
    const card = document.querySelector('.sponsored-card');
    const rect = card?.getBoundingClientRect();
    window.__sponsoredIntegration = {
      interactionEpoch: performance.timeOrigin + window.__midoriPerf.marks['interaction-ready'],
      placeholder: Boolean(card?.classList.contains('sponsored-card--pending')),
      storeCreated: document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.has('adsStore'),
      width: rect?.width, height: rect?.height,
    };
  });
}

async function waitUntil(predicate, message) {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(message);
}

export async function runSponsoredIntegration({ engine, extensionPath, outputDir }) {
  const directory = mkdtempSync(join(tmpdir(), 'midori-sponsored-integration-'));
  const requests = [];
  const png = readFileSync(new URL('../../public/icons/48.png', import.meta.url));
  let base;
  let decision = 0;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, base);
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString();
    requests.push({ path: url.pathname, method: request.method, at: Date.now(), body: body ? JSON.parse(body) : null });
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' });
      response.end();
    } else if (url.pathname === '/api/v1/ads/newtab') {
      decision += 1;
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ contract_version: 'ads-channel-v1', format_id: 'newtab_icon_v1', channel: 'midori_tab', placement: 'new_tab',
        ad_id: 42, title: 'Integration sponsor', icon_url: `${base}/icon.png`, image_url: `${base}/icon.png`,
        destination_url: `${base}/api/v1/ads/click/fixture`, impression_token: `fixture-impression-${decision}`,
        attribution_token: `fixture-attribution-${decision}`, opportunity_id: `fixture-opportunity-${decision}`,
        request_id: `fixture-request-${decision}`, decision_id: `fixture-decision-${decision}`,
        expires_at: Math.floor(Date.now() / 1000) + 3600, disclosure_required: true, sponsor_label: 'Sponsored',
        billing: { model: 'vcpm', funding_type: 'prepaid', amount_micros: 1_000_000, currency: 'USD' },
        transparency: { data_used: ['language'], frequency_cap_per_day: 3, feedback_enabled: true } }));
    } else if (url.pathname === '/icon.png') {
      response.writeHead(200, { 'Content-Type': 'image/png' });
      response.end(png);
    } else if (url.pathname.startsWith('/api/v1/ads/click/')) {
      response.writeHead(302, { Location: `${base}/landing${url.search}` });
      response.end();
    } else if (url.pathname === '/landing') response.end('Sponsored integration landing');
    else { response.writeHead(204); response.end(); }
  });
  let session;
  let page;
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}`;
    cpSync(extensionPath, directory, { recursive: true });
    const configuredFiles = [];
    for (const relative of readdirSync(directory, { recursive: true }).filter(file => file.endsWith('.js'))) {
      const path = join(directory, relative);
      const source = readFileSync(path, 'utf8');
      if (!source.includes('https://ads.astian.org')) continue;
      writeFileSync(path, source.replaceAll('https://ads.astian.org', base));
      configuredFiles.push(relative);
    }
    assert.ok(configuredFiles.length > 0, 'Fixture must configure the existing production Ads API endpoint');
    const html = join(directory, 'index.html');
    writeFileSync(html, readFileSync(html, 'utf8').replace('<head>', '<head><script src="/integration-sponsored-observer.js"></script>'));
    writeFileSync(join(directory, 'integration-sponsored-observer.js'), `(${observeReadiness.toString()})();\n`);
    session = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', directory, '--smoke', '--reps', '1']));
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => document.querySelector('.sponsored-link .speed-dial-title')?.textContent === 'Integration sponsor', null, { timeout: 20_000 });
    const ready = await page.evaluate(() => window.__sponsoredIntegration);
    assert.ok(ready, 'Capture the real readiness mark before starting optional sponsored runtime');
    assert.equal(ready.placeholder, true, 'Sponsored slot must already reserve its space at interaction readiness');
    assert.equal(ready.storeCreated, false, 'Ads runtime must not instantiate its store before interaction readiness');
    assert.ok(requests.filter(request => request.path.startsWith('/api/')).every(request => request.at >= ready.interactionEpoch),
      'All actual Ads HTTP requests must occur after interaction readiness');
    const rendered = await page.evaluate(() => {
      const rect = document.querySelector('.sponsored-card').getBoundingClientRect();
      return { width: rect.width, height: rect.height, disclosed: Boolean(document.querySelector('.sponsored-badge')),
        rel: document.querySelector('.sponsored-link').rel };
    });
    assert.ok(Math.abs(ready.width - rendered.width) <= 1 && Math.abs(ready.height - rendered.height) <= 1,
      `Reserved sponsored slot must retain its dimensions: before=${JSON.stringify(ready)}, after=${JSON.stringify(rendered)}`);
    assert.equal(rendered.disclosed, true);
    assert.match(rendered.rel, /sponsored/);
    await waitUntil(() => requests.some(request => request.path === '/api/v1/ads/impression' && request.method === 'POST'), 'Real visible sponsored impression was not sent');
    await page.click('.sponsored-link');
    await waitUntil(() => requests.some(request => request.path === '/landing'), 'Native sponsored click must reach the real tracking redirect and landing');
    await page.waitForFunction(async fixtureBase => (await (globalThis.browser || globalThis.chrome).tabs.query({}))
      .some(tab => tab.url?.startsWith(`${fixtureBase}/landing`)), base);
    const clickedTabs = await page.evaluate(async fixtureBase => {
      const api = globalThis.browser || globalThis.chrome;
      const tabs = (await api.tabs.query({})).filter(tab => tab.url?.startsWith(`${fixtureBase}/landing`));
      const urls = tabs.map(tab => tab.url);
      await api.tabs.remove(tabs.map(tab => tab.id));
      return urls;
    }, base);
    assert.equal(clickedTabs.length, 1, 'One native click must open exactly one tracked destination');
    assert.ok(Number(new URL(clickedTabs[0]).searchParams.get('interaction_ms')) >= 500, 'Click guard must attach the real elapsed interaction time');
    await page.click('.sponsored-info');
    await page.waitForFunction(() => document.querySelector('.feedback-actions button'));
    await page.click('.feedback-actions button');
    await waitUntil(() => requests.some(request => request.body?.event_type === 'feedback_relevant'), 'Real feedback event must reach fixture server');

    await page.click('.dashboard-toolbar .top-actions .top-btn:last-child');
    await page.waitForFunction(() => document.querySelector('.open-start-page'));
    await page.click('.open-start-page');
    await page.waitForFunction(() => document.querySelector('.panel-tab'));
    await page.click('.panel-tab:first-child');
    await page.waitForFunction(() => document.querySelector('.panel-content .setting-item:nth-child(2) [role="switch"]'));
    await page.click('.panel-content .setting-item:nth-child(2) [role="switch"]');
    await page.waitForFunction(() => !document.querySelector('.sponsored-card'));
    await waitUntil(() => requests.some(request => request.body?.event_type === 'ad_opt_out'), 'Opt-out must retain the real tracking event');
    await page.click('.panel-content .setting-item:nth-child(2) [role="switch"]');
    await page.waitForFunction(() => document.querySelector('.sponsored-link .speed-dial-title')?.textContent === 'Integration sponsor');
    await page.click('.panel-close');
    await page.waitForFunction(() => !document.querySelector('.panel-overlay'));
    if (!await page.evaluate(() => Boolean(document.querySelector('.dismiss-action')))) await page.click('.sponsored-info');
    await page.click('.dismiss-action');
    await page.waitForFunction(() => !document.querySelector('.sponsored-card'));
    await waitUntil(() => requests.some(request => request.body?.event_type === 'ad_dismissed'), 'Dismissal must retain the real tracking event');
    assert.equal(decision, 1, 'Toggling visibility must preserve the current page decision without another fetch');
    assert.equal(requests.filter(request => request.path === '/api/v1/ads/impression' && request.method === 'POST').length, 1,
      'Visibility toggles must not count the same leased impression twice');
    const report = { passed: true, configuredFiles, fixture: 'Only the Ads API base URL changes in an isolated copy; native HTTP, production contracts, DOM, viewability, tracking and browser tabs remain real',
      ready, rendered, clickedTabs, requests };
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'sponsored-integration.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    try { if (session) await closeContext(session); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      rmSync(directory, { recursive: true, force: true });
    }
  }
}
