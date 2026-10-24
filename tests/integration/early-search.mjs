import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeContext, openContextWithRetry } from '../../scripts/measure-newtab.mjs';

export function prepareEarlySearchFixture(directory) {
  const path = join(directory, 'index.html');
  const html = readFileSync(path, 'utf8');
  assert.match(html, /src="\/index\.js"/);
  writeFileSync(path, html.replace('src="/index.js"', 'src="/integration-hold-main.js"'));
  writeFileSync(join(directory, 'integration-hold-main.js'),
    "window.__releaseMidoriMain = () => import('./index.js');\n");
}

async function waitForSearchUrl(page, query) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const url = new URL(await page.url());
    if (url.origin === 'https://astiango.com' && url.searchParams.get('q') === query) {
      for (const [key, value] of Object.entries({ client: 'midoritab', omnibar: '1', qbc: '1' })) {
        assert.equal(url.searchParams.get(key), value);
      }
      return url.href;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Native early search did not navigate to the expected AstianGO URL');
}

export async function runEarlySearchIntegration({ engine, extensionPath, outputDir }) {
  const directory = mkdtempSync(join(tmpdir(), 'midori-early-search-'));
  let session;
  try {
    cpSync(extensionPath, directory, { recursive: true });
    prepareEarlySearchFixture(directory);
    session = await openContextWithRetry({ engine, extensionPath: directory });
    return await runEarlySearchSessionIntegration(session, { outputDir });
  } finally {
    if (session) {
      await closeContext(session);
      assert.equal(existsSync(session.profile), false, 'The early-search profile must be deleted');
    }
    rmSync(directory, { recursive: true, force: true });
  }
}

