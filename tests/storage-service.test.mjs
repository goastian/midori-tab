import assert from 'node:assert/strict'
import test from 'node:test'

import { flushDebounced, getJson, quotaSafeSet, remove, setJsonDebounced } from '../src/services/StorageService.js'

function createLocalStorage(seed = {}) {
  const state = { ...seed }
  return {
    state,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null
    },
    setItem(key, value) {
      state[key] = String(value)
    },
    removeItem(key) {
      delete state[key]
    },
  }
}

function wrap(value, updatedAt) {
  return {
    __midoriStorageVersion: 1,
    value,
    updatedAt,
  }
}

function installCleanGlobals() {
  delete globalThis.browser
  delete globalThis.chrome
  globalThis.localStorage = createLocalStorage()
}

test('setJsonDebounced mirrors data into localStorage before extension storage flushes', async () => {
  installCleanGlobals()
  const extensionState = {}
  globalThis.chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: extensionState[key] })
        },
        set(payload, callback) {
          Object.assign(extensionState, payload)
          callback()
        },
        remove(key, callback) {
          delete extensionState[key]
          callback()
        },
      },
    },
  }

  const key = 'midori_test_bookmarks_debounced'
  const value = { Personal: [{ title: 'Astian', url: 'https://astian.org' }] }

  setJsonDebounced(key, value, { delayMs: 10_000 })

  assert.deepEqual(await getJson(key, null), value)
  assert.equal(extensionState[key], undefined)

  await flushDebounced(key, value)
  await remove(key)
})

test('getJson prefers the newest payload between extension storage and local mirror', async () => {
  installCleanGlobals()
  const key = 'midori_test_bookmarks_newest'
  const oldValue = { Personal: [{ title: 'Old', url: 'https://old.example' }] }
  const newValue = { Personal: [{ title: 'New', url: 'https://new.example' }] }
  const extensionState = { [key]: wrap(oldValue, 100) }
  localStorage.setItem(key, JSON.stringify(wrap(newValue, 200)))

  globalThis.browser = {
    storage: {
      local: {
        async get(requestedKey) {
          return { [requestedKey]: extensionState[requestedKey] }
        },
        async set(payload) {
          Object.assign(extensionState, payload)
        },
        async remove(requestedKey) {
          delete extensionState[requestedKey]
        },
      },
    },
  }

  assert.deepEqual(await getJson(key, null), newValue)
  await remove(key)
})

test('quotaSafeSet writes through chrome callback storage', async () => {
  installCleanGlobals()
  const extensionState = {}
  globalThis.chrome = {
    runtime: {},
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: extensionState[key] })
        },
        set(payload, callback) {
          Object.assign(extensionState, payload)
          callback()
        },
        remove(key, callback) {
          delete extensionState[key]
          callback()
        },
      },
    },
  }

  const key = 'midori_test_chrome_storage'
  const value = ['Personal', 'Work']

  await quotaSafeSet(key, value)

  assert.deepEqual(extensionState[key].value, value)
  assert.deepEqual(await getJson(key, null), value)
  await remove(key)
})

test('quotaSafeSet writes through browser promise storage without callback arguments', async () => {
  installCleanGlobals()
  const extensionState = {}
  const calls = []
  globalThis.browser = {
    storage: {
      local: {
        async get(key) {
          calls.push(['get', arguments.length])
          return { [key]: extensionState[key] }
        },
        async set(payload) {
          calls.push(['set', arguments.length])
          Object.assign(extensionState, payload)
        },
        async remove(key) {
          calls.push(['remove', arguments.length])
          delete extensionState[key]
        },
      },
    },
  }

  const key = 'midori_test_browser_storage'
  const value = { openLink: 'Self Tab' }

  await quotaSafeSet(key, value)

  assert.deepEqual(await getJson(key, null), value)
  assert.deepEqual(calls, [['set', 1], ['get', 1]])
  await remove(key)
})