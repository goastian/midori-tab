import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureProfile, openNewTab, seedStorage, sleep, startRemoteFixture, waitUntil } from './remote-fixture.mjs';
import { fixturePng } from './startup-visual.mjs';

const TINT = { a: [214, 80, 80], b: [60, 110, 220], c: [60, 190, 90] };
const near = (color, tint) => Boolean(color) && color.every((value, index) => Math.abs(value - tint[index]) <= 30);

const shownColor = page => page.evaluate(() => {
  const image = document.querySelector('img.background');
  if (!image?.complete || !image.naturalWidth) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 8;
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, 8, 8);
  const [red, green, blue] = context.getImageData(2, 2, 1, 1).data;
  return [red, green, blue];
});
const liveBlobs = page => page.evaluate(() => window.__integrationBlobs.size);
const changeBackground = (page, background) => page.evaluate(next => document.querySelector('#app').__vue_app__
  .config.globalProperties.$pinia._s.get('tabStore').changeBackground(next), background);
const waitColor = (page, tint, label) => waitUntil(async () => near(await shownColor(page), tint), label);

async function seedLocalLibrary(page, images) {
  await page.evaluate(async list => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('midori-local-wallpapers', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('images', 'readwrite');
      const store = transaction.objectStore('images');
      store.clear();
      for (const item of list) {
        const bytes = Uint8Array.from(atob(item.base64), character => character.charCodeAt(0));
        store.add({ id: item.id, name: item.id, type: 'image/png', blob: new Blob([bytes], { type: 'image/png' }), width: 320, height: 180 });
      }
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  }, images.map(item => ({ id: item.id, base64: item.png.toString('base64') })));
}

