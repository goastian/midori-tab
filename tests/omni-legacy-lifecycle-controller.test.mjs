import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadLifecycleModule() {
  const src = readFileSync(new URL('../omni/src/lifecycle-controller.js', import.meta.url), 'utf8');
  const fallback = [];
  const sandbox = {
    globalThis: {},
    module: { exports: {} },
    exports: {},
    chrome: {
      runtime: {
        onMessage: {
          addListener() {
            fallback.push('add');
          },
          removeListener() {
            fallback.push('remove');
          },
        },
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return {
    mod: sandbox.globalThis.OmniLegacyLifecycle || sandbox.module.exports,
    fallback,
  };
}

test('attach/detach wire and unwire document/window/runtime listeners', () => {
  const { mod } = loadLifecycleModule();

  const docEvents = [];
  const winEvents = [];
  const runtimeEvents = [];

  const controller = mod.createLifecycleController({
    documentRef: {
      addEventListener(type) {
        docEvents.push(['add', type]);
      },
      removeEventListener(type) {
        docEvents.push(['remove', type]);
      },
    },
    windowRef: {
      addEventListener(type, handler) {
        winEvents.push(['add', type, handler]);
      },
      removeEventListener(type) {
        winEvents.push(['remove', type]);
      },
    },
    onDocumentKeydown: () => {},
    onDocumentKeyup: () => {},
    onRuntimeMessage: () => {},
    addMessageListener: () => {
      runtimeEvents.push('add');
      return true;
    },
    removeMessageListener: () => {
      runtimeEvents.push('remove');
      return true;
    },
  });

  controller.attach();
  controller.detach();

  assert.deepEqual(docEvents, [
    ['add', 'keydown'],
    ['add', 'keyup'],
    ['remove', 'keydown'],
    ['remove', 'keyup'],
  ]);
  assert.equal(winEvents[0][0], 'add');
  assert.equal(winEvents[0][1], 'pagehide');
  assert.deepEqual(runtimeEvents, ['add', 'remove']);
});

test('attach uses chrome runtime fallback when runtime wrapper is unavailable', () => {
  const { mod, fallback } = loadLifecycleModule();

  const controller = mod.createLifecycleController({
    documentRef: {
      addEventListener() {},
      removeEventListener() {},
    },
    windowRef: {
      addEventListener() {},
      removeEventListener() {},
    },
    onDocumentKeydown: () => {},
    onDocumentKeyup: () => {},
    onRuntimeMessage: () => {},
    addMessageListener: () => false,
    removeMessageListener: () => false,
  });

  controller.attach();
  controller.detach();

  assert.deepEqual(fallback, ['add', 'remove']);
});
