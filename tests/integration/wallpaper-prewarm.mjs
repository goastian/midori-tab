import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixturePng } from './startup-visual.mjs';

export async function runWallpaperPrewarmIntegration(session, { outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const images = { '/green.png': fixturePng([214, 239, 187]), '/blue.png': fixturePng([177, 211, 242]) };
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, at: Date.now() });
    response.writeHead(images[request.url] ? 200 : 404, { 'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(images[request.url] || '');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const metadata = name => ({ url: `${base}/${name}.png`, srcSet: '', author: 'Prewarm fixture',
    authorLink: 'https://example.com/author', imagePage: 'https://example.com/wallpaper' });
  const [first, second] = [metadata('green'), metadata('blue')];
  const report = { passed: false };
  let page;
  try {
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await page.evaluate(async list => {
      const payload = { value: list, updatedAt: Date.now(), __midoriStorageVersion: 1 };
      await (globalThis.browser || globalThis.chrome).storage.local.set({ unsplash_cache_images: payload });
      localStorage.setItem('unsplash_cache_images', JSON.stringify(payload));
      localStorage.setItem('unsplash_cache_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
      localStorage.setItem('unsplash_cache_index', '0');
      localStorage.removeItem('midori_wallpaper_previews_v1');
      localStorage.setItem('tabStore', JSON.stringify({ theme: 'dark', autoTheme: false, density: 'comfortable',
        background: { type: 'Unsplash', default: true, class: 'bg-orange' }, showAds: false, showSpeedDials: true,
        speedDialSize: 'tiny', speedDialColumns: 7, speedDialLimit: 8, widgetsEnabled: true, openLink: 'Self Tab' }));
    }, [first, second]);
    await page.close();

    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    assert.equal(await page.evaluate(() => window.__midoriEarlyWallpaper?.key ?? null), null, 'The first visit has no preview yet');
    await page.waitForFunction(key => {
      try { return JSON.parse(localStorage.getItem('midori_wallpaper_previews_v1') || 'null')?.entries?.some(entry => entry.key === key); }
      catch { return false; }
    }, second.url, { timeout: 20_000 });
    report.requests = requests.map(request => request.path);
    assert.ok(requests.filter(request => request.path === '/blue.png').length >= 1, 'The next wallpaper must be downloaded after the current one is shown');
    await page.close();

    page = await session.context.newPage();
    await page.goto(session.url);
    const early = await page.evaluate(() => ({ key: window.__midoriEarlyWallpaper?.key ?? null,
      painted: getComputedStyle(document.body).backgroundImage.startsWith('url("data:image/') }));
    assert.equal(early.key, second.url, 'The next new tab must restore the preview of the prewarmed wallpaper');
    assert.equal(early.painted, true, 'The preview must be painted before the full image is requested');
    report.passed = true;
    return report;
  } finally {
    if (outputDir) writeFileSync(join(outputDir, 'wallpaper-prewarm.json'), `${JSON.stringify(report, null, 2)}\n`);
    await page?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
