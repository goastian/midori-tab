import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { artifactIdentity, closeContext, openContextWithRetry } from '../../scripts/measure-newtab.mjs';
import { finishResourceObservation } from '../../scripts/critical-requests.mjs';

function observeStartup() {
  const evidence = window.__startupVisual = { frames: [], paints: [], shifts: [], sources: [], visibilityChanges: [], errors: [], startedAt: performance.now() };
  const sources = new Map();
  let stopped = false;
  const source = value => {
    if (!value || value === 'none') return null;
    if (!sources.has(value)) { sources.set(value, evidence.sources.length); evidence.sources.push(value); }
    return sources.get(value);
  };
  const rect = element => {
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  };
  const visible = element => {
    if (!element) return false;
    for (let current = element; current; current = current.parentElement) {
      const css = getComputedStyle(current);
      if (css.display === 'none' || css.visibility === 'hidden' || Number(css.opacity) === 0) return false;
    }
    return element.getBoundingClientRect().height > 0;
  };
  const css = element => {
    if (!element) return null;
    const value = getComputedStyle(element);
    return { color: value.backgroundColor, image: source(value.backgroundImage), opacity: value.opacity,
      display: value.display, visibility: value.visibility };
  };
  const observers = [];
  const visibilityChanged = () => evidence.visibilityChanges.push({ at: performance.now(), state: document.visibilityState });
  const errorOccurred = event => evidence.errors.push({ at: performance.now(), message: event.message || String(event.reason) });
  document.addEventListener('visibilitychange', visibilityChanged);
  window.addEventListener('error', errorOccurred);
  window.addEventListener('unhandledrejection', errorOccurred);
  for (const type of ['paint', 'layout-shift']) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) continue;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'paint') evidence.paints.push({ name: entry.name, at: entry.startTime });
        else evidence.shifts.push({ at: entry.startTime, value: entry.value, recentInput: entry.hadRecentInput });
      }
    });
    observer.observe({ type, buffered: true });
    observers.push(observer);
  }
  function frame() {
    if (stopped) return;
    const search = [...document.querySelectorAll('.search-input')].find(visible);
    const logo = [...document.querySelectorAll('.early-logo, #app .logo')].find(visible);
    const wallpaper = document.querySelector('img.background');
    const body = css(document.body);
    const root = css(document.documentElement);
    const early = window.__midoriEarlyWallpaper;
    evidence.frames.push({ at: performance.now(), visibility: document.visibilityState,
      theme: document.documentElement.dataset.theme, root, body,
      early: early ? { key: source(early.key), url: source(early.url), data: source(early.dataUrl), index: early.selectedIndex } : null,
      image: wallpaper ? { source: source(wallpaper.currentSrc || wallpaper.src), visible: visible(wallpaper),
        decoded: wallpaper.complete && wallpaper.naturalWidth > 0, opacity: getComputedStyle(wallpaper).opacity,
        width: wallpaper.naturalWidth, height: wallpaper.naturalHeight, bounds: rect(wallpaper) } : null,
      skeleton: visible(document.querySelector('.background-skeleton')),
      search: search ? rect(search) : null,
      logo: logo ? { filter: getComputedStyle(logo).filter, bounds: rect(logo) } : null,
      dials: rect(document.querySelector('.dash-sponsored')),
      privacy: rect(document.querySelector('[data-widget="privacy"]')),
      privacyBody: rect(document.querySelector('[data-widget="privacy"] .widget-card__body')),
      privacyStats: rect(document.querySelector('.pw-stats')),
      privacyPlaceholder: Boolean(document.querySelector('[data-widget="privacy"] .widget-card__placeholder')),
      privacyMounted: Boolean(document.querySelector('.privacy-widget')),
      privacyLoading: Boolean(document.querySelector('.pw-badge--loading')),
      mainStarted: Boolean(window.__midoriPerf),
    });
    if (evidence.frames.length < 1200 && performance.now() - evidence.startedAt < 30_000) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  evidence.stop = () => {
    stopped = true;
    observers.forEach(observer => observer.disconnect());
    document.removeEventListener('visibilitychange', visibilityChanged);
    window.removeEventListener('error', errorOccurred);
    window.removeEventListener('unhandledrejection', errorOccurred);
  };
}