export async function runEarlySearchSessionIntegration(session, { outputDir } = {}) {
  const page = await session.context.newPage();
  const cases = [];
  const goto = async () => {
    await page.goto(session.url);
    await page.waitForFunction(() => typeof window.__releaseMidoriMain === 'function');
  };
  try {
    await goto();
    await page.evaluate(() => {
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'es' }));
      localStorage.setItem('tabStore', JSON.stringify({ theme: 'dark', openLink: 'Self Tab', density: 'comfortable' }));
      localStorage.setItem('midori_boot_snapshot_v1', JSON.stringify({ version: 1, theme: 'dark', density: 'comfortable' }));
    });
    await goto();
    await page.fill('#early-search-input', 'texto !w Midori');
    const before = await page.evaluate(() => {
      const input = document.getElementById('early-search-input');
      input.setSelectionRange(6, 8, 'backward');
      const bounds = input.getBoundingClientRect();
      return { value: input.value, focused: document.activeElement === input,
        selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
        placeholder: input.placeholder, locale: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
        color: getComputedStyle(input).color, background: getComputedStyle(input.parentElement).backgroundColor,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        mainStarted: Boolean(window.__midoriPerf), earlyReadyAt: window.__midoriEarlySearch.readyAt };
    });
    assert.equal(before.mainStarted, false, 'The early input must work before the application entry executes');
    assert.equal(before.focused, true);
    assert.equal(before.locale, 'es');
    assert.equal(before.theme, 'dark');
    await page.evaluate(() => window.__releaseMidoriMain());
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
    const after = await page.evaluate(() => {
      const input = document.querySelector('.search-input');
      const bounds = input.getBoundingClientRect();
      return { value: input.value, focused: document.activeElement === input,
        selection: [input.selectionStart, input.selectionEnd, input.selectionDirection],
        placeholder: input.placeholder, locale: document.documentElement.lang,
        theme: document.documentElement.dataset.theme,
        color: getComputedStyle(input).color, background: getComputedStyle(input.parentElement).backgroundColor,
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        inputCount: document.querySelectorAll('.search-input').length,
        marks: window.__midoriPerf.marks };
    });
    for (const key of ['value', 'focused', 'selection', 'placeholder', 'locale', 'theme', 'color', 'background']) {
      assert.deepEqual(after[key], before[key], `Handoff must preserve ${key}`);
    }
    assert.equal(after.inputCount, 1, 'Only one search input must remain after handoff');
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(after.bounds[key] - before.bounds[key]) <= 1, `Search ${key} moved during handoff: ${before.bounds[key]} -> ${after.bounds[key]}`);
    }
    cases.push({ id: 'delayed-main-native-input-and-handoff', before, after });

    for (const preference of [
      { locale: 'en', theme: 'light', density: 'compact', autoTheme: false },
      { locale: 'ja', theme: 'dark', density: 'compact', autoTheme: true },
    ]) {
      const expectedTheme = await page.evaluate(settings => {
        const resolved = settings.autoTheme ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : settings.theme;
        const saved = { ...settings, theme: settings.autoTheme ? (resolved === 'light' ? 'dark' : 'light') : settings.theme };
        localStorage.setItem('i18nStore', JSON.stringify({ locale: saved.locale }));
        localStorage.setItem('tabStore', JSON.stringify({ ...saved, openLink: 'Self Tab' }));
        localStorage.setItem('midori_boot_snapshot_v1', JSON.stringify({ version: 1, ...saved }));
        return resolved;
      }, preference);
      await goto();
      await page.fill('#early-search-input', 'layout integration');
      const initial = await page.evaluate(() => {
        const rect = document.getElementById('early-search-input').getBoundingClientRect();
        const observer = new MutationObserver(() => {
          const logo = document.querySelector('#app .logo');
          if (!logo) return;
          window.__firstVueLogo = { classes: logo.className, filter: getComputedStyle(logo).filter };
          observer.disconnect();
        });
        observer.observe(document.getElementById('app'), { childList: true, subtree: true });
        return { bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          theme: document.documentElement.dataset.theme, locale: document.documentElement.lang,
          logoFilter: getComputedStyle(document.querySelector('.early-logo')).filter };
      });
      assert.equal(initial.theme, expectedTheme);
      assert.equal(initial.locale, preference.locale);
      await page.evaluate(() => window.__releaseMidoriMain());
      await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
      const hydrated = await page.evaluate(() => {
        const input = document.querySelector('.search-input');
        const rect = input.getBoundingClientRect();
        return { bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          theme: document.documentElement.dataset.theme, locale: document.documentElement.lang,
          focused: document.activeElement === input, text: input.value, firstVueLogo: window.__firstVueLogo };
      });
      assert.equal(hydrated.theme, expectedTheme, 'Vue must preserve the resolved automatic theme');
      assert.equal(hydrated.locale, preference.locale);
      assert.equal(hydrated.focused, true);
      assert.equal(hydrated.text, 'layout integration');
      assert.equal(hydrated.firstVueLogo?.filter, initial.logoFilter, 'The first Vue logo must use the same resolved theme as the early logo');
      for (const key of ['x', 'y', 'width', 'height']) {
        assert.ok(Math.abs(hydrated.bounds[key] - initial.bounds[key]) <= 1, `Compact search ${key} moved: ${initial.bounds[key]} -> ${hydrated.bounds[key]}`);
      }
      cases.push({ id: preference.autoTheme ? 'automatic-theme-compact-handoff' : 'light-compact-handoff', preference, initial, hydrated });
    }

    await goto();
    await page.fill('#early-search-input', '日本語');
    await page.evaluate(() => document.getElementById('early-search-input').dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    await page.evaluate(() => window.__releaseMidoriMain());
    await page.waitForFunction(() => Boolean(document.querySelector('#app .search-input')), null, { timeout: 20_000 });
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'early-search-input', 'Mounting Vue must not interrupt active composition');
    await page.evaluate(() => {
      const input = document.getElementById('early-search-input');
      input.value = '日本語検索';
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '検索' }));
      input.dispatchEvent(new InputEvent('input', { bubbles: true, data: '検索' }));
    });
    await page.waitForFunction(() => !document.getElementById('early-search-input'));
    assert.equal(await page.evaluate(() => document.querySelector('.search-input').value), '日本語検索');
    cases.push({ id: 'composition-handoff', eventSource: 'CompositionEvent/InputEvent dispatched in the real browser; native OS IME not automated' });

    await goto();
    await page.evaluate(() => {
      sessionStorage.setItem('early-submit-count', '0');
      document.getElementById('early-search-form').addEventListener('submit', event => {
        if (!event.defaultPrevented) sessionStorage.setItem('early-submit-count', String(Number(sessionStorage.getItem('early-submit-count')) + 1));
      });
    });
    await page.fill('#early-search-input', '   ');
    await page.click('#early-search-form .search-btn');
    assert.equal(await page.url(), session.url, 'An empty query must keep the new tab open');
    const query = '!w Midori integration';
    await page.fill('#early-search-input', query);
    await page.click('#early-search-form .search-btn');
    const searchUrl = await waitForSearchUrl(page, query);
    await goto();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('early-submit-count')), '1');
    cases.push({ id: 'early-native-search-before-vue', searchUrl, submissions: 1, backendResponseRequired: false });

    await page.evaluate(() => {
      const tab = JSON.parse(localStorage.getItem('tabStore'));
      tab.openLink = 'New Tab';
      localStorage.setItem('tabStore', JSON.stringify(tab));
    });
    await goto();
    const existingTabs = await page.evaluate(async () => (await (globalThis.browser || chrome).tabs.query({})).map(tab => tab.id));
    await page.fill('#early-search-input', 'Midori early new tab');
    await page.click('#early-search-form .search-btn');
    let observedTabs;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const tabs = await page.evaluate(async ids => (await (globalThis.browser || chrome).tabs.query({}))
        .filter(tab => !ids.includes(tab.id)).map(tab => ({ id: tab.id, url: tab.url || '', pendingUrl: tab.pendingUrl || '' })), existingTabs);
      const observed = tabs.map(tab => ({ ...tab, destination: [tab.url, tab.pendingUrl].find(value => {
        if (!value) return false;
        const url = new URL(value);
        return url.origin === 'https://astiango.com' && url.searchParams.get('q') === 'Midori early new tab';
      }) }));
      if (observed.some(tab => tab.destination)) {
        observedTabs = observed;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.ok(observedTabs, 'The native new-tab search must expose its AstianGO destination');
    const opened = {
      observed: observedTabs,
      currentIds: await page.evaluate(async ids => (await (globalThis.browser || chrome).tabs.query({}))
        .filter(tab => !ids.includes(tab.id)).map(tab => tab.id), existingTabs),
    };
    assert.equal(opened.observed.length, 1, 'Early search with New Tab selected must create exactly one tab');
    assert.deepEqual(opened.currentIds, [opened.observed[0].id], 'The observed destination must remain the only new tab');
    const openedUrl = new URL(opened.observed[0].destination);
    assert.equal(openedUrl.origin, 'https://astiango.com');
    assert.equal(openedUrl.searchParams.get('q'), 'Midori early new tab');
    await page.evaluate(async ids => { await (globalThis.browser || chrome).tabs.remove(ids); }, opened.currentIds);
    await page.evaluate(() => window.__releaseMidoriMain());
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
    assert.equal(await page.evaluate(() => document.querySelector('.search-input').value), '', 'An early submission must not be replayed by Vue');
    cases.push({ id: 'early-search-new-tab-target', openedTabs: opened.currentIds.length, observedUrl: openedUrl.href,
      urlSource: opened.observed[0].destination === opened.observed[0].url ? 'url' : 'pendingUrl' });

    const result = { passed: true, transport: session.metadata?.transport, viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })), cases };
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'early-search.json'), `${JSON.stringify(result, null, 2)}\n`);
    }
    return result;
  } finally { await page.close(); }
}
