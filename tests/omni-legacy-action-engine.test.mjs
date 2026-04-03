import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadActionModule() {
  const src = readFileSync(new URL('../omni/src/action-engine.js', import.meta.url), 'utf8');
  const sandbox = { globalThis: {}, module: { exports: {} }, exports: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.OmniLegacyActions || sandbox.module.exports;
}

test('execute remove path sends remove request and closes', () => {
  const mod = loadActionModule();
  const sent = [];
  let closed = 0;

  const engine = mod.createActionEngine({
    sendMessage: (payload) => sent.push(payload),
    closeOmni: () => { closed += 1; },
  });

  const action = { type: 'bookmark', action: 'bookmark', title: 'Docs' };
  engine.execute(action, { queryValue: '/remove docs' });

  assert.equal(closed, 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].request, 'remove');
});

test('execute history/bookmarks path opens URL', () => {
  const mod = loadActionModule();
  const opened = [];

  const engine = mod.createActionEngine({
    sendMessage: () => {},
    closeOmni: () => {},
    windowRef: {
      open(url, target) {
        opened.push({ url, target: target || null });
      },
    },
  });

  const action = { type: 'history', action: 'history', url: 'https://example.com' };
  engine.execute(action, { queryValue: '/history test', event: { ctrlKey: false, metaKey: false } });

  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'https://example.com');
  assert.equal(opened[0].target, '_self');
});

test('execute generic action sends message and runs goto side effect', () => {
  const mod = loadActionModule();
  const sent = [];
  const opened = [];

  const engine = mod.createActionEngine({
    sendMessage: (payload) => sent.push(payload),
    closeOmni: () => {},
    addHttp: (v) => 'http://' + v,
    windowRef: {
      open(url, target) {
        opened.push({ url, target: target || null });
      },
      scrollTo() {},
      print() {},
    },
    documentRef: { body: { scrollHeight: 100 }, documentElement: {} },
    showToast: () => {},
  });

  const action = { type: 'special', action: 'goto', title: 'Go' };
  engine.execute(action, { queryValue: 'example.com', event: { ctrlKey: false, metaKey: false } });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].request, 'goto');
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, 'http://example.com');
});