export function instrumentStartupVisualFixture(directory) {
  const file = join(directory, 'index.html');
  const html = readFileSync(file, 'utf8');
  assert.match(html, /<head>/i);
  assert.match(html, /src="\/index\.js"/);
  writeFileSync(file, html.replace(/<head>/i, '<head><script src="/integration-startup-observer.js"></script>')
    .replace('src="/index.js"', 'src="/integration-startup-main.js"'));
  writeFileSync(join(directory, 'integration-startup-observer.js'), `(${observeStartup.toString()})();\n`);
  writeFileSync(join(directory, 'integration-startup-main.js'),
    "const start = () => import('./index.js');\nif (new URL(location.href).searchParams.has('holdMain')) window.__releaseStartupMain = start; else void start();\n");
  writeFileSync(join(directory, 'integration-startup-seed.html'), '<!doctype html><html><head><meta charset="utf-8"></head><body>Integration storage setup</body></html>');
  const privacyFiles = readdirSync(join(directory, 'assets')).filter(name => /^PrivacyWidget-.*\.js$/.test(name));
  assert.equal(privacyFiles.length, 1, 'The integration fixture must identify the actual PrivacyWidget chunk');
  const privacyFile = join(directory, 'assets', privacyFiles[0]);
  writeFileSync(privacyFile,
    "if (new URL(location.href).searchParams.has('holdWidget')) await new Promise(resolve => { window.__releaseStartupPrivacy = resolve; });\n"
    + readFileSync(privacyFile, 'utf8'));
}

export function fixturePng(tint) {
  function chunk(type, bytes) {
    const name = Buffer.from(type);
    const content = Buffer.concat([name, bytes]);
    let crc = 0xffffffff;
    for (const byte of content) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
    const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, checksum]);
  }
  const width = 320, height = 180;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = y * (width * 3 + 1) + 1 + x * 3;
    const shade = Math.floor(x / 40) % 2 === Math.floor(y / 30) % 2 ? 0 : 22;
    tint.forEach((value, channel) => { rows[offset + channel] = value - shade; });
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}

