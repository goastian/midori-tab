import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'

function loadBackground({ sendMessage }) {
  const calls = {
    createdTabs: [],
    executedScripts: [],
    runtimeMessages: [],
    sentMessages: [],
    updatedTabs: [],
  }

  const chrome = {
    runtime: {
      lastError: null,
      getURL: (path) => `moz-extension://midori/${path}`,
      sendMessage(message, callback) {
        calls.runtimeMessages.push(message)
        callback?.({})
      },
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
    },
    commands: { onCommand: { addListener() {} } },
    action: { onClicked: { addListener() {} } },
    bookmarks: {
      onCreated: { addListener() {} },
      onRemoved: { addListener() {} },
      onChanged: { addListener() {} },
      onMoved: { addListener() {} },
    },
    tabs: {
      onCreated: { addListener() {} },
      onRemoved: { addListener() {} },
      onReplaced: { addListener() {} },
      onUpdated: { addListener() {} },
      onActivated: { addListener() {} },
      sendMessage(tabId, message, callback) {
        calls.sentMessages.push({ tabId, message })
        sendMessage({ chrome, tabId, message, callback })
      },
      create(payload, callback) {
        calls.createdTabs.push(payload)
        callback?.({})
      },
      update(tabId, payload, callback) {
        calls.updatedTabs.push({ tabId, payload })
        callback?.({ id: tabId, ...payload })
      },
      query(_options, callback) {
        callback([{ id: 12, index: 0, windowId: 1, url: 'about:newtab', title: 'Midori' }])
      },
    },
    windows: {
      onFocusChanged: { addListener() {} },
    },
    scripting: {
      executeScript(payload, callback) {
        calls.executedScripts.push(payload)
        callback?.()
      },
    },
    storage: { local: { get(_keys, callback) { callback({}) } } },
    tabsDetectLanguage: undefined,
  }

  const context = vm.createContext({
    chrome,
    console,
    fetch,
    globalThis: {},
  })

  context.globalThis = context
  vm.runInContext(readFileSync(new URL('../public/background.js', import.meta.url), 'utf8'), context)
  return { calls, api: context.__midoriOmniBackground }
}

test('openOmniInTab opens Firefox new-tab override by message before about: fallback', async () => {
  const { calls, api } = loadBackground({
    sendMessage({ callback }) {
      callback({ ok: true })
    },
  })

  await api.openOmniInTab({ id: 7, url: 'about:newtab' })

  assert.equal(calls.sentMessages.length, 1)
  assert.equal(calls.sentMessages[0].tabId, 7)
  assert.equal(calls.sentMessages[0].message.request, 'open-omni')
  assert.equal(calls.createdTabs.length, 0)
  assert.equal(calls.executedScripts.length, 0)
})

test('openOmniInTab uses runtime message for Firefox about:newtab when tab message fails', async () => {
  const { calls, api } = loadBackground({
    sendMessage({ chrome, callback }) {
      chrome.runtime.lastError = { message: 'Receiving end does not exist.' }
      callback()
      chrome.runtime.lastError = null
    },
  })

  await api.openOmniInTab({ id: 8, url: 'about:newtab' })

  assert.equal(calls.sentMessages.length, 1)
  assert.equal(calls.runtimeMessages.length, 1)
  assert.equal(calls.runtimeMessages[0].request, 'open-omni-page')
  assert.equal(calls.createdTabs.length, 0)
  assert.equal(calls.executedScripts.length, 0)
})

test('executeOmniItem navigates the active Firefox tab for clicked URL results', async () => {
  const { calls, api } = loadBackground({
    sendMessage({ callback }) {
      callback({ ok: true })
    },
  })

  const result = await api.executeOmniItem({
    item: {
      type: 'action',
      action: 'url',
      url: 'https://astian.org',
    },
  })

  assert.equal(result.handled, true)
  assert.equal(calls.updatedTabs.length, 1)
  assert.equal(calls.updatedTabs[0].tabId, 12)
  assert.equal(calls.updatedTabs[0].payload.url, 'https://astian.org')
  assert.equal(calls.createdTabs.length, 0)
})
