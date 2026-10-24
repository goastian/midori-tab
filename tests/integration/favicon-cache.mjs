import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const DOMAIN = 'favicon-fixture.example';
const BOOKMARK_URL = `https://${DOMAIN}/`;

function observeFavicons() {
  const evidence = window.__faviconIntegration = { dom: [], frames: [], startedAt: performance.now() };
  let stopped = false;
  function sample(destination) {
    const links = [...document.querySelectorAll('.speed-dial-link')]
      .filter(link => link.href?.startsWith('https://favicon-fixture.example/'));
    if (!links.length) return;
    const icons = links.map(link => {
      const image = link.querySelector('.speed-dial-icon img');
      const rect = link.querySelector('.speed-dial-icon').getBoundingClientRect();
      return { title: link.querySelector('.speed-dial-title')?.textContent,
        src: image?.getAttribute('src') || null, initial: Boolean(link.querySelector('.speed-dial-initial')),
        decoded: Boolean(image?.complete && image.naturalWidth), width: rect.width, height: rect.height };
    });
    if (destination.length < 240) destination.push({ at: performance.now(), icons });
  }
  const observer = new MutationObserver(() => sample(evidence.dom));
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  function frame() {
    if (stopped) return;
    sample(evidence.frames);
    if (performance.now() - evidence.startedAt < 20_000) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  evidence.stop = () => { stopped = true; observer.disconnect(); };
}

export function instrumentFaviconFixture(directory) {
  const file = join(directory, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<head>/i);
  writeFileSync(file, html.replace(/<head>/i, '<head><script src="/integration-favicon-observer.js"></script>'));
  writeFileSync(join(directory, 'integration-favicon-observer.js'), `(${observeFavicons.toString()})();\n`);
  const serviceDirectory = join(directory, 'integration-favicon');
  mkdirSync(serviceDirectory, { recursive: true });
  for (const file of ['FaviconService.js', 'fetchJsonWithTimeout.js']) {
    copyFileSync(new URL(`../../src/services/${file}`, import.meta.url), join(serviceDirectory, file));
  }
}

export async function runFaviconIntegration(session, { outputDir } = {}) {
  const png = readFileSync(new URL('../../public/icons/48.png', import.meta.url));
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, at: Date.now() });
    response.writeHead(200, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(png);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const fixtureUrl = `http://127.0.0.1:${server.address().port}/favicon.png`;
  let page;
  const tabs = [];
  try {
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => document.querySelector('.bookmark-grid')
      && Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
    await page.evaluate(async ({ fixtureUrl, domain, url }) => {
      const api = globalThis.browser || globalThis.chrome;
      const { FaviconService } = await import('/integration-favicon/FaviconService.js');
      const service = new FaviconService({ fetchFn: (_providerUrl, options) => fetch(fixtureUrl, options) });
      const icon = await service.loadIcon(domain);
      if (!icon.blob?.size) throw new Error('Production FaviconService must fetch a real fixture image');
      const cached = await service.readCached(domain);
      if (!cached?.blob?.size || cached.stale) throw new Error('Production FaviconService must persist the fetched image');
      const categories = ['Fixture', 'Other'];
      const bookmarks = { Fixture: [
        { title: 'Cached favicon', url, domain: domain.toUpperCase() },
        { title: 'Same domain', url: `${url}second`, domain },
      ], Other: [{ title: 'Other category', url: `${url}other`, domain }] };
      const payload = { midori_bookmarks: { value: bookmarks, updatedAt: Date.now(), __midoriStorageVersion: 1 },
        midori_bookmark_categories: { value: categories, updatedAt: Date.now(), __midoriStorageVersion: 1 } };
      await api.storage.local.set(payload);
      for (const [key, value] of Object.entries(payload)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.removeItem('midori_bookmark_snapshot_v1');
      localStorage.removeItem('midori_favicon_snapshot_v1');
      const settings = JSON.parse(localStorage.getItem('tabStore') || '{}');
      localStorage.setItem('tabStore', JSON.stringify({ ...settings, showAds: false, widgetsEnabled: false,
        showSpeedDials: true, showAddSpeedDialButton: false, background: { type: 'Color', class: 'bg-orange' } }));
    }, { fixtureUrl, domain: DOMAIN, url: BOOKMARK_URL });
    await page.close();
    page = null;
    assert.equal(requests.length, 1, 'Production FaviconService must make one real fixture HTTP request');
    await session.network.start();
    for (let index = 0; index < 2; index += 1) {
      page = await session.context.newPage();
      await page.goto(session.url);
      await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('.speed-dial-link[href^="https://favicon-fixture.example/"] img')];
        return images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0)
          && Boolean(localStorage.getItem('midori_favicon_snapshot_v1'))
          && Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']);
      }, null, { timeout: 20_000 });
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 650)));
      const evidence = await page.evaluate(() => {
        if (!window.__faviconIntegration) throw new Error('The favicon fixture observer must be installed before navigation');
        window.__faviconIntegration.stop();
        const snapshot = localStorage.getItem('midori_favicon_snapshot_v1');
        return { dom: window.__faviconIntegration.dom, frames: window.__faviconIntegration.frames,
          snapshotBytes: new Blob([snapshot]).size, snapshot: JSON.parse(snapshot),
          bookmarkSnapshot: JSON.parse(localStorage.getItem('midori_bookmark_snapshot_v1')) };
      });
      assert.ok(evidence.snapshotBytes <= 64 * 1024, 'Synchronous favicon snapshot must stay bounded');
      assert.equal(evidence.bookmarkSnapshot.activeTab, 'Fixture');
      assert.ok(evidence.frames.length > 0, 'Observe rendered frames of actual installed new tab');
      if (index === 1) {
        assert.ok(evidence.dom.length > 0);
        assert.ok(evidence.dom.every(sample => sample.icons.length === 2 && sample.icons.every(icon => !icon.initial && icon.src?.startsWith('data:image/'))),
          'Warm new tab must have cached icons from its first DOM appearance, without initial-letter replacements');
        assert.ok(evidence.frames.every(sample => sample.icons.every(icon => icon.decoded)),
          'Warm favicon images must be decoded at every observed rendering frame');
        const sources = evidence.frames.flatMap(sample => sample.icons.map(icon => icon.src));
        assert.equal(new Set(sources).size, 1, 'Same-domain bookmarks reuse one stable image source across warm frames');
        assert.equal(new Set(evidence.frames.flatMap(sample => sample.icons.map(icon => `${icon.width}x${icon.height}`))).size, 1,
          'Favicon dimensions must remain stable through warm rendering');
        if (outputDir) {
          mkdirSync(outputDir, { recursive: true });
          await page.screenshot({ path: join(outputDir, 'favicon-warm.png') });
        }
        await page.click('.tab-item:nth-of-type(2) .tab-btn');
        await page.waitForFunction(() => document.querySelector('.speed-dial-title')?.textContent === 'Other category');
        await page.click('.tab-item:nth-of-type(1) .tab-btn');
        const restored = await page.evaluate(() => [...document.querySelectorAll('.speed-dial-icon img')].map(image => image.src));
        assert.equal(restored.length, 2);
        assert.ok(restored.every(src => src === sources[0]), 'Category switching keeps the existing cached source');
        const canonical = await page.evaluate(async () => {
          const stored = await (globalThis.browser || globalThis.chrome).storage.local.get(['midori_bookmarks', 'midori_bookmark_categories']);
          return { bookmarks: stored.midori_bookmarks.value, categories: stored.midori_bookmark_categories.value };
        });
        assert.deepEqual(canonical.categories, ['Fixture', 'Other']);
        assert.equal(canonical.bookmarks.Fixture.length, 2);
        assert.equal(canonical.bookmarks.Other.length, 1, 'The visible-category snapshot must not overwrite other canonical categories');
      }
      tabs.push(evidence);
      await page.close();
      page = null;
    }
    const network = await session.network.stop();
    const faviconRequests = network.filter(request => request.url.includes(DOMAIN) || request.url === fixtureUrl);
    assert.deepEqual(faviconRequests, [], 'Neither cached new tab may repeat favicon HTTP requests');
    assert.equal(requests.length, 1, 'The fixture HTTP download must not repeat');
    const report = { passed: true, fixture: 'Unchanged production FaviconService uses its fetchFn adapter to fetch a loopback PNG with native fetch and write real CacheStorage; installed BookmarkGrid creates the first-frame snapshot',
      fixtureRequests: requests, network: faviconRequests, tabs };
    if (outputDir) writeFileSync(join(outputDir, 'favicon-integration.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally {
    await page?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