async function wallpaperFixture() {
  const images = { '/green.png': fixturePng([214, 239, 187]), '/blue.png': fixturePng([177, 211, 242]) };
  const requests = [];
  const pending = new Set();
  let held = true;
  let maximumHoldMs = 2500;
  const server = createServer((request, response) => {
    const record = { path: request.url, requestedAt: Date.now(), releasedAt: null };
    requests.push(record);
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    let timeout;
    const send = () => {
      pending.delete(send);
      clearTimeout(timeout);
      if (response.destroyed || response.writableEnded) return;
      record.releasedAt = Date.now();
      response.writeHead(images[path] ? 200 : 404, {
        'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store',
      });
      response.end(images[path] || '');
    };
    if (held) { pending.add(send); timeout = setTimeout(send, maximumHoldMs); } else send();
    response.on('close', () => {
      record.closedAt = Date.now();
      record.cancelled = !response.writableEnded;
      pending.delete(send); clearTimeout(timeout);
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${server.address().port}`, requests,
    hold(timeoutMs = 2500) { held = true; maximumHoldMs = timeoutMs; },
    release() { held = false; for (const send of [...pending]) send(); },
    async close() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}

async function seedStartup(session, { theme, background, images, index = 0, clearPreviews = false, corruption, corruptDataUrl }) {
  const page = await session.context.newPage();
  try {
    await page.goto(new URL('/integration-startup-seed.html', session.url).href);
    await page.evaluate(async settings => {
      const bookmarks = Array.from({ length: 6 }, (_, index) => ({ title: `Fixture ${index + 1}`,
        url: `https://startup-fixture.example/${index}`, domain: 'startup-fixture.example' }));
      const records = {
        midori_bookmarks: { Fixture: bookmarks, Other: [] },
        midori_bookmark_categories: ['Fixture', 'Other'],
        unsplash_cache_images: settings.images || [],
      };
      const payload = Object.fromEntries(Object.entries(records).map(([key, value]) => [key,
        { value, updatedAt: Date.now(), __midoriStorageVersion: 1 }]));
      await (globalThis.browser || globalThis.chrome).storage.local.set(payload);
      for (const [key, value] of Object.entries(payload)) localStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem('midori_bookmark_snapshot_v1', JSON.stringify({ version: 1,
        categories: ['Fixture', 'Other'], activeTab: 'Fixture', items: bookmarks }));
      localStorage.setItem('tabStore', JSON.stringify({ theme: settings.theme, autoTheme: false,
        density: 'comfortable', background: settings.background, showAds: false, showSpeedDials: true,
        speedDialSize: 'tiny', speedDialColumns: 7, speedDialLimit: 8, showAddSpeedDialButton: true,
        widgetsEnabled: true, openLink: 'Self Tab' }));
      localStorage.setItem('widgetsStore', JSON.stringify({ enabled: { search: true, privacy: true }, order: ['search', 'privacy'] }));
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
      localStorage.setItem('midori_boot_snapshot_v1', JSON.stringify({ version: 1, theme: settings.theme,
        autoTheme: false, density: 'comfortable', backgroundType: settings.background.type, background: settings.background }));
      localStorage.setItem('unsplash_cache_expiry', String(Date.now() + 24 * 60 * 60 * 1000));
      localStorage.setItem('unsplash_cache_index', String(settings.index));
      if (settings.clearPreviews) localStorage.removeItem('midori_wallpaper_previews_v1');
      if (settings.corruption === 'null-records') {
        const cache = JSON.parse(localStorage.getItem('midori_wallpaper_previews_v1') || 'null');
        if (!cache?.entries?.length) throw new Error('The null-record fixture needs a preview generated by a preceding real image load');
        cache.entries.unshift(null);
        localStorage.setItem('midori_wallpaper_previews_v1', JSON.stringify(cache));
        const logos = JSON.parse(localStorage.getItem('midori_wallpaper_logo_v1') || '[]');
        localStorage.setItem('midori_wallpaper_logo_v1', JSON.stringify([null, ...logos]));
      }
      if (settings.corruption === 'invalid-json') localStorage.setItem('midori_wallpaper_previews_v1', '{broken');
      if (settings.corruption === 'invalid-jpeg') {
        const key = settings.images[settings.index].url;
        localStorage.setItem('midori_wallpaper_previews_v1', JSON.stringify({ version: 1,
          entries: [{ key, dataUrl: settings.corruptDataUrl, updatedAt: Date.now() }], lastKey: key }));
      }
    }, { theme, background, images, index, clearPreviews, corruption, corruptDataUrl });
  } finally { await page.close(); }
}

function paintedFrames(evidence) {
  const fcp = evidence.paints.find(entry => entry.name === 'first-contentful-paint')?.at;
  const frames = evidence.frames.filter(frame => frame.visibility === 'visible' && frame.search
    && (fcp === undefined || frame.at >= fcp));
  assert.ok(frames.length >= 3, 'Record multiple painted frames from the installed extension');
  return frames;
}

function stableGeometry(frames, key) {
  const first = frames.findIndex(frame => frame[key]);
  assert.ok(first >= 0, `${key} must be present in the observed startup`);
  const reference = frames[first][key];
  for (const frame of frames.slice(first)) {
    assert.ok(frame[key], `${key} disappeared at ${frame.at.toFixed(1)} ms`);
    for (const axis of ['x', 'y', 'width', 'height']) {
      assert.ok(Math.abs(frame[key][axis] - reference[axis]) <= 1,
        `${key}.${axis} moved at ${frame.at.toFixed(1)} ms: ${reference[axis]} -> ${frame[key][axis]}`);
    }
  }
}

function validateVisual(evidence, scenario) {
  const frames = paintedFrames(evidence);
  assert.ok(frames.every(frame => frame.theme === scenario.theme), 'The saved theme must hold from first paint');
  assert.ok(frames.every(frame => !frame.skeleton), 'An opaque wallpaper skeleton must never cover the page');
  for (const key of ['search', 'dials', 'privacy']) stableGeometry(frames, key);
  const last = frames.at(-1);
  if (last.privacyStats) {
    assert.ok(last.privacyStats.y + last.privacyStats.height <= last.privacyBody.y + last.privacyBody.height + 1,
      'All privacy statistics must fit the reserved widget body');
  }
  const firstColor = frames[0].body.color;
  assert.ok(frames.every(frame => frame.body.color === firstColor),
    `The body base color must remain stable, observed ${[...new Set(frames.map(frame => frame.body.color))].join(' -> ')}`);
  const firstRootColor = frames[0].root.color;
  assert.ok(frames.every(frame => frame.root.color === firstRootColor), 'The root must not flash another theme color');
  if (!scenario.wallpaper) {
    assert.ok(frames.every(frame => frame.body.image === frames[0].body.image), 'Solid/gradient background must be identical before and after Vue');
    if (scenario.background.type === 'Gradient') assert.match(evidence.sources[frames[0].body.image] || '', /linear-gradient/);
    if (scenario.background.type === 'Solid') assert.equal(firstColor, scenario.expectedColor);
  } else {
    const images = frames.filter(frame => frame.image?.visible);
    assert.ok(images.length, 'The selected wallpaper must become visible');
    assert.ok(images.every(frame => frame.image.decoded && Number(frame.image.opacity) === 1), 'Wallpaper must appear decoded at full opacity, without a fade');
    const firstImage = frames.findIndex(frame => frame.image?.visible);
    assert.ok(frames.slice(firstImage).every(frame => frame.image?.visible), 'A visible wallpaper must not disappear during hydration');
    assert.equal(evidence.sources[frames.at(-1).image.source], scenario.displayUrl || scenario.wallpaper,
      'The final decoded wallpaper must be the selected responsive candidate');
    const cache = evidence.previewCache;
    const selected = cache?.entries?.find(entry => entry?.key === scenario.wallpaper);
    assert.ok(selected?.dataUrl?.startsWith('data:image/'), 'Production loading must create a preview from the real downloaded image');
    assert.ok(evidence.previewCacheBytes <= 512 * 1024, 'The complete synchronous preview cache must remain bounded');
    assert.ok(new Blob([selected.dataUrl]).size <= 128 * 1024, 'A preview entry must remain bounded');
    if (scenario.corruption) {
      assert.equal(evidence.errors.length, 0, 'Invalid optional cache data must not produce uncaught startup errors');
      assert.notEqual(selected.dataUrl, scenario.corruptDataUrl, 'The corrupt preview must be replaced by pixels from the downloaded image');
      assert.ok(evidence.previewDecoded, 'The repaired preview must decode successfully in the actual browser');
    }
    if (scenario.warm) {
      for (const frame of frames) {
        assert.equal(evidence.sources[frame.early?.key], scenario.wallpaper, 'Boot must restore the preview belonging to the selected wallpaper');
        assert.ok(frame.early?.data !== null && frame.early?.data !== undefined, 'Warm preview must exist at first paint');
        const preview = evidence.sources[frame.early.data];
        const bodyPreview = (evidence.sources[frame.body.image] || '').includes(preview);
        assert.ok(bodyPreview || (frame.image?.visible && frame.image.decoded), `Warm wallpaper pixels lost at ${frame.at.toFixed(1)} ms`);
      }
      const logoFilters = new Set(frames.filter(frame => frame.logo).map(frame => frame.logo.filter));
      assert.equal(logoFilters.size, 1, `Logo tone must not switch over the same warm wallpaper: ${[...logoFilters].join(' -> ')}`);
    }
  }
  if (scenario.holdWidget) {
    const placeholderFrames = frames.filter(frame => frame.privacyPlaceholder && !frame.privacyMounted);
    assert.ok(placeholderFrames.length >= 3, 'The real delayed widget import must retain its placeholder across frames');
    assert.ok(frames.some(frame => frame.privacyMounted), 'The delayed widget must eventually mount');
  }
  if (scenario.hideWhilePending) {
    const hidden = evidence.visibilityChanges.findIndex(event => event.state === 'hidden');
    assert.ok(hidden >= 0, 'Opening another real browser tab must hide the measured document');
    assert.ok(evidence.visibilityChanges.slice(hidden + 1).some(event => event.state === 'visible'),
      'The actual measured document must return to the foreground');
    assert.equal(evidence.rotationIndex, (scenario.index + 1) % scenario.images.length,
      'Resuming an interrupted download must not advance the wallpaper rotation again');
    assert.equal(evidence.errors.length, 0, 'Resuming the selected wallpaper must not produce uncaught errors');
  }
  return { frameCount: frames.length, firstPaintedFrameMs: frames[0].at,
    interactionReadyMs: evidence.marks?.['interaction-ready'],
    firstWallpaperFrameMs: frames.find(frame => frame.image?.visible)?.at ?? null,
    cls: evidence.shifts.length ? evidence.shifts.filter(shift => !shift.recentInput).reduce((sum, shift) => sum + shift.value, 0) : null };
}

export async function runStartupVisualSessionIntegration(session, { outputDir, throwOnFailure = true, scenarioIds } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const fixture = await wallpaperFixture();
  const meta = name => ({ url: `${fixture.base}/${name}.png`, srcSet: '', author: 'HTTP integration fixture',
    authorLink: 'https://example.com/author', imagePage: 'https://example.com/wallpaper' });
  const green = meta('green'), blue = meta('blue');
  blue.srcSet = `${blue.url}?width=320 320w, ${blue.url}?width=1280 1280w`;
  const marketplace = { type: 'MarketplaceWallpaper', default: false,
    previewUrl: `${green.url}?marketplace=preview`, imageUrl: `${green.url}?marketplace=original`,
    authorName: 'Marketplace integration fixture', authorUrl: 'https://example.com/marketplace-author',
    sourceUrl: 'https://example.com/marketplace-wallpaper' };
  const scenarios = ['light', 'dark'].flatMap(theme => [
    { id: `${theme}-solid`, theme, background: { type: 'Solid', default: false, color: '#cfe4bb' }, expectedColor: 'rgb(207, 228, 187)' },
    { id: `${theme}-gradient`, theme, background: { type: 'Gradient', default: true, class: 'bg-green' } },
  ]);
  scenarios.push(
    { id: 'unsplash-light-cold', theme: 'light', wallpaper: green.url, images: [green], clearPreviews: true },
    { id: 'unsplash-light-warm-delayed-main-and-widget', theme: 'light', wallpaper: green.url, images: [green], warm: true, holdMain: true, holdWidget: true },
    { id: 'unsplash-dark-rotated-cold', theme: 'dark', wallpaper: blue.url, displayUrl: `${blue.url}?width=1280`, images: [green, blue], index: 1 },
    { id: 'unsplash-dark-rotated-warm', theme: 'dark', wallpaper: blue.url, displayUrl: `${blue.url}?width=1280`, images: [green, blue], index: 1, warm: true },
    { id: 'unsplash-null-cache-records', theme: 'light', wallpaper: green.url, images: [green], warm: true, corruption: 'null-records' },
    { id: 'unsplash-invalid-cache-json', theme: 'light', wallpaper: green.url, images: [green], corruption: 'invalid-json' },
    { id: 'unsplash-corrupt-preview-jpeg', theme: 'dark', wallpaper: blue.url, displayUrl: `${blue.url}?width=1280`,
      images: [green, blue], index: 1, corruption: 'invalid-jpeg', corruptDataUrl: 'data:image/jpeg;base64,YmFk' },
    { id: 'unsplash-warm-hidden-request-resumes', theme: 'dark', wallpaper: blue.url, displayUrl: `${blue.url}?width=1280`,
      images: [green, blue], index: 1, warm: true, hideWhilePending: true },
    { id: 'marketplace-light-cold', theme: 'light', background: marketplace,
      wallpaper: marketplace.previewUrl, displayUrl: marketplace.imageUrl, clearPreviews: true },
    { id: 'marketplace-light-warm-delayed-main', theme: 'light', background: marketplace,
      wallpaper: marketplace.previewUrl, displayUrl: marketplace.imageUrl, warm: true, holdMain: true },
  );
  const selectedIds = scenarioIds ? new Set(scenarioIds) : null;
  if (selectedIds) {
    for (const id of selectedIds) assert.ok(scenarios.some(scenario => scenario.id === id), `Unknown visual scenario ${id}`);
    if (selectedIds.has('unsplash-light-warm-delayed-main-and-widget')) selectedIds.add('unsplash-light-cold');
    if (selectedIds.has('unsplash-dark-rotated-warm')) selectedIds.add('unsplash-dark-rotated-cold');
    if (selectedIds.has('unsplash-null-cache-records')) selectedIds.add('unsplash-light-cold');
    if (selectedIds.has('unsplash-warm-hidden-request-resumes')) selectedIds.add('unsplash-dark-rotated-cold');
    if (selectedIds.has('marketplace-light-warm-delayed-main')) selectedIds.add('marketplace-light-cold');
  }
  const report = { passed: false, transport: session.metadata, cases: [], requests: fixture.requests,
    instrumentation: 'First external head script records rAF state, paint timing and real DOM geometry in an installed package copy. Solid/gradient and cold/warm Unsplash/Marketplace use native storage and loopback PNG HTTP. Native resource observation verifies optional code stays unloaded until its feature is selected. Only the explicit delayed cases hold the actual entry/widget module evaluation. rAF diagnostics are not performance-budget measurements.' };
  try {
    for (const scenario of scenarios.filter(scenario => !selectedIds || selectedIds.has(scenario.id))) {
      scenario.background ||= { type: 'Unsplash', default: true, class: 'bg-orange' };
      const result = { id: scenario.id, status: 'running', scenario };
      report.cases.push(result);
      let page;
      let observing = false;
      fixture.hold(scenario.hideWhilePending ? 10_000 : 2500);
      try {
        await seedStartup(session, scenario);
        const requestStart = fixture.requests.length;
        page = await session.context.newPage();
        await session.network.start();
        observing = true;
        const url = new URL(session.url);
        if (scenario.holdMain) url.searchParams.set('holdMain', '1');
        if (scenario.holdWidget) url.searchParams.set('holdWidget', '1');
        await page.goto(url.href);
        if (scenario.holdMain) {
          await page.waitForFunction(() => typeof window.__releaseStartupMain === 'function');
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 200)));
          if (outputDir) await page.screenshot({ path: join(outputDir, `${scenario.id}-before-vue.png`) });
          await page.evaluate(() => { window.__releaseStartupMain(); });
        }
        await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']), null, { timeout: 20_000 });
        if (scenario.holdWidget) {
          await page.waitForFunction(() => typeof window.__releaseStartupPrivacy === 'function', null, { timeout: 15_000 });
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 250)));
          if (outputDir) await page.screenshot({ path: join(outputDir, `${scenario.id}-widget-pending.png`) });
          await page.evaluate(() => { window.__releaseStartupPrivacy(); });
        }
        if (scenario.wallpaper) {
          if (scenario.hideWhilePending) {
            const deadline = Date.now() + 8000;
            while (!fixture.requests.slice(requestStart).some(request => request.releasedAt === null) && Date.now() < deadline) {
              await new Promise(resolve => setTimeout(resolve, 25));
            }
            assert.ok(fixture.requests.slice(requestStart).some(request => request.releasedAt === null),
              'Hide the actual new tab while its selected wallpaper HTTP request is pending');
            result.beforeHidden = await page.evaluate(async () => ({
              tabId: (await (globalThis.browser || globalThis.chrome).tabs.getCurrent()).id,
              source: document.querySelector('img.background')?.currentSrc,
              key: window.__midoriEarlyWallpaper?.key,
              rotationIndex: Number(localStorage.getItem('unsplash_cache_index')),
            }));
            assert.equal(result.beforeHidden.key, scenario.wallpaper);
            assert.ok(result.beforeHidden.source?.startsWith('data:image/'), 'Keep the real cached preview visible while its full image is pending');
            result.visibilityRoundTrip = await page.evaluate(async seedUrl => {
              const api = globalThis.browser || globalThis.chrome;
              const measured = await api.tabs.getCurrent();
              const waitForVisibility = state => new Promise((resolve, reject) => {
                if (document.visibilityState === state) { resolve(); return; }
                const changed = () => {
                  if (document.visibilityState !== state) return;
                  clearTimeout(timeout);
                  document.removeEventListener('visibilitychange', changed);
                  resolve();
                };
                const timeout = setTimeout(() => {
                  document.removeEventListener('visibilitychange', changed);
                  reject(new Error(`The real browser tab did not become ${state}`));
                }, 5000);
                document.addEventListener('visibilitychange', changed);
              });
              const covering = await api.tabs.create({ windowId: measured.windowId, url: seedUrl, active: true });
              try {
                await waitForVisibility('hidden');
                const hiddenAt = performance.now();
                await new Promise(resolve => setTimeout(resolve, 250));
                await api.tabs.update(measured.id, { active: true });
                await waitForVisibility('visible');
                return { measuredWindowId: measured.windowId, coveringWindowId: covering.windowId,
                  hiddenAt, visibleAt: performance.now() };
              } finally { await api.tabs.remove(covering.id); }
            }, new URL('/integration-startup-seed.html', session.url).href);
            assert.equal(result.visibilityRoundTrip.coveringWindowId, result.visibilityRoundTrip.measuredWindowId,
              'The covering tab must share the measured tab browser window');
            await page.waitForFunction(() => document.visibilityState === 'visible');
          }
          await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 350)));
          if (outputDir) await page.screenshot({ path: join(outputDir, `${scenario.id}-http-pending.png`) });
          fixture.release();
          await page.waitForFunction(expectedUrl => {
            const image = document.querySelector('img.background');
            return image?.complete && image.naturalWidth > 0 && getComputedStyle(image).display !== 'none'
              && image.currentSrc === expectedUrl;
          }, scenario.displayUrl || scenario.wallpaper, { timeout: 15_000 });
        }
        await page.waitForFunction(() => Boolean(document.querySelector('.privacy-widget')), null, { timeout: 15_000 });
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 750)));
        result.requests = fixture.requests.slice(requestStart);
        if (scenario.wallpaper) {
          assert.ok(result.requests.length > 0, 'Exercise a real HTTP wallpaper request');
          const expectedUrls = [scenario.displayUrl || scenario.wallpaper];
          if (scenario.background.type === 'MarketplaceWallpaper' && !scenario.warm) expectedUrls.push(scenario.background.previewUrl);
          const expectedPaths = expectedUrls.map(url => { const parsed = new URL(url); return `${parsed.pathname}${parsed.search}`; });
          assert.ok(result.requests.every(request => expectedPaths.includes(request.path)),
            'Preload and displayed IMG must request only the selected preview and responsive image candidates');
          assert.ok(expectedPaths.every(path => result.requests.some(request => request.path === path)),
            'Load each required selected image through the real HTTP fixture; warm Marketplace must skip its remote preview');
        }
        result.resources = await finishResourceObservation(session, page);
        observing = false;
        const marketplaceLoaded = result.resources.paths.some(path => /\/MarketplaceWallpaperService-[^/]+\.js$/.test(path));
        assert.equal(marketplaceLoaded, scenario.background.type === 'MarketplaceWallpaper',
          'Marketplace wallpaper code must load only when that background type is selected');
        assert.ok(!result.resources.paths.some(path => /\/BookmarkEditor-[^/]+\.(?:js|css)$/.test(path)),
          'The bookmark editor must not load during visual startup');
        if (scenario.background.type === 'MarketplaceWallpaper') {
          result.credits = await page.evaluate(() => [...document.querySelectorAll('.credits a')]
            .map(link => ({ text: link.textContent, href: link.href })));
          assert.deepEqual(result.credits, [
            { text: marketplace.authorName, href: marketplace.authorUrl },
            { text: 'Marketplace', href: marketplace.sourceUrl },
          ], 'The deferred Marketplace loader must retain the selected image credits');
        }
        result.status = 'captured';
      } catch (error) {
        result.status = 'failed'; result.error = error.stack || String(error);
      } finally {
        fixture.release();
        if (observing) await session.network.stop();
        if (page) {
          try {
            result.evidence = await page.evaluate(async settings => {
              const evidence = window.__startupVisual;
              if (!evidence) throw new Error('The startup observer must be installed before boot-theme.js');
              evidence.stop();
              const preview = localStorage.getItem('midori_wallpaper_previews_v1');
              const previewCache = preview ? JSON.parse(preview) : null;
              let previewDecoded = null;
              if (settings.corruption) {
                const selected = previewCache?.entries?.find(entry => entry?.key === settings.wallpaper);
                const image = new Image();
                image.src = selected?.dataUrl || '';
                try { await image.decode(); previewDecoded = image.naturalWidth > 0; }
                catch { previewDecoded = false; }
              }
              return { frames: evidence.frames, paints: evidence.paints, shifts: evidence.shifts, sources: evidence.sources,
                visibilityChanges: evidence.visibilityChanges, errors: evidence.errors,
                marks: window.__midoriPerf?.marks || {}, previewCache, previewDecoded,
                rotationIndex: Number(localStorage.getItem('unsplash_cache_index')),
                previewCacheBytes: preview ? new Blob([preview]).size : 0 };
            }, { corruption: scenario.corruption, wallpaper: scenario.wallpaper });
            if (outputDir) await page.screenshot({ path: join(outputDir, `${scenario.id}-final.png`) });
            if (result.status === 'captured') {
              result.measurements = validateVisual(result.evidence, scenario);
              result.status = 'passed';
            }
          } catch (error) { result.status = 'failed'; result.error = error.stack || String(error); }
          await page.close();
        }
        if (outputDir) writeFileSync(join(outputDir, `${scenario.id}.json`), `${JSON.stringify(result, null, 2)}\n`);
      }
    }
    report.passed = report.cases.every(result => result.status === 'passed');
    if (outputDir) writeFileSync(join(outputDir, 'startup-visual.json'), `${JSON.stringify({ ...report,
      cases: report.cases.map(({ evidence, ...result }) => ({ ...result, evidence: `${result.id}.json` })) }, null, 2)}\n`);
    if (throwOnFailure) assert.equal(report.passed, true,
      `Startup visual regressions: ${report.cases.filter(result => result.status !== 'passed').map(result => `${result.id}: ${result.error}`).join('\n')}`);
    return report;
  } finally { await fixture.close(); }
}

