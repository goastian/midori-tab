import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadSearchModule() {
  const src = readFileSync(new URL('../omni/src/search-engine.js', import.meta.url), 'utf8');
  const sandbox = { globalThis: {}, module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.OmniLegacySearch || sandbox.module.exports;
}

test('normalizeShortcut expands and clears shorthand', () => {
  const mod = loadSearchModule();
  const engine = mod.createSearchEngine({});

  assert.equal(engine.normalizeShortcut(65, '/t'), '/tabs ');
  assert.equal(engine.normalizeShortcut(65, '/b'), '/bookmarks ');
  assert.equal(engine.normalizeShortcut(8, '/tabs'), '');
  assert.equal(engine.normalizeShortcut(8, '/history'), '');
});

test('applyQuery handles general and url composition', async () => {
  const mod = loadSearchModule();
  const actions = [
    { type: 'action', action: 'search', title: 'Search', desc: 'Search for a query' },
    { type: 'action', action: 'goto', title: 'Go', desc: 'Go to website' },
    { type: 'tab', action: 'switch-tab', title: 'GitHub', desc: 'tab' },
  ];

  const engine = mod.createSearchEngine({
    getActions: () => actions,
    sendMessage: (_payload, cb) => cb({}),
    filterByText: (list, q) => list.filter((x) => (x.title || '').toLowerCase().includes(q)),
    validURL: (s) => s.includes('.') && !s.includes(' '),
  });

  const general = await new Promise((resolve) => engine.applyQuery('git', resolve));
  assert.equal(general[0].action, 'search');
  assert.equal(general[1].title, 'GitHub');

  const url = await new Promise((resolve) => engine.applyQuery('example.com', resolve));
  assert.equal(url[0].action, 'goto');
  assert.equal(url[0].title, 'example.com');
});

test('applyQuery handles /history and /bookmarks branches', async () => {
  const mod = loadSearchModule();
  const actions = [
    { type: 'bookmark', action: 'bookmark', title: 'Docs', url: 'https://docs.example.com' },
  ];

  const engine = mod.createSearchEngine({
    getActions: () => actions,
    sendMessage: (payload, cb) => {
      if (payload.request === 'search-history') cb({ history: [{ title: 'H', url: 'https://h.dev' }] });
      else if (payload.request === 'search-bookmarks') cb({ bookmarks: [{ title: 'B', url: 'https://b.dev' }] });
      else cb({});
    },
  });

  const history = await new Promise((resolve) => engine.applyQuery('/history abc', resolve));
  assert.equal(history.length, 1);
  assert.equal(history[0].title, 'H');

  const bookmarks = await new Promise((resolve) => engine.applyQuery('/bookmarks abc', resolve));
  assert.equal(bookmarks.length, 1);
  assert.equal(bookmarks[0].title, 'B');

  const bookmarksAll = await new Promise((resolve) => engine.applyQuery('/bookmarks', resolve));
  assert.equal(bookmarksAll.length, 1);
  assert.equal(bookmarksAll[0].title, 'Docs');
});
