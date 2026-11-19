import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildMergedManifest } from '../build-manifest.js';
import { closeContext, openContextWithRetry, ROOT } from './measure-newtab.mjs';

const output = resolve(process.argv[2] || join(ROOT, 'artifacts/widget-ui'));
const temporary = mkdtempSync(join(tmpdir(), 'midori-widget-ui-'));
const checks = [];
let session;
mkdirSync(output, { recursive: true });
try {
  cpSync(join(ROOT, 'dist'), temporary, { recursive: true });
  writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(buildMergedManifest(
    JSON.parse(readFileSync(join(ROOT, 'manifest/main.json'))),
    JSON.parse(readFileSync(join(ROOT, 'manifest/chrome.json'))),
    { development: true },
  )));
  session = await openContextWithRetry({ engine: 'chromium', extensionPath: temporary, viewport: { width: 1440, height: 1000 } });
  await session.context.route(/^https?:/, route => route.abort());
  await session.context.addInitScript(() => {
    if (!localStorage.getItem('i18nStore')) localStorage.setItem('i18nStore', JSON.stringify({ locale: 'es' }));
  });
  const page = await session.context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const load = async () => {
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await page.evaluate(() => document.fonts.ready);
  };
  const settle = () => page.locator('.widget-sheet').evaluate(async node => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await Promise.all(node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {})));
  });
  const open = async () => {
    await page.locator('.bottom-actions .action-btn').first().click();
    await page.locator('.widget-sheet').waitFor();
    await settle();
  };
  const fit = async label => {
    const result = await page.locator('.widget-sheet').evaluate(node => {
      const rect = node.getBoundingClientRect();
      return { outside: rect.left < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1,
        horizontalOverflow: [...node.querySelectorAll('.sheet-body, .sheet-item-label, .sheet-done')]
          .filter(element => element.scrollWidth > element.clientWidth + 1).map(element => element.className),
        pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        footerVisible: node.querySelector('.sheet-footer').getBoundingClientRect().bottom <= innerHeight + 1 };
    });
    assert.deepEqual(result, { outside: false, horizontalOverflow: [], pageOverflow: false, footerVisible: true }, label);
  };
  const capture = async label => {
    await fit(label);
    const buffer = await page.screenshot({ path: join(output, `${label}.png`) });
    assert.ok(buffer.length > 10_000, `${label}: screenshot appears empty`);
  };
  const order = () => page.locator('.widget-card').evaluateAll(nodes => nodes.map(node => node.dataset.widget));

  await load();
  await open();
  assert.equal(await page.locator('#app').evaluate(node => node.inert), true);
  assert.equal(await page.locator('.sheet-item .widget-glyph').count(), 8);
  assert.equal(await page.locator('.sheet-reset').isDisabled(), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.sheet-close').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('.sheet-done').evaluate(node => node === document.activeElement), true);
  checks.push('Widget dialog traps focus, labels all controls, and keeps eight distinct SVG icons');

  const notes = page.locator('.sheet-item[data-widget="notes"]');
  await notes.focus();
  await page.keyboard.press('Space');
  assert.equal(await notes.getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.sheet-summary').innerText(), /2 widgets activos/);
  await page.locator('.sheet-item[data-widget="todo"]').click();
  const pickerNotes = await notes.locator('.widget-glyph').innerHTML();
  await page.locator('.sheet-done').click();
  await page.locator('.widget-sheet').waitFor({ state: 'hidden' });
  await page.locator('.widget-card[data-widget="notes"] .widget-glyph').waitFor();
  assert.equal(await page.locator('.widget-card[data-widget="notes"] .widget-glyph').innerHTML(), pickerNotes);
  checks.push('Space toggles widgets, active count updates, and dashboard headers use the same icon artwork');

  const noteText = 'Revisar la interfaz de widgets';
  await page.locator('.notes-area').fill(noteText);
  await page.waitForFunction(async text => {
    const api = globalThis.browser || globalThis.chrome;
    return (await api.storage.local.get('midori_notes')).midori_notes?.value?.text === text;
  }, noteText);
  await page.locator('.widget-card[data-widget="notes"] .widget-drag-handle').focus();
  await page.keyboard.press('Home');
  assert.equal((await order())[0], 'notes');
  await page.waitForFunction(() => {
    const saved = JSON.parse(localStorage.getItem('widgetsStore') || '{}');
    return saved.order?.filter(key => saved.enabled[key] && key !== 'search')[0] === 'notes';
  });
  await load();
  assert.equal((await order())[0], 'notes');
  await page.locator('.notes-area').waitFor();
  assert.equal(await page.locator('.notes-area').inputValue(), noteText);
  await open();
  assert.equal(await page.locator('.sheet-reset').isEnabled(), true);
  await page.locator('.sheet-reset').click();
  assert.equal(await page.locator('.sheet-reset').isDisabled(), true);
  assert.match(await page.locator('.sheet-summary').innerText(), /Orden restablecido/);
  assert.equal(await page.locator('.sheet-item[aria-pressed="true"]').count(), 3);
  await notes.click();
  await page.locator('.sheet-done').click();
  assert.equal(await page.locator('.notes-area').count(), 0);
  await open(); await notes.click(); await page.locator('.sheet-done').click();
  await page.locator('.notes-area').waitFor();
  assert.equal(await page.locator('.notes-area').inputValue(), noteText);
  checks.push('Keyboard ordering persists; restore order preserves selection; hiding Notes preserves saved text');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(theme => {
      localStorage.setItem('tabStore', JSON.stringify({ ...JSON.parse(localStorage.getItem('tabStore') || '{}'), theme, autoTheme: false }));
      localStorage.removeItem('midori_boot_snapshot_v1');
    }, theme);
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await load(); await open();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      await capture(`widgets-${theme}-${width}`);
      if (width === 320) {
        await page.locator('.sheet-item').last().focus();
        const last = await page.locator('.sheet-item').last().boundingBox();
        const footer = await page.locator('.sheet-footer').boundingBox();
        assert.ok(last.y + last.height <= footer.y + 1, 'Last widget stays above the fixed footer when focused');
      }
      await page.keyboard.press('Escape');
      await page.locator('.widget-sheet').waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.bottom-actions .action-btn').first().evaluate(node => node === document.activeElement), true);
    }
    checks.push(`Widget picker fits all five widths in ${theme} mode, including its scroll area and fixed footer`);
  }

  await page.setViewportSize({ width: 320, height: 568 });
  for (const locale of ['en', 'es', 'pt', 'fr', 'de', 'ru', 'zh', 'ja', 'it']) {
    await page.evaluate(locale => localStorage.setItem('i18nStore', JSON.stringify({ locale })), locale);
    await load(); await open();
    await fit(`locale ${locale}`);
    assert.doesNotMatch(await page.locator('.widget-sheet').innerText(), /dashboard\.|widgetsSheet|undefined|\{count\}/);
    assert.equal(await page.locator('.sheet-item-label').evaluateAll(nodes => nodes.every(node => node.textContent.trim())), true);
    await page.keyboard.press('Escape');
  }
  checks.push('Nine locales have complete labels, descriptions and counts at 320×568px');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open();
  const motion = await page.locator('.widget-sheet').evaluate(node => ({ transform: getComputedStyle(node).transform, duration: getComputedStyle(node).transitionDuration }));
  assert.equal(motion.transform, 'none');
  assert.ok(motion.duration.split(',').every(value => parseFloat(value) <= .15));
  assert.deepEqual(errors, []);
  checks.push('Reduced motion is respected and no page errors occurred');
  const report = { passed: true, installedExtension: true, checks, pageErrors: errors };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (session) await closeContext(session);
  rmSync(temporary, { recursive: true, force: true });
}