async function startVisualDisplay(viewport) {
  if (process.platform !== 'linux') throw new Error('Chromium visual integration requires Linux and Xvfb for an isolated headed display');
  const screen = { width: viewport.width + 128, height: viewport.height + 192 };
  const child = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', `${screen.width}x${screen.height}x24`,
    '-nolisten', 'tcp', '-noreset'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe'],
    env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' } });
  let log = '';
  child.stderr.on('data', chunk => { log = (log + chunk).slice(-4000); });
  const closed = new Promise(resolve => child.once('close', resolve));
  const close = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const force = setTimeout(() => child.kill('SIGKILL'), 2000);
    try { await closed; } finally { clearTimeout(force); }
  };
  try {
    const display = await new Promise((resolve, reject) => {
      let output = '';
      const timeout = setTimeout(() => reject(new Error(`Xvfb did not become ready: ${log}`)), 10_000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      child.once('error', error => fail(new Error(`Cannot start isolated Xvfb: ${error.message}. Install it with npx playwright install --with-deps chromium`)));
      child.once('exit', (code, signal) => fail(new Error(`Xvfb exited (${code ?? signal}): ${log}`)));
      child.stdio[3].on('data', chunk => {
        output += chunk;
        if (/^\d+\n/.test(output)) { clearTimeout(timeout); resolve(`:${Number(output.trim())}`); }
      });
    });
    return { close, env: { ...process.env, DISPLAY: display, WAYLAND_DISPLAY: '', XDG_SESSION_TYPE: 'x11' },
      metadata: { kind: 'Xvfb', display, isolated: true, tcpDisabled: true, screen, pid: child.pid } };
  } catch (error) { await close(); throw error; }
}

