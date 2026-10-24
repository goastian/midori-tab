import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openGeckoSession } from './gecko-transport.mjs';

export async function runTransportIntegration(session, { outputDir } = {}) {
  const server = createServer((request, response) => {
    response.setHeader('Access-Control-Allow-Origin', '*');
    if (request.url.startsWith('/cancelled')) {
      const timer = setTimeout(() => response.end('late'), 3000);
      request.on('close', () => clearTimeout(timer));
    } else response.end('gecko-integration-ok');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  let page;
  try {
    page = await session.context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${session.url}?midori-perf=1`);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['search-ready']), null, { timeout: 20_000 });
    await page.fill('.search-input', 'midori integration');
    const rendered = await page.evaluate(async () => ({
      title: document.title,
      searchText: document.querySelector('.search-input')?.value,
      searchFocused: document.activeElement === document.querySelector('.search-input'),
      marks: window.__midoriPerf.marks,
      viewport: { width: innerWidth, height: innerHeight },
      nativeBridgePresent: typeof globalThis.browser?.midoriBlocker?.getStatsSummary === 'function',
      browser: await globalThis.browser?.runtime?.getBrowserInfo?.() || null,
    }));
    assert.equal(rendered.title, 'Midori Tab');
    assert.equal(rendered.searchText, 'midori integration');
    assert.equal(rendered.searchFocused, true);
    if (session.metadata?.experimentApis?.includes('midoriBlocker')) {
      assert.equal(rendered.nativeBridgePresent, true, 'The complete extension must expose its experimental API');
    }
    await session.network.start();
    const pageText = await page.evaluate(fixtureBase => fetch(`${fixtureBase}/page?private=must-not-be-recorded`).then(response => response.text()), base);
    let backgroundFetches;
    if (typeof session.context.serviceWorkers === 'function') {
      const extensionUrl = new URL(session.url);
      const prefix = `${extensionUrl.protocol}//${extensionUrl.host}/`;
      const worker = session.context.serviceWorkers().find(worker => worker.url().startsWith(prefix));
      assert.ok(worker, 'The installed extension must have an actual background service worker');
      backgroundFetches = await worker.evaluate(async fixtureBase => {
        const backgroundText = await fetch(`${fixtureBase}/background`).then(response => response.text());
        const controller = new AbortController();
        const pending = fetch(`${fixtureBase}/cancelled`, { signal: controller.signal }).then(() => 'unexpected response', error => error.name);
        setTimeout(() => controller.abort(), 100);
        return { backgroundText, abort: await pending };
      }, base);
    } else {
      backgroundFetches = await page.evaluate(async fixtureBase => {
        const background = await browser.runtime.getBackgroundPage();
        const backgroundText = await background.fetch(`${fixtureBase}/background`).then(response => response.text());
        const controller = new background.AbortController();
        const pending = background.fetch(`${fixtureBase}/cancelled`, { signal: controller.signal }).then(() => 'unexpected response', error => error.name);
        setTimeout(() => controller.abort(), 100);
        return { backgroundText, abort: await pending };
      }, base);
    }
    const fetches = { pageText, ...backgroundFetches };
    assert.deepEqual(fetches, { pageText: 'gecko-integration-ok', backgroundText: 'gecko-integration-ok', abort: 'AbortError' });
    await new Promise(resolve => setTimeout(resolve, 100));
    const requests = (await session.network.stop()).filter(request => request.url.startsWith(base));
    assert.equal(requests.length, 3);
    assert.equal(requests.find(request => request.url.endsWith('/page'))?.scope, 'page');
    assert.equal(requests.find(request => request.url.endsWith('/page'))?.state, 'finished');
    assert.equal(requests.find(request => request.url.endsWith('/background'))?.scope, 'background');
    assert.equal(requests.find(request => request.url.endsWith('/background'))?.state, 'finished');
    assert.equal(requests.find(request => request.url.endsWith('/cancelled'))?.scope, 'background');
    assert.equal(requests.find(request => request.url.endsWith('/cancelled'))?.state, 'cancelled');
    assert.ok(requests.every(request => Number.isFinite(request.endEpochMs) && request.endEpochMs >= request.startEpochMs));
    assert.ok(requests.every(request => !request.url.includes('?')));
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      await page.screenshot({ path: join(outputDir, 'newtab.png') });
    }
    // Exercise the real Vue click handler and tabs.update API. The current
    // product fixes AstianGO as its provider; there is no custom-engine setting.
    // This synthetic query contains no user data. A response from the remote
    // search backend is deliberately not a condition of this frontend smoke.
    await page.click('.search-btn');
    let observedUrl;
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      // Read through the browser transport: a document-bound JS evaluation can
      // be destroyed during navigation and does not establish a backend result.
      observedUrl = new URL(await page.url());
      if (observedUrl.origin === 'https://astiango.com' && observedUrl.searchParams.get('q') === 'midori integration') break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(observedUrl?.origin, 'https://astiango.com', 'The real search button must navigate to AstianGO');
    assert.equal(observedUrl.searchParams.get('q'), 'midori integration');
    const searchSubmission = {
      url: observedUrl.href,
      query: observedUrl.searchParams.get('q'),
      trigger: 'native keyboard input and native click on the real search button',
      navigation: 'confirmed',
      backendResponse: 'not-validated',
    };
    const searchUrl = new URL(searchSubmission.url);
    assert.equal(searchUrl.searchParams.get('client'), 'midoritab');
    assert.equal(searchUrl.searchParams.get('omnibar'), '1');
    assert.equal(searchUrl.searchParams.get('qbc'), '1');
    assert.deepEqual(errors, []);
    const report = { kind: 'transport-integration', passed: true, metadata: session.metadata,
      rendered, searchSubmission, fixtureFetches: fetches, network: { coverage: session.network.coverage, requests }, errors };
    if (outputDir) {
      writeFileSync(join(outputDir, 'transport-integration.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    return report;
  } finally {
    try { await page?.close(); }
    finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  }
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const extensionPath = resolve(process.argv[2] || join(root, 'dist'));
  const outputDir = resolve(process.argv[3] || join(root, 'artifacts', 'gecko-integration'));
  let session;
  try {
    session = await openGeckoSession({ extensionPath });
    await runTransportIntegration(session, { outputDir });
  } finally { await session?.close(); }
  assert.equal(existsSync(session.profile), false, 'Temporary Gecko profile must be removed');
  console.log(`[integration-transport] PASS ${outputDir}; temporary profile removed`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
}
