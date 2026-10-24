import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Run with: node scripts/check-logo-contrast.mjs
// Every remote request is intercepted; fixtures are PNGs generated in the browser.
const root = fileURLToPath(new URL('..', import.meta.url));
const fixtures = [
  { name: 'dark', color: '#080d14', tone: 'light' },
  { name: 'light', color: '#ffffff', tone: 'green' },
  { name: 'green', color: '#04a66b', tone: 'light' },
  { name: 'light-top', color: '#000000', top: '#ffffff', tone: 'green' },
  { name: 'dark-top', color: '#ffffff', top: '#000000', tone: 'light' },
];
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, strictPort: true } });
const requests = [];
const errors = [];
let browser;
let page;
let releaseLateThumbnail = () => {};
let thumbnailStarted;
const lateThumbnailStarted = new Promise(resolve => { thumbnailStarted = resolve; });
let combinations = 0;

try {
  // Vite treats port: 0 as its default port; let the HTTP server reserve a free port.
  await new Promise((resolve, reject) => {
    server.httpServer.once('error', reject);
    server.httpServer.listen(0, '127.0.0.1', resolve);
  });
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1260, height: 933 } });
  page.on('pageerror', error => errors.push(error.message));
  const images = await page.evaluate(fixtures => {
    const images = {};
    for (const fixture of fixtures) {
      for (const width of [512, 960, 1280, 1440, 1600]) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.round(width * 1000 / 1280);
        const context = canvas.getContext('2d');
        context.fillStyle = fixture.color;
        context.fillRect(0, 0, canvas.width, canvas.height);
        if (fixture.top) {
          context.fillStyle = fixture.top;
          context.fillRect(0, 0, canvas.width, canvas.height * 0.3);
        }
        images[`${fixture.name}:${width}`] = canvas.toDataURL('image/png').split(',')[1];
      }
    }
    return images;
  }, fixtures);

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'api.unsplash.com') {
      return route.fulfill({ json: fixtures.map(({ name }) => ({
        urls: { raw: `https://images.unsplash.com/${name}` },
        user: { name: 'Contrast fixture', links: { html: 'https://unsplash.com/@fixture' } },
        links: { html: `https://unsplash.com/photos/${name}` },
      })) });
    }
    if (url.hostname !== 'images.unsplash.com') return route.abort();
    const width = Number(url.searchParams.get('w')) || 1280;
    requests.push({ name: url.pathname, width });
    const name = fixtures.find(fixture => url.pathname === `/${fixture.name}`)?.name || 'light';
    const corsBlocked = url.pathname === '/blocked' || (url.pathname === '/late' && width !== 512);
    if (url.pathname === '/late' && width === 512) {
      const released = new Promise(resolve => { releaseLateThumbnail = resolve; });
      thumbnailStarted();
      await released;
    }
    try {
      return await route.fulfill({
        contentType: 'image/png',
        // Playwright inserts permissive CORS headers when this header is omitted.
        headers: { 'access-control-allow-origin': corsBlocked ? 'https://blocked.invalid' : '*' },
        body: Buffer.from(images[`${name}:${width}`], 'base64'),
      });
    } catch {
      // The deliberately delayed thumbnail may be canceled after the wallpaper changes.
    }
  });

  async function waitForTone(tone, outlined) {
    await page.waitForFunction(({ tone, outlined }) => {
      const logo = document.querySelector('.logo');
      return logo?.classList.contains(`logo--${tone}`)
        && (outlined === undefined || logo.classList.contains('logo--outlined') === outlined);
    }, { tone, outlined });
  }

  async function waitForWallpaper(path) {
    await page.waitForFunction(path => {
      const image = document.querySelector('img.background');
      return image?.src.includes(path) && image.complete && image.naturalWidth > 0
        && getComputedStyle(image).display !== 'none';
    }, path);
  }

  async function changeBackground(background) {
    await page.evaluate(async background => {
      const { default: useTabStore } = await import('/src/stores/useTabStore.js');
      useTabStore().changeBackground(background);
    }, background);
  }

  await page.goto(origin);
  await page.locator('.logo').evaluate(image => image.decode());
  for (const fixture of fixtures) {
    await waitForWallpaper(`/${fixture.name}?`);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(async theme => {
        const { default: useTabStore } = await import('/src/stores/useTabStore.js');
        const store = useTabStore();
        if (store.theme !== theme) store.setTheme();
      }, theme);
      for (const width of [1920, 1260, 390, 320]) {
        await page.setViewportSize({ width, height: width > 700 ? 933 : 844 });
        await waitForTone(fixture.tone);
        const state = await page.locator('.logo').evaluate(logo => ({
          cors: document.querySelector('img.background').crossOrigin,
          overflow: document.documentElement.scrollWidth > innerWidth,
          filter: getComputedStyle(logo).filter,
          background: getComputedStyle(logo.parentElement).backgroundColor,
        }));
        assert.equal(state.cors, 'anonymous');
        assert.equal(state.overflow, false);
        assert.equal(state.background, 'rgba(0, 0, 0, 0)');
        if (fixture.tone === 'green') assert.ok(!state.filter.includes('brightness'));
        combinations++;
      }
    }
    if (fixture.name === 'light-top') {
      await page.setViewportSize({ width: 390, height: 844 });
      // Exposes srcset density correction: canvas source coordinates are raw pixels,
      // while naturalWidth/Height are density-corrected. The visible region is black.
      await page.locator('.dashboard-toolbar').evaluate(element => { element.style.height = '330px'; });
      await waitForTone('light', false);
      await page.locator('.dashboard-toolbar').evaluate(element => { element.style.height = ''; });
      await waitForTone('green');
    }
    if (fixture !== fixtures.at(-1)) {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('midori:refresh-wallpaper')));
    }
  }
  assert.equal(requests.filter(request => request.width === 512 || request.width === 128).length, 0);

  for (const [color, tone] of [['#ffffff', 'green'], ['#080d14', 'light']]) {
    await changeBackground({ type: 'Solid', default: false, color });
    await page.waitForFunction(() => !document.querySelector('img.background'));
    await waitForTone(tone);
  }
  await changeBackground({ type: 'Gradient', default: true, class: 'bg-green' });
  await waitForTone('light');
  await page.evaluate(async base64 => {
    const { default: useTabStore } = await import('/src/stores/useTabStore.js');
    const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    useTabStore().changeBackground({ type: 'MarketplaceWallpaper', imageUrl: url });
  }, images['light:1280']);
  await waitForWallpaper('blob:');
  await waitForTone('green');

  const blockedThumbnail = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/blocked' && url.searchParams.get('w') === '512';
  }).catch(error => error);
  await changeBackground({ type: 'MarketplaceWallpaper', imageUrl: 'https://images.unsplash.com/blocked' });
  await waitForWallpaper('/blocked');
  await waitForTone('light', true);
  const blockedRequest = await blockedThumbnail;
  if (blockedRequest instanceof Error) throw blockedRequest;
  assert.equal(await page.locator('img.background').getAttribute('crossorigin'), null);
  assert.equal(requests.filter(request => request.name === '/blocked' && request.width === 512).length, 1);

  await changeBackground({ type: 'MarketplaceWallpaper', imageUrl: 'https://images.unsplash.com/late' });
  await waitForWallpaper('/late');
  await waitForTone('light', true);
  await Promise.race([
    lateThumbnailStarted,
    page.waitForTimeout(10000).then(() => { throw new Error('Fallback thumbnail did not start'); }),
  ]);
  await changeBackground({ type: 'MarketplaceWallpaper', imageUrl: 'https://images.unsplash.com/dark' });
  await waitForWallpaper('/dark');
  await waitForTone('light', false);
  releaseLateThumbnail();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await waitForTone('light', false);

  await page.setViewportSize({ width: 1260, height: 933 });
  await page.locator('.logo').evaluate(element => {
    element.style.position = 'fixed';
    element.style.left = '-150px';
    element.style.top = '10px';
    element.style.width = '224px';
    document.body.style.backgroundColor = 'white';
    window.dispatchEvent(new Event('resize'));
  });
  await waitForTone('light', false);
  await page.locator('.logo').evaluate(element => {
    element.style.position = '';
    element.style.left = '';
    element.style.top = '';
    element.style.width = '';
    window.dispatchEvent(new Event('resize'));
  });
  await changeBackground({ type: 'MarketplaceWallpaper', imageUrl: 'https://images.unsplash.com/light' });
  await waitForWallpaper('/light');
  await waitForTone('green');
  await changeBackground({ type: 'MarketplaceWallpaper', imageUrl: 'https://images.unsplash.com/light' });
  await waitForTone('green');
  assert.equal(requests.filter(request => request.name === '/light' && request.width === 512).length, 0);
  assert.deepEqual(errors, []);
  console.log(`PASS: ${combinations} wallpaper/theme/viewport combinations; responsive srcset crop, layout changes, solid/gradient/blob backgrounds, CORS fallback, stale thumbnail, clipped logo, repeated source, no extra thumbnails or page errors.`);
} catch (error) {
  if (page && !page.isClosed()) {
    console.error('Contrast state:', await page.locator('.logo').evaluate(logo => ({
      className: logo.className,
      rect: logo.getBoundingClientRect().toJSON(),
      source: document.querySelector('img.background')?.currentSrc,
      image: Array.from(document.querySelectorAll('img.background'), image => ({
        src: image.src, cors: image.crossOrigin, complete: image.complete,
        naturalWidth: image.naturalWidth, display: getComputedStyle(image).display,
      })),
    })).catch(() => null));
    console.error('Image requests:', requests);
  }
  throw error;
} finally {
  releaseLateThumbnail();
  await browser?.close();
  await server.close();
}