export async function runStartupVisualIntegration({ engine, extensionPath, outputDir, openSession = openContextWithRetry, throwOnFailure = true, scenarioIds }) {
  const directory = mkdtempSync(join(tmpdir(), 'midori-startup-visual-'));
  let session;
  let display;
  try {
    cpSync(extensionPath, directory, { recursive: true });
    instrumentStartupVisualFixture(directory);
    const artifact = { extensionPath, ...artifactIdentity(extensionPath) };
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'artifact.json'), `${JSON.stringify(artifact, null, 2)}\n`);
    }
    const viewport = { width: 1280, height: 800 };
    if (engine === 'chromium') display = await startVisualDisplay(viewport);
    session = await openSession({ engine, extensionPath: directory, viewport,
      ...(display ? { headless: false, nativeFocus: true, env: display.env, chromiumArgs: ['--ozone-platform=x11'] } : {}) });
    session.metadata.artifactSha256 = artifact.sha256;
    if (display) session.metadata.visualDisplay = { ...display.metadata, focusEmulation: false };
    return await runStartupVisualSessionIntegration(session, { outputDir, throwOnFailure, scenarioIds });
  } finally {
    try {
      if (session) {
        await closeContext(session);
        assert.equal(existsSync(session.profile), false, 'The visual integration profile must be deleted');
      }
    } finally {
      try { await display?.close(); }
      finally { rmSync(directory, { recursive: true, force: true }); }
    }
  }
}
