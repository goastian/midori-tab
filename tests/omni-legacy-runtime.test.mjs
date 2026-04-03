import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function loadRuntime(chromeMock) {
  const src = readFileSync(new URL('../omni/src/runtime-messages.js', import.meta.url), 'utf8');
  const sandbox = { globalThis: {}, module: { exports: {} }, exports: {}, chrome: chromeMock };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.OmniLegacyRuntime || sandbox.module.exports;
}

test('sendMessage returns response through callback', () => {
  const chromeMock = {
    runtime: {
      lastError: null,
      sendMessage(payload, cb) {
        cb({ ok: true, payload });
      },
      onMessage: {
        addListener() {},
        removeListener() {},
      },
    },
  };

  const runtime = loadRuntime(chromeMock);

  let response = null;
  runtime.sendMessage({ request: 'ping' }, (r) => {
    response = r;
  });

  assert.deepEqual(response, { ok: true, payload: { request: 'ping' } });
});

test('sendMessage returns null when runtime throws', () => {
  const chromeMock = {
    runtime: {
      lastError: null,
      sendMessage() {
        throw new Error('boom');
      },
      onMessage: {
        addListener() {},
        removeListener() {},
      },
    },
  };

  const runtime = loadRuntime(chromeMock);
  let response = 'unset';
  runtime.sendMessage({ request: 'ping' }, (r) => {
    response = r;
  });

  assert.equal(response, null);
});

test('add/remove listener return true on success', () => {
  const listeners = [];
  const chromeMock = {
    runtime: {
      lastError: null,
      sendMessage(_payload, cb) {
        cb({ ok: true });
      },
      onMessage: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const idx = listeners.indexOf(fn);
          if (idx >= 0) listeners.splice(idx, 1);
        },
      },
    },
  };

  const runtime = loadRuntime(chromeMock);
  const fn = () => {};

  assert.equal(runtime.addMessageListener(fn), true);
  assert.equal(listeners.length, 1);
  assert.equal(runtime.removeMessageListener(fn), true);
  assert.equal(listeners.length, 0);
});
