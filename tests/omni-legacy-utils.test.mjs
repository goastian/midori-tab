import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadUtils() {
  const src = readFileSync(new URL('../omni/src/search-utils.js', import.meta.url), 'utf8');
  const sandbox = { globalThis: {}, module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.OmniLegacyUtils || sandbox.module.exports;
}

test('escapeHtml escapes dangerous chars', () => {
  const utils = loadUtils();
  const out = utils.escapeHtml('<img src="x" onerror=\'1\'>&');
  assert.equal(out, '&lt;img src=&quot;x&quot; onerror=&#39;1&#39;&gt;&amp;');
});

test('addHttp adds protocol only when missing', () => {
  const utils = loadUtils();
  assert.equal(utils.addHttp('example.com'), 'http://example.com');
  assert.equal(utils.addHttp('https://example.com'), 'https://example.com');
});

test('validURL identifies valid and invalid urls', () => {
  const utils = loadUtils();
  assert.equal(utils.validURL('example.com'), true);
  assert.equal(utils.validURL('https://example.com/path?q=1'), true);
  assert.equal(utils.validURL('nota url'), false);
});

test('filterByText matches title and desc/url', () => {
  const utils = loadUtils();
  const data = [
    { title: 'GitHub', desc: 'Code hosting' },
    { title: 'Example', url: 'https://example.com' },
    { title: 'News', desc: 'World' },
  ];

  assert.equal(utils.filterByText(data, 'git').length, 1);
  assert.equal(utils.filterByText(data, 'example.com').length, 1);
  assert.equal(utils.filterByText(data, 'world').length, 1);
  assert.equal(utils.filterByText(data, 'zzz').length, 0);
});
