import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadInputModule() {
  const src = readFileSync(new URL('../omni/src/input-controller.js', import.meta.url), 'utf8');
  const sandbox = {
    globalThis: {},
    module: { exports: {} },
    exports: {},
    window: {
      open(url) {
        sandbox.__opened = url;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.OmniLegacyInputController || sandbox.module.exports;
}

test('keydown navigates and triggers action when open', () => {
  const mod = loadInputModule();
  const calls = [];

  const controller = mod.createInputController({
    isOpen: () => true,
    moveSelection: (delta) => calls.push(['move', delta]),
    closeOmni: () => calls.push(['close']),
    handleAction: () => calls.push(['action']),
  });

  controller.onDocumentKeydown({ keyCode: 38, preventDefault() {} });
  controller.onDocumentKeydown({ keyCode: 40, preventDefault() {} });
  controller.onDocumentKeydown({ keyCode: 27, preventDefault() {} });
  controller.onDocumentKeydown({ keyCode: 13, preventDefault() {} });

  assert.deepEqual(calls, [
    ['move', -1],
    ['move', 1],
    ['close'],
    ['action'],
  ]);
});

test('keyup ALT+SHIFT+P toggles pin and refreshes search', () => {
  const mod = loadInputModule();
  const sent = [];
  let refreshed = 0;
  let searched = 0;

  const controller = mod.createInputController({
    isOpen: () => true,
    sendMessage: (payload) => sent.push(payload),
    hasAction: (name) => name === 'pin',
    refreshActions: (done) => {
      refreshed += 1;
      done();
    },
    runSearch: (value) => {
      searched += 1;
      assert.equal(value, '/tabs docs');
    },
    getInputValue: () => '/tabs docs',
  });

  controller.onDocumentKeydown({ keyCode: 18, preventDefault() {} });
  controller.onDocumentKeydown({ keyCode: 16, preventDefault() {} });
  controller.onDocumentKeydown({ keyCode: 80, preventDefault() {} });
  controller.onDocumentKeyup({ keyCode: 80, key: 'P', altKey: true, shiftKey: true });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].request, 'pin-tab');
  assert.equal(refreshed, 1);
  assert.equal(searched, 1);
});

test('keyup escape notifies close request when open', () => {
  const mod = loadInputModule();
  const sent = [];

  const controller = mod.createInputController({
    isOpen: () => true,
    sendMessage: (payload) => sent.push(payload),
  });

  controller.onDocumentKeyup({ keyCode: 27, key: 'Escape', altKey: false, shiftKey: false });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].request, 'close-omni');
});
