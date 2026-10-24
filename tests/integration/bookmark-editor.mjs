import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { finishResourceObservation, readBundleGraph } from '../../scripts/critical-requests.mjs';

const CATEGORY_INPUT = '.dial-editor input[maxlength="40"]';
const TITLE_INPUT = '.dial-editor input[maxlength="80"]';
const URL_INPUT = '.dial-editor input[maxlength="2048"]';
const SAVE = '.editor-button--primary';
const CANCEL = '.editor-button--secondary';
const ADD_BOOKMARK = '.speed-dial-card--add .speed-dial-link';
const EDIT_BOOKMARK = '.card-actions .card-action-btn:first-child';

async function canonicalState(page) {
  return page.evaluate(async () => {
    const stored = await (globalThis.browser || globalThis.chrome).storage.local.get(['midori_bookmarks', 'midori_bookmark_categories']);
    return { bookmarks: stored.midori_bookmarks?.value, categories: stored.midori_bookmark_categories?.value };
  });
}

async function waitForSavedState(page, expected) {
  const deadline = Date.now() + 10_000;
  let actual;
  do {
    actual = await canonicalState(page);
    if (isDeepStrictEqual(actual, expected)) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  assert.deepEqual(actual, expected, 'Canonical extension storage must contain the complete saved bookmark state');
  assert.deepEqual(await canonicalState(page), expected);
}

async function observeBeforeClick(session, page) {
  const timing = await page.evaluate(() => ({ origin: location.href, start: performance.timeOrigin,
    resources: performance.getEntriesByType('resource').map(entry => entry.name) }));
  const native = await session.network.resources?.() || [];
  const urls = [...native.filter(entry => entry.scope !== 'background' && entry.startEpochMs >= timing.start - 1)
    .map(entry => entry.url), ...timing.resources];
  const origin = new URL(timing.origin);
  const paths = [...new Set(urls.map(value => new URL(value, origin))
    .filter(url => url.protocol === origin.protocol && url.host === origin.host)
    .map(url => url.pathname))].sort();
  assert.ok(paths.includes('/index.js'), 'Native/resource timing observation must see the real entry before proving editor absence');
  return { paths, nativeObservationCount: native.length, resourceTimingCount: timing.resources.length,
    source: native.length ? session.network.coverage.localExtensionResources : 'resource-timing' };
}

export async function runBookmarkEditorIntegration(session, { extensionPath, outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const report = { passed: false, transport: session.metadata?.transport, cases: [] };
  const original = { title: 'Existing fixture', url: 'https://bookmark-editor.example/original', domain: 'bookmark-editor.example' };
  const created = { title: 'Created through native input', url: 'https://bookmark-editor.example/created?source=integration', domain: 'bookmark-editor.example' };
  const updated = { title: 'Edited through native input', url: 'https://bookmark-editor.example/updated?source=integration', domain: 'bookmark-editor.example' };
  let page;
  let observing = false;
  try {
    const editorChunk = [...readBundleGraph(extensionPath).values()]
      .find(chunk => chunk.modules?.some(module => /\/BookmarkEditor\.vue(?:\?|$)/.test(module)));
    assert.ok(editorChunk, 'The production build must contain the extracted BookmarkEditor component');
    assert.notEqual(editorChunk.fileName, 'index.js', 'BookmarkEditor must stay outside the initial entry');
    const editorResources = [`/${editorChunk.fileName}`, ...(editorChunk.css || []).map(path => `/${path}`)];
    report.editorResources = editorResources;

    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['idle-complete']));
    await page.evaluate(async bookmark => {
      const records = { midori_bookmarks: { Fixture: [bookmark] }, midori_bookmark_categories: ['Fixture'] };
      const payload = Object.fromEntries(Object.entries(records).map(([key, value]) => [key,
        { value, updatedAt: Date.now(), __midoriStorageVersion: 1 }]));
      await (globalThis.browser || globalThis.chrome).storage.local.set(payload);
      for (const [key, value] of Object.entries(payload)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('midori_bookmark_snapshot_v1', JSON.stringify({ version: 1,
        categories: ['Fixture'], activeTab: 'Fixture', items: [bookmark] }));
      localStorage.setItem('tabStore', JSON.stringify({ theme: 'light', autoTheme: false,
        background: { type: 'Solid', default: false, color: '#eff8f3' }, showAds: false,
        showSpeedDials: true, showAddSpeedDialButton: true, showSpeedDialDeleteButton: true, widgetsEnabled: false }));
      localStorage.setItem('widgetsStore', JSON.stringify({ enabled: { search: true, privacy: false } }));
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
      localStorage.removeItem('midori_boot_snapshot_v1');
    }, original);
    await page.close();
    page = await session.context.newPage();
    await session.network.start();
    observing = true;
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])
      && Number.isFinite(window.__midoriPerf?.marks?.['idle-complete']) && !document.querySelector('.tab-add')?.disabled);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 750)));
    const initialState = { bookmarks: { Fixture: [original] }, categories: ['Fixture'] };
    assert.deepEqual(await canonicalState(page), initialState);
    report.beforeClick = await observeBeforeClick(session, page);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.dial-editor'))), false);
    assert.ok(editorResources.every(path => !report.beforeClick.paths.includes(path)),
      'Neither editor JavaScript nor editor CSS may be requested before the first user click');
    report.cases.push({ id: 'editor-code-and-css-absent-before-click', passed: true });

    await page.click('.tab-add');
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="40"]')));
    assert.equal(await page.evaluate(selector => document.activeElement === document.querySelector(selector), CATEGORY_INPUT), true,
      'The deferred editor must focus its first field when it appears');
    report.afterClick = await finishResourceObservation(session, page);
    observing = false;
    assert.ok(editorResources.every(path => report.afterClick.paths.includes(path)),
      'The actual click must load the editor JavaScript and its CSS');
    await page.fill(CATEGORY_INPUT, 'Discarded category');
    await page.click(CANCEL);
    await page.waitForFunction(() => !document.querySelector('.dial-editor'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 850)));
    assert.deepEqual(await canonicalState(page), initialState, 'Cancelling category creation must not modify canonical storage');
    report.cases.push({ id: 'deferred-editor-load-focus-and-category-cancel', passed: true });

    await page.click('.tab-add');
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="40"]')));
    await page.fill(CATEGORY_INPUT, 'Work');
    await page.click(SAVE);
    await page.waitForFunction(() => !document.querySelector('.dial-editor') && document.querySelector('.tab-item.active .tab-btn')?.textContent === 'Work');
    const categoryState = { bookmarks: { Fixture: [original], Work: [] }, categories: ['Fixture', 'Work'] };
    await waitForSavedState(page, categoryState);
    report.cases.push({ id: 'category-created-and-written-to-extension-storage', passed: true });

    await page.click(ADD_BOOKMARK);
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="80"]')));
    await page.fill(TITLE_INPUT, 'Discarded bookmark');
    await page.fill(URL_INPUT, 'https://bookmark-editor.example/discarded');
    await page.click(CANCEL);
    await page.waitForFunction(() => !document.querySelector('.dial-editor'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 850)));
    assert.deepEqual(await canonicalState(page), categoryState, 'Cancelling bookmark creation must not add an item');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.speed-dial-card:not(.speed-dial-card--add)').length), 0);
    report.cases.push({ id: 'new-bookmark-cancel-does-not-save', passed: true });

    await page.click(ADD_BOOKMARK);
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="80"]')));
    await page.fill(TITLE_INPUT, created.title);
    await page.fill(URL_INPUT, 'javascript:alert(1)');
    await page.click(SAVE);
    await page.waitForFunction(() => Boolean(document.querySelector('.editor-error')?.textContent.trim()));
    assert.deepEqual(await canonicalState(page), categoryState, 'A rejected URL must not modify canonical bookmarks');
    report.invalidUrlError = await page.evaluate(() => document.querySelector('.editor-error').textContent.trim());
    await page.fill(URL_INPUT, created.url);
    await page.click(SAVE);
    await page.waitForFunction(url => !document.querySelector('.dial-editor') && document.querySelector('.speed-dial-card:not(.speed-dial-card--add) a')?.href === url, created.url);
    const createdState = { bookmarks: { Fixture: [original], Work: [created] }, categories: ['Fixture', 'Work'] };
    await waitForSavedState(page, createdState);
    report.cases.push({ id: 'invalid-url-rejected-then-valid-bookmark-created', passed: true });

    await page.click(EDIT_BOOKMARK);
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="80"]')));
    assert.equal(await page.evaluate(selector => document.querySelector(selector).value, TITLE_INPUT), created.title);
    assert.equal(await page.evaluate(selector => document.querySelector(selector).value, URL_INPUT), created.url);
    await page.fill(TITLE_INPUT, 'Discarded edit');
    await page.fill(URL_INPUT, 'https://bookmark-editor.example/discarded-edit');
    await page.click(CANCEL);
    await page.waitForFunction(() => !document.querySelector('.dial-editor'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 850)));
    assert.deepEqual(await canonicalState(page), createdState, 'The edit draft must not mutate the bookmark when cancelled');
    assert.equal(await page.evaluate(() => document.querySelector('.speed-dial-card:not(.speed-dial-card--add) .speed-dial-title').textContent), created.title);

    await page.click(EDIT_BOOKMARK);
    await page.waitForFunction(() => Boolean(document.querySelector('.dial-editor input[maxlength="80"]')));
    assert.equal(await page.evaluate(selector => document.querySelector(selector).value, URL_INPUT), created.url,
      'Opening the editor again must restore the saved value after cancellation');
    await page.fill(TITLE_INPUT, updated.title);
    await page.fill(URL_INPUT, updated.url);
    await page.click(SAVE);
    await page.waitForFunction(() => !document.querySelector('.dial-editor'));
    const updatedState = { bookmarks: { Fixture: [original], Work: [updated] }, categories: ['Fixture', 'Work'] };
    await waitForSavedState(page, updatedState);
    report.cases.push({ id: 'edit-cancel-preserves-original-and-save-updates-existing-item', passed: true });
    if (outputDir) await page.screenshot({ path: join(outputDir, 'bookmark-edited.png') });

    await page.close();
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])
      && document.querySelectorAll('.tab-item').length === 2);
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('.tab-item .tab-btn')].map(button => button.textContent)), ['Fixture', 'Work']);
    await page.click('.tab-item:nth-of-type(2) .tab-btn');
    await page.waitForFunction(url => document.querySelector('.speed-dial-card:not(.speed-dial-card--add) a')?.href === url, updated.url);
    assert.deepEqual(await canonicalState(page), updatedState);
    report.reopened = await page.evaluate(() => ({ category: document.querySelector('.tab-item.active .tab-btn').textContent,
      links: [...document.querySelectorAll('.speed-dial-card:not(.speed-dial-card--add) a')].map(link => ({ url: link.href, title: link.querySelector('.speed-dial-title').textContent })) }));
    assert.deepEqual(report.reopened, { category: 'Work', links: [{ url: updated.url, title: updated.title }] });
    report.cases.push({ id: 'category-and-edited-bookmark-survive-new-tab-reopening', passed: true });
    if (outputDir) await page.screenshot({ path: join(outputDir, 'bookmark-reopened.png') });
    report.passed = true;
    return report;
  } catch (error) {
    report.error = error.stack || String(error);
    throw error;
  } finally {
    try {
      if (observing) await session.network.stop();
      if (outputDir) writeFileSync(join(outputDir, 'bookmark-editor.json'), `${JSON.stringify(report, null, 2)}\n`);
    } finally { await page?.close(); }
  }
}
