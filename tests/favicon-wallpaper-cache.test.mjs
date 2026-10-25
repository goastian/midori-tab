import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

const state = {};
globalThis.localStorage = {
  getItem: key => (Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null),
  setItem: (key, value) => { state[key] = String(value); },
  removeItem: key => { delete state[key]; },
};
Object.defineProperty(globalThis, 'navigator', { value: { connection: { saveData: false } }, configurable: true, writable: true });

const { FaviconService } = await import('../src/services/FaviconService.js');
const { readFaviconSnapshot, writeFaviconSnapshot } = await import('../src/services/faviconSnapshot.js');
const wallpaperCache = await import('../src/services/wallpaperPreviewCache.js');

const DAY = 24 * 60 * 60 * 1000;
const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

function memoryCaches({ failPut = false } = {}) {
  const store = new Map();
  const cache = {
    put: async (key, response) => { if (failPut) throw new DOMException('quota', 'QuotaExceededError'); store.set(String(key), response); },
    match: async key => { const response = store.get(String(key)); return response ? response.clone() : undefined; },
    keys: async () => [...store.keys()],
    delete: async key => store.delete(String(key)),
  };
  return { store, open: async () => cache };
}

function iconResponse(size = 200, type = 'image/png', status = 200) {
  return new Response(new Uint8Array(size), { status, headers: { 'Content-Type': type } });
}

function service(options = {}) {
  const caches = options.cacheStorage || memoryCaches();
  const requests = [];
  let now = options.start ?? 1_000_000;
  const instance = new FaviconService({ cacheStorage: caches, privilegedFetch: true, now: () => now, ...options,
    fetchFn: async (url, init) => { requests.push(String(url)); return (options.respond || (() => iconResponse()))(String(url), init); } });
  return { instance, caches, requests, advance: ms => { now += ms; } };
}

beforeEach(() => { for (const key of Object.keys(state)) delete state[key]; globalThis.navigator.connection.saveData = false; });

test('a fetched icon is cached and reused until it is a week old, then offered as stale', async () => {
  const { instance, requests, advance } = service();
  const icon = await instance.loadIcon('example.com');
  assert.ok(icon.blob.size > 0);
  assert.match(requests[0], /icons\.duckduckgo\.com\/ip3\/example\.com\.ico$/);
  const cached = await instance.readCached('example.com');
  assert.equal(cached.stale, false);
  assert.equal(cached.blob.size, 200);
  advance(8 * DAY);
  assert.equal((await instance.readCached('example.com')).stale, true, 'An old icon is still shown while a new one is requested');
  assert.equal(await instance.readCached('other.com'), null);
  assert.equal(requests.length, 1, 'Reading the cache never makes a request');
});

test('responses that are not usable icons are rejected and never cached', async () => {
  for (const respond of [() => iconResponse(100, 'text/html'), () => iconResponse(65 * 1024), () => iconResponse(0), () => iconResponse(100, 'image/png', 404)]) {
    const { instance, caches } = service({ respond });
    await assert.rejects(instance.loadIcon('example.com'), /Invalid favicon response/);
    assert.equal(caches.store.size, 0);
  }
});

test('cancelling a download does not write to the cache and is reported as a cancellation', async () => {
  const controller = new AbortController();
  const { instance, caches } = service({ respond: async (_url, init) => { await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); } });
  const pending = instance.loadIcon('example.com', { signal: controller.signal });
  await tick(10);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(caches.store.size, 0);
  const late = new AbortController();
  const arrives = service({ respond: async () => { late.abort(); return iconResponse(); } });
  await assert.rejects(arrives.instance.loadIcon('example.com', { signal: late.signal }), { name: 'AbortError' });
  assert.equal(arrives.caches.store.size, 0, 'An icon that arrives after cancelling is not stored');
});

test('a full or unavailable cache does not stop the icon from displaying', async () => {
  const { instance } = service({ cacheStorage: memoryCaches({ failPut: true }) });
  const icon = await instance.loadIcon('example.com');
  assert.equal(icon.blob.size, 200);
  const broken = service({ cacheStorage: { open: async () => { throw new Error('storage disabled'); } } });
  assert.equal((await broken.instance.loadIcon('example.com')).blob.size, 200);
  assert.equal(await broken.instance.readCached('example.com'), null);
});