export async function runWallpaperLifecycleIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const fixture = await startRemoteFixture();
  const prepared = fixture.prepareExtension(extensionPath);
  const report = { passed: false, cases: [] };
  const record = (id, evidence = {}) => report.cases.push({ id, status: 'passed', ...evidence });
  const pages = [];
  let session;
  const open = async options => { const page = await openNewTab(session, options); pages.push(page); return page; };
  const closeAll = async () => { while (pages.length) await pages.pop().close().catch(() => {}); };
  const reset = async options => {
    await closeAll();
    fixture.clearRules();
    await configureProfile(session, options);
    await new Promise(resolve => setTimeout(resolve, 200));
    fixture.log.length = 0;
  };
  const marketplace = (name, author) => ({ type: 'MarketplaceWallpaper', default: false, assetSlug: name, previewUrl: '',
    imageUrl: `${fixture.base}/asset/api/v1/assets/${name}/download`, authorName: author, authorUrl: `https://example.com/${name}`,
    sourceUrl: `https://example.com/source-${name}` });
  const local = { type: 'LocalFolder', default: false };
  try {
    const { openContextWithRetry, closeContext, parseOptions } = await import('../../scripts/measure-newtab.mjs');
    session = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', prepared.directory, '--smoke', '--reps', '1']));

    // Changing A to B: the late arrival of A never shows and leaves no blob URL behind.
    await reset({ widgets: [], tab: { background: marketplace('a', 'Author A') } });
    fixture.rule('asset', { mode: 'delay', delayMs: 2500, times: 1 });
    let page = await open();
    await waitUntil(() => fixture.requests('asset').length === 1, 'The first wallpaper download must be in flight');
    await changeBackground(page, marketplace('b', 'Author B'));
    await waitColor(page, TINT.b, 'The second wallpaper is shown');
    await sleep(page, 3200);
    assert.ok(near(await shownColor(page), TINT.b), 'The wallpaper that was replaced never appears when it finally arrives');
    assert.equal(await page.evaluate(() => document.querySelector('.credits a')?.textContent), 'Author B', 'The credits belong to the shown wallpaper');
    assert.equal(await liveBlobs(page), 1, 'Only the shown wallpaper keeps a blob URL');
    const slow = fixture.requests('asset')[0];
    assert.ok(slow.abortedAt, 'The replaced download is cancelled instead of finishing in the background');
    record('nt17-marketplace-replaced-wallpaper-never-shows', { abortedAfterMs: slow.abortedAt - slow.at, liveBlobs: 1 });

    // Reopening reuses the valid cache: no request, one blob.
    const downloads = fixture.requests('asset').length;
    await page.close(); pages.pop();
    page = await open();
    await waitColor(page, TINT.b, 'The cached wallpaper is shown on reopening');
    await waitUntil(async () => (await liveBlobs(page)) === 1, 'The cached wallpaper replaces its preview with one blob URL');
    await sleep(page, 500);
    assert.equal(fixture.requests('asset').length, downloads, 'The cached wallpaper is not downloaded again');
    assert.equal(await liveBlobs(page), 1);
    await page.close(); pages.pop();
    page = await open();
    await waitColor(page, TINT.b, 'The cached wallpaper is shown again');
    await waitUntil(async () => (await liveBlobs(page)) === 1, 'The second reopening also ends with one blob URL');
    assert.equal(fixture.requests('asset').length, downloads, 'A second reopening does not download either');
    record('nt17-marketplace-cache-reused-on-reopen', { downloads });

    // Local library: blob URLs follow the displayed wallpaper.
    await reset({ widgets: [], tab: { background: local } });
    page = await open();
    await seedLocalLibrary(page, [{ id: 'full-0', png: fixturePng(TINT.a) }, { id: 'full-1', png: fixturePng(TINT.b) }]);
    await page.close(); pages.pop();
    page = await open();
    await waitUntil(async () => near(await shownColor(page), TINT.a) || near(await shownColor(page), TINT.b), 'A local wallpaper is shown');
    assert.equal(await liveBlobs(page), 1);
    await changeBackground(page, { type: 'Solid', default: false, color: '#10201b' });
    await waitUntil(async () => (await liveBlobs(page)) === 0, 'Leaving the local folder releases its blob URL');
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('img.background'))), false);
    for (let index = 0; index < 4; index += 1) await changeBackground(page, local);
    await waitUntil(async () => near(await shownColor(page), TINT.a) || near(await shownColor(page), TINT.b), 'A local wallpaper is shown again');
    await sleep(page, 600);
    assert.equal(await liveBlobs(page), 1, 'Repeated changes keep exactly one blob URL');
    const created = await page.evaluate(() => window.__integrationBlobLog.filter(entry => entry.event === 'create').length);
    const revoked = await page.evaluate(() => window.__integrationBlobLog.filter(entry => entry.event === 'revoke').length);
    assert.equal(created - revoked, 1, 'Every blob URL created was either shown or revoked');
    record('nt17-local-folder-blob-urls-released', { created, revoked });

    // A slow Marketplace wallpaper replaced by the local folder never takes over.
    fixture.rule('asset', { mode: 'delay', delayMs: 2200, times: 1 });
    await changeBackground(page, marketplace('c', 'Author C'));
    await waitUntil(() => fixture.requests('asset').some(entry => entry.path.includes('/c/')), 'The slow download must start');
    await changeBackground(page, local);
    await waitUntil(async () => near(await shownColor(page), TINT.a) || near(await shownColor(page), TINT.b), 'The local wallpaper is shown');
    await sleep(page, 2800);
    const finalColor = await shownColor(page);
    assert.ok(near(finalColor, TINT.a) || near(finalColor, TINT.b), `The slow wallpaper never replaces the selected one (${finalColor})`);
    assert.equal(await liveBlobs(page), 1);
    record('nt17-slow-remote-replaced-by-local-never-shows');

    // The next preview prepared for Unsplash is cancelled when the background changes.
    await reset({ widgets: [], tab: { background: { type: 'Unsplash', default: true, class: 'bg-orange' } } });
    const catalog = ['green', 'blue'].map(name => ({ url: `${fixture.base}/img/${name}.png`, srcSet: '', author: `Fixture ${name}`,
      authorLink: 'https://example.com/author', imagePage: 'https://example.com/wallpaper' }));
    let configure = await session.context.newPage();
    await configure.goto(new URL('/integration-blank.html', session.url).href);
    await seedStorage(configure, { unsplash_cache_images: catalog });
    await configure.evaluate(() => {
      localStorage.setItem('unsplash_cache_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
      localStorage.setItem('unsplash_cache_index', '0');
    });
    await configure.close();
    fixture.log.length = 0;
    page = await open();
    await waitUntil(() => fixture.requests('img').some(entry => entry.path === '/green.png'), 'The selected wallpaper is requested');
    await changeBackground(page, { type: 'Solid', default: false, color: '#10201b' });
    await sleep(page, 5000);
    assert.equal(fixture.requests('img').filter(entry => entry.path === '/blue.png').length, 0,
      'The preview of the next wallpaper is not downloaded after leaving Unsplash');
    record('nt17-next-preview-cancelled-after-background-change');

    // Favicons of the previous category stop when another category is opened.
    await reset({ widgets: [], tab: {}, storage: {
      midori_bookmark_categories: ['First', 'Second'],
      midori_bookmarks: {
        First: ['one', 'two', 'three', 'four'].map(name => ({ title: name, url: `https://${name}.first.example/`, domain: `${name}.first.example` })),
        Second: ['five', 'six'].map(name => ({ title: name, url: `https://${name}.second.example/`, domain: `${name}.second.example` })),
      } } });
    fixture.rule('icons', { mode: 'delay', delayMs: 1500 });
    page = await open({ until: () => document.querySelectorAll('.speed-dial-link').length >= 4 });
    await waitUntil(() => fixture.requests('icons').length >= 2, 'The icons of the first category must be requested');
    await page.click('.tab-item:nth-of-type(2) .tab-btn');
    await page.waitForFunction(() => document.querySelector('.speed-dial-title')?.textContent === 'five');
    const switchedAt = Date.now();
    await waitUntil(() => fixture.requests('icons').filter(entry => entry.path.includes('.first.')).every(entry => entry.abortedAt || entry.doneAt), 'The requests of the previous category end', 4000);
    await waitUntil(() => ['five', 'six'].every(name => fixture.requests('icons').some(entry => entry.path.includes(`${name}.second.`))), 'The icons of the new category are requested');
    await sleep(page, 2200);
    const firstRequested = fixture.requests('icons').filter(entry => entry.path.includes('.first.'));
    assert.ok(firstRequested.length <= 2, `Icons still waiting in the queue are not requested (${firstRequested.length})`);
    assert.ok(firstRequested.every(entry => entry.abortedAt && entry.abortedAt <= switchedAt + 1000), 'Running icon requests of the previous category are cancelled');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.speed-dial-icon img').length), 2, 'The new category shows its icons');
    assert.equal(await liveBlobs(page), 0, 'Icons use no blob URLs');
    record('nt17-favicons-cancelled-when-category-changes', { requestedFirst: firstRequested.length });

    // Local library import: failures keep the previous library.
    const chunk = readdirSync(join(prepared.directory, 'assets')).find(file => /^LocalWallpaperService-.*\.js$/.test(file));
    assert.ok(chunk, 'The local wallpaper service must have its own chunk');
    await reset({ widgets: [] });
    page = await open();
    const good = [fixturePng(TINT.a).toString('base64'), fixturePng(TINT.b).toString('base64')];
    const outcome = await page.evaluate(async ({ file, images }) => {
      const api = globalThis.browser || globalThis.chrome;
      const service = await import(api.runtime.getURL(`assets/${file}`));
      const toFile = (base64, name) => new File([Uint8Array.from(atob(base64), character => character.charCodeAt(0))], name, { type: 'image/png' });
      const corrupt = () => new File([new Uint8Array(600).fill(7)], 'corrupt.png', { type: 'image/png' });
      const library = () => new Promise((resolve, reject) => {
        const request = indexedDB.open('midori-local-wallpapers', 1);
        request.onsuccess = () => {
          const read = request.result.transaction('images').objectStore('images').getAll();
          read.onsuccess = () => { request.result.close(); resolve(read.result.map(item => `${item.id}:${item.blob.size}`).sort()); };
          read.onerror = () => reject(read.error);
        };
      });
      const attempt = async files => { try { return { saved: await service.saveLocalWallpapers(files) }; } catch (error) { return { error: error.name || String(error) }; } };
      const result = {};
      result.first = await attempt([toFile(images[0], 'a.png'), toFile(images[1], 'b.png')]);
      result.original = await library();
      result.onlyCorrupt = await attempt([corrupt()]);
      result.afterCorrupt = await library();
      const add = IDBObjectStore.prototype.add;
      IDBObjectStore.prototype.add = function () { throw new DOMException('quota', 'QuotaExceededError'); };
      try { result.quota = await attempt([toFile(images[0], 'a.png')]); } finally { IDBObjectStore.prototype.add = add; }
      result.afterQuota = await library();
      IDBObjectStore.prototype.add = function (record) { add.call(this, record); return add.call(this, record); };
      try { result.constraint = await attempt([toFile(images[0], 'a.png')]); } finally { IDBObjectStore.prototype.add = add; }
      result.afterConstraint = await library();
      result.mixed = await attempt([toFile(images[1], 'b.png'), corrupt(), toFile(images[0], 'a.png')]);
      result.afterMixed = await library();
      result.count = await service.countLocalWallpapers();
      return result;
    }, { file: chunk, images: good });
    assert.equal(outcome.first.saved, 2);
    assert.ok(outcome.original.length >= 2, `The first library has its images: ${outcome.original}`);
    assert.deepEqual(outcome.onlyCorrupt, { saved: 0 }, 'An import without any usable image reports zero');
    assert.deepEqual(outcome.afterCorrupt, outcome.original, 'A corrupt import keeps the previous library');
    assert.ok(outcome.quota.error, `A write that fails immediately is reported: ${JSON.stringify(outcome.quota)}`);
    assert.deepEqual(outcome.afterQuota, outcome.original, 'A storage failure keeps the previous library');
    assert.ok(outcome.constraint.error, `A write that fails inside the transaction is reported: ${JSON.stringify(outcome.constraint)}`);
    assert.deepEqual(outcome.afterConstraint, outcome.original, 'A transaction that aborts rolls the clear back');
    assert.equal(outcome.mixed.saved, 2, 'A damaged file is skipped, the usable ones are kept');
    assert.equal(outcome.count, 2);
    record('nt17-local-import-failures-keep-previous-library', { library: outcome.original });

    report.passed = true;
    return report;
  } finally {
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'wallpaper-lifecycle.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    await closeAll();
    try { if (session) { const { closeContext } = await import('../../scripts/measure-newtab.mjs'); await closeContext(session); } }
    finally { await fixture.close(); prepared.cleanup(); }
  }
}

