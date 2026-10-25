import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { configureProfile, hideAndReturn, openNewTab, sleep, startRemoteFixture, stopTracking, trackBoxes, waitUntil } from './remote-fixture.mjs';

const TINT = [214, 80, 80];
const near = color => Boolean(color) && color.every((value, index) => Math.abs(value - TINT[index]) <= 30);

function watchBackground() {
  const evidence = window.__backgroundWatch = { frames: 0, missing: 0, undecoded: 0, started: performance.now(), samples: [] };
  (function frame() {
    const image = document.querySelector('img.background');
    evidence.frames += 1;
    if (!image) evidence.missing += 1;
    else if (!image.complete || !image.naturalWidth) evidence.undecoded += 1;
    else if (getComputedStyle(image).opacity !== '1' || getComputedStyle(image).display === 'none') evidence.missing += 1;
    requestAnimationFrame(frame);
  })();
}

/** Minimizing, covering and restoring the New Tab must not move content, drop the wallpaper or start new requests. */
export async function runRestoreStabilityIntegration({ engine = 'firefox', extensionPath, outputDir }) {
  const fixture = await startRemoteFixture();
  const prepared = fixture.prepareExtension(extensionPath);
  const report = { passed: false };
  let session;
  let page;
  try {
    const { openContextWithRetry, closeContext, parseOptions } = await import('../../scripts/measure-newtab.mjs');
    session = await openContextWithRetry(parseOptions(['--engine', engine, '--dist', prepared.directory, '--smoke', '--reps', '1']));
    await configureProfile(session, { widgets: ['weather', 'currency', 'privacy'],
      tab: { background: { type: 'MarketplaceWallpaper', default: false, assetSlug: 'a', previewUrl: '',
        imageUrl: `${fixture.base}/asset/api/v1/assets/a/download`, authorName: 'Author A', authorUrl: 'https://example.com/a', sourceUrl: 'https://example.com/s' } },
      storage: { midori_weather_settings_v1: { unit: 'metric', latitude: 10, longitude: 10, locationLabel: 'Alpha, Fixture', locationSource: 'manual' },
        midori_currency_settings_v1: { from: 'USD', to: 'EUR', amountInput: '10' } } });
    page = await openNewTab(session);
    await page.waitForFunction(() => document.querySelector('.weather-temp')?.textContent.trim() === '31°C'
      && document.querySelector('.currency-value')?.textContent.trim() === '€9.00', null, { timeout: 25_000 });
    await waitUntil(async () => near(await page.evaluate(() => {
      const image = document.querySelector('img.background');
      if (!image?.complete || !image.naturalWidth) return null;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 8, 8);
      return [...context.getImageData(2, 2, 1, 1).data].slice(0, 3);
    })), 'The wallpaper is shown');
    await sleep(page, 1500);
    const settled = fixture.log.length;
    await page.evaluate(watchBackground);
    await trackBoxes(page, ['.widget-card[data-widget="weather"]', '.widget-card[data-widget="currency"]', '.widget-card[data-widget="privacy"]',
      '.speed-dial-grid', '.search-box, .search-form', '.credits']);
    report.cycles = [];
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const trip = await hideAndReturn(page, { hiddenMs: 800 });
      await sleep(page, 500);
      report.cycles.push({ kind: 'covering-tab', hiddenMs: trip.visibleAt - trip.hiddenAt });
    }
    await sleep(page, 400);
    // Covering the page keeps its size: nothing may move. Minimizing may change the window size, which the
    // responsive layout is allowed to follow (see resize-layout), so only continuity is checked there.
    const boxes = await stopTracking(page);
    if (typeof page.windowCommand === 'function') {
      for (const command of ['WebDriver:MinimizeWindow', 'WebDriver:MaximizeWindow']) {
        await page.windowCommand(command);
        await sleep(page, 900);
        report.cycles.push({ kind: command });
      }
    }
    await sleep(page, 800);
    const watch = await page.evaluate(() => window.__backgroundWatch);
    for (const [selector, range] of Object.entries(boxes)) {
      if (!range.frames) continue;
      assert.ok(range.maxHeight - range.minHeight <= 1 && range.maxTop - range.minTop <= 1 && range.maxLeft - range.minLeft <= 1,
        `Hiding and restoring must not move ${selector}: ${JSON.stringify(range)}`);
    }
    assert.ok(boxes['.widget-card[data-widget="weather"]'].frames > 20, 'Frames were observed after restoring');
    assert.equal(watch.missing + watch.undecoded, 0, `The wallpaper is present and decoded in every frame (${JSON.stringify(watch)})`);
    assert.equal(fixture.log.length, settled, `Valid data is not requested again on return: ${JSON.stringify(fixture.log.slice(settled).map(entry => `${entry.service}${entry.path}`))}`);
    assert.equal(await page.evaluate(() => window.__integrationBlobs.size), 1, 'Only the displayed wallpaper holds a blob URL after the cycles');
    assert.deepEqual(page.errors, []);
    report.boxes = boxes;
    report.background = watch;
    report.passed = true;
    return report;
  } finally {
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'restore-stability.json'), `${JSON.stringify(report, null, 2)}\n`);
    }
    await page?.close().catch(() => {});
    try { if (session) { const { closeContext } = await import('../../scripts/measure-newtab.mjs'); await closeContext(session); } }
    finally { await fixture.close(); prepared.cleanup(); }
  }
}