test('the cache keeps at most 128 icons and 2 MiB, dropping the oldest first', async () => {
  const { instance, caches, advance } = service({ respond: () => iconResponse(30 * 1024) });
  for (let index = 0; index < 150; index += 1) {
    await instance.fetchIcon(`site-${index}.example`);
    advance(1000);
    await tick();
  }
  await tick(50);
  const keys = [...caches.store.keys()];
  assert.ok(keys.length <= 128);
  assert.ok(keys.length * 30 * 1024 <= 2 * 1024 * 1024 + 30 * 1024, `${keys.length} icons`);
  assert.ok(keys.some(key => key.includes('site-149.example')), 'The newest icon is kept');
  assert.ok(!keys.some(key => key.includes('site-0.example')), 'The oldest icon is dropped');
  await instance.remove('site-149.example');
  assert.equal(await instance.readCached('site-149.example'), null);
});

function imageFactory(behaviour) {
  return () => {
    const image = { naturalWidth: 0, removeAttribute() {}, set src(value) { this.requested = value; setTimeout(() => behaviour(this), 0); } };
    return image;
  };
}

test('the image fallback resolves, fails, times out and cancels cleanly', async () => {
  const ok = service({ privilegedFetch: false, imageFactory: imageFactory(image => { image.naturalWidth = 16; image.onload(); }) });
  assert.deepEqual(await ok.instance.loadIcon('example.com'), { url: 'https://icons.duckduckgo.com/ip3/example.com.ico' });
  const broken = service({ privilegedFetch: false, imageFactory: imageFactory(image => image.onerror()) });
  await assert.rejects(broken.instance.loadIcon('example.com'), /Favicon image failed/);
  const empty = service({ privilegedFetch: false, imageFactory: imageFactory(image => image.onload()) });
  await assert.rejects(empty.instance.loadIcon('example.com'), /Invalid favicon image/);
  const hung = service({ privilegedFetch: false, imageTimeoutMs: 20, imageFactory: imageFactory(() => {}) });
  await assert.rejects(hung.instance.loadIcon('example.com'), /timed out/);
  const controller = new AbortController();
  const slow = service({ privilegedFetch: false, imageFactory: imageFactory(() => {}) });
  const pending = slow.instance.loadIcon('example.com', { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(slow.instance.loadIcon('example.com', { signal: controller.signal }), { name: 'AbortError' });
});

test('a privileged fetch that is blocked falls back to the image path, but a cancellation does not', async () => {
  const blocked = service({ respond: () => { throw new TypeError('blocked'); },
    imageFactory: imageFactory(image => { image.naturalWidth = 16; image.onload(); }) });
  assert.ok((await blocked.instance.loadIcon('example.com')).url);
  assert.equal(blocked.instance.privilegedFetch, false, 'The fallback is remembered for later icons');
  const controller = new AbortController();
  const cancelled = service({ respond: async (_url, init) => { await new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); } });
  const pending = cancelled.instance.loadIcon('example.com', { signal: controller.signal });
  await tick(10);
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(cancelled.instance.privilegedFetch, true);
});

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

test('the first-frame favicon snapshot only keeps small valid images, 16 of them, within 64 KiB', () => {
  writeFaviconSnapshot('good.example', PNG, 100);
  writeFaviconSnapshot('script.example', 'data:text/html;base64,PHNjcmlwdD4=', 100);
  writeFaviconSnapshot('remote.example', 'https://evil.example/icon.png', 100);
  writeFaviconSnapshot('huge.example', `data:image/png;base64,${'A'.repeat(17_000)}`, 100);
  assert.deepEqual(Object.keys(readFaviconSnapshot().urls), ['good.example']);
  for (let index = 0; index < 30; index += 1) writeFaviconSnapshot(`site-${index}.example`, PNG, Date.now());
  const { urls, stale } = readFaviconSnapshot();
  assert.ok(Object.keys(urls).length <= 16);
  assert.ok(new Blob([state.midori_favicon_snapshot_v1]).size <= 64 * 1024);
  assert.ok(urls['site-29.example'], 'The newest icon is kept');
  assert.equal(stale['site-29.example'], false);
  writeFaviconSnapshot('site-29.example', null);
  assert.equal(readFaviconSnapshot().urls['site-29.example'], undefined, 'A failed icon is removed');
});

test('a corrupt or oversized snapshot is ignored instead of breaking the first frame', () => {
  state.midori_favicon_snapshot_v1 = '{not json';
  assert.deepEqual(readFaviconSnapshot().urls, {});
  state.midori_favicon_snapshot_v1 = JSON.stringify({ version: 2, icons: { a: { url: PNG } } });
  assert.deepEqual(readFaviconSnapshot().urls, {});
  state.midori_favicon_snapshot_v1 = `{"version":1,"icons":{"a":{"url":"${PNG}","pad":"${'x'.repeat(70_000)}"}}}`;
  assert.deepEqual(readFaviconSnapshot().urls, {});
  state.midori_favicon_snapshot_v1 = JSON.stringify({ version: 1, icons: { old: { url: PNG, fetchedAt: Date.now() - 8 * DAY } } });
  assert.equal(readFaviconSnapshot().stale.old, true);
});

const JPEG = 'data:image/jpeg;base64,/9j/4AAQ';

test('wallpaper previews ignore anything that is not a small image data URL', () => {
  const entries = [
    { key: 'https://img.example/a.jpg', dataUrl: JPEG },
    { key: 'https://img.example/b.jpg', dataUrl: 'data:text/html;base64,AAAA' },
    { key: 'https://img.example/c.jpg', dataUrl: `data:image/jpeg;base64,${'A'.repeat(140_000)}` },
    { key: 'x'.repeat(5000), dataUrl: JPEG },
    { key: 7, dataUrl: JPEG },
  ];
  state.midori_wallpaper_previews_v1 = JSON.stringify({ version: 1, entries });
  assert.equal(wallpaperCache.readWallpaperPreview('https://img.example/a.jpg'), JPEG);
  for (const key of ['https://img.example/b.jpg', 'https://img.example/c.jpg', 'x'.repeat(5000)]) assert.equal(wallpaperCache.readWallpaperPreview(key), '');
  state.midori_wallpaper_previews_v1 = '{broken';
  assert.equal(wallpaperCache.readWallpaperPreview('https://img.example/a.jpg'), '');
  state.midori_wallpaper_previews_v1 = JSON.stringify({ version: 1, entries: [{ key: 'https://img.example/a.jpg', dataUrl: JPEG, pad: 'x'.repeat(600_000) }] });
  assert.equal(wallpaperCache.readWallpaperPreview('https://img.example/a.jpg'), '', 'A store above its byte limit is discarded');
});

test('removing wallpaper previews keeps the others, by key or by prefix', () => {
  state.midori_wallpaper_previews_v1 = JSON.stringify({ version: 1, entries: [
    { key: 'https://a.example/1', dataUrl: JPEG }, { key: 'https://a.example/2', dataUrl: JPEG }, { key: 'https://b.example/1', dataUrl: JPEG },
  ] });
  wallpaperCache.removeWallpaperPreview('https://a.example/1');
  assert.equal(wallpaperCache.readWallpaperPreview('https://a.example/1'), '');
  assert.equal(wallpaperCache.readWallpaperPreview('https://a.example/2'), JPEG);
  wallpaperCache.removeWallpaperPreviews('https://a.example/');
  assert.equal(wallpaperCache.readWallpaperPreview('https://a.example/2'), '');
  assert.equal(wallpaperCache.readWallpaperPreview('https://b.example/1'), JPEG);
});

test('prewarming a preview does nothing with data saver, cancellation or an existing preview', async () => {
  globalThis.navigator.connection.saveData = true;
  assert.equal(await wallpaperCache.prewarmWallpaperPreview('https://img.example/next.jpg'), false);
  globalThis.navigator.connection.saveData = false;
  const controller = new AbortController();
  controller.abort();
  assert.equal(await wallpaperCache.prewarmWallpaperPreview('https://img.example/next.jpg', controller.signal), false);
  state.midori_wallpaper_previews_v1 = JSON.stringify({ version: 1, entries: [{ key: 'https://img.example/next.jpg', dataUrl: JPEG }] });
  assert.equal(await wallpaperCache.prewarmWallpaperPreview('https://img.example/next.jpg'), false, 'A known preview is not downloaded again');
  assert.equal(await wallpaperCache.prewarmWallpaperPreview(''), false);
});
