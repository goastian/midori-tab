import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildMergedManifest } from '../build-manifest.js';
import { closeContext, openContextWithRetry, ROOT } from './measure-newtab.mjs';

const output = resolve(process.argv[2] || join(ROOT, 'artifacts/ecosystem-ui'));
const temporary = mkdtempSync(join(tmpdir(), 'midori-ecosystem-ui-'));
const checks = [];
let session;
mkdirSync(output, { recursive: true });

try {
  cpSync(join(ROOT, 'dist'), temporary, { recursive: true });
  const manifest = buildMergedManifest(
    JSON.parse(readFileSync(join(ROOT, 'manifest/main.json'))),
    JSON.parse(readFileSync(join(ROOT, 'manifest/chrome.json'))),
    { development: true },
  );
  writeFileSync(join(temporary, 'manifest.json'), JSON.stringify(manifest));
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
    await page.locator('.top-btn').nth(1).waitFor();
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await page.evaluate(() => document.fonts.ready);
  };
  const openQuick = async () => { await page.locator('.top-btn').nth(1).click(); await page.locator('.quick-panel').waitFor(); };
  const openSettings = async () => { await openQuick(); await page.locator('.open-start-page').click(); await page.locator('.panel').waitFor(); };
  const capture = async name => {
    const screenshot = await page.screenshot({ path: join(output, `${name}.png`) });
    assert.ok(screenshot.length > 10_000, `${name}: screenshot appears empty`);
  };
  const assertViewport = async name => {
    await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const panels = [...document.querySelectorAll('.apps-overlay, .quick-overlay, .panel-overlay')];
      await Promise.all(panels.flatMap(panel => panel.getAnimations({ subtree: true }))
        .map(animation => animation.finished.catch(() => {})));
    });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `${name}: document overflow ${overflow}px`);
    const outside = await page.locator('.apps-panel, .quick-panel, .panel').evaluateAll(nodes => nodes.filter(node => {
      const rect = node.getBoundingClientRect(); return rect.left < -1 || rect.right > innerWidth + 1;
    }).map(node => node.className));
    assert.deepEqual(outside, [], `${name}: panel exceeds viewport`);
    const clipped = await page.locator('.apps-grid, .quick-content, .panel-content').evaluateAll(nodes =>
      nodes.filter(node => node.scrollWidth > node.clientWidth + 1).map(node => node.className));
    assert.deepEqual(clipped, [], `${name}: panel content overflows horizontally`);
  };

  await load();
  await page.locator('.hamburger-btn').click();
  await page.locator('.apps-panel').waitFor();
  assert.equal(await page.locator('#app').evaluate(node => node.inert), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.locator('.apps-footer__link').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.apps-close').evaluate(node => node === document.activeElement), true);
  await page.keyboard.press('Escape');
  await page.locator('.apps-panel').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.hamburger-btn').evaluate(node => node === document.activeElement), true);
  checks.push('Menu focus stays contained; Escape restores the hamburger trigger');

  await openQuick();
  const speedDials = page.getByRole('switch', { name: 'Mostrar Speed Dials', exact: true });
  await speedDials.focus();
  await page.keyboard.press('Space');
  assert.equal(await speedDials.getAttribute('aria-checked'), 'false');
  await page.keyboard.press('Space');
  await page.locator('#quick-speed-dial-columns').selectOption('4');
  await page.locator('.open-start-page').click();
  await page.locator('.panel').waitFor();
  assert.equal(await page.locator('#settings-speed-dial-columns').inputValue(), '4');
  checks.push('Switch keyboard activation and native select values stay in sync across panels');

  await page.locator('.panel-tab').nth(2).click();
  const background = page.locator('.dropdown-button');
  await background.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  assert.equal(await background.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('.panel').count(), 1);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  assert.match(await background.innerText(), /Carpeta local/);
  await page.keyboard.press('Escape');
  await page.locator('.panel').waitFor({ state: 'hidden' });
  await load();
  await openSettings();
  assert.equal(await page.locator('#settings-speed-dial-columns').inputValue(), '4');
  await page.locator('.panel-tab').nth(2).click();
  assert.match(await page.locator('.dropdown-button').innerText(), /Carpeta local/);
  checks.push('Custom combobox supports arrows, End, Enter, Escape and persists after reopening');

  await page.locator('.panel-tab').nth(3).click();
  const selectedLanguage = page.locator('.lang-card[aria-checked="true"]');
  await selectedLanguage.focus();
  const scrollBefore = await page.locator('.panel-content').evaluate(node => node.scrollTop);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.documentElement.lang === 'en');
  assert.equal(await page.locator('.lang-card').nth(1).getAttribute('aria-checked'), 'true');
  await page.keyboard.press('Home');
  await page.waitForFunction(() => document.documentElement.lang === 'es');
  assert.equal(await page.locator('.panel-content').evaluate(node => node.scrollTop), scrollBefore);
  checks.push('Language radios support roving keyboard selection without scrolling the page');
  await page.keyboard.press('Escape');

  for (const theme of ['light', 'dark']) {
    await page.evaluate(mode => {
      const settings = JSON.parse(localStorage.getItem('tabStore') || '{}');
      settings.theme = mode; settings.autoTheme = false;
      localStorage.setItem('tabStore', JSON.stringify(settings));
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'es' }));
      localStorage.removeItem('midori_boot_snapshot_v1');
    }, theme);
    for (const width of [320, 375, 414, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await load();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      await assertViewport(`home ${width} ${theme}`);
      await capture(`home-${theme}-${width}`);
      await page.locator('.hamburger-btn').click();
      await page.locator('.apps-panel').waitFor();
      await assertViewport(`apps ${width} ${theme}`);
      assert.equal(await page.locator('html').evaluate(node => getComputedStyle(node).filter), 'none');
      assert.equal(await page.locator('.apps-brand-light').isVisible(), theme === 'dark');
      await capture(`menu-${theme}-${width}`);
      await page.keyboard.press('Escape');
      await openQuick();
      await assertViewport(`quick ${width} ${theme}`);
      await capture(`quick-${theme}-${width}`);
      await page.locator('.open-start-page').click();
      await page.locator('.panel').waitFor();
      await assertViewport(`settings ${width} ${theme}`);
      await page.locator('.panel-tab').nth(2).click();
      await page.locator('.dropdown-button').click();
      await assertViewport(`combobox ${width} ${theme}`);
      await capture(`settings-${theme}-${width}`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Escape');
      checks.push(`Home, menu, quick settings and controls fit ${width}px in ${theme} mode`);
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await load();
  await openQuick();
  const motion = await page.locator('.quick-panel').evaluate(node => ({ transform: getComputedStyle(node).transform, duration: getComputedStyle(node).transitionDuration }));
  assert.equal(motion.transform, 'none');
  assert.ok(motion.duration.split(',').every(value => parseFloat(value) <= .15));
  checks.push('Reduced motion removes spatial panel movement');
  assert.deepEqual(errors, []);
  const report = { passed: true, checks, consoleErrors: errors, installedExtension: true };
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (session) await closeContext(session);
  rmSync(temporary, { recursive: true, force: true });
}
