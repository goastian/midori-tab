import assert from 'node:assert/strict'
import test from 'node:test'

import MidoriUpdateService from '../src/services/MidoriUpdateService.js'

function createMemoryStorage(seed = {}) {
  const state = { ...seed }
  return {
    state,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(state, key) ? state[key] : null
    },
    setItem(key, value) {
      state[key] = String(value)
    },
  }
}

function createClientMock(sequence) {
  const calls = []
  return {
    calls,
    async getLatestStableRelease(options = {}) {
      calls.push(options)
      const next = sequence.shift()
      if (next instanceof Error) throw next
      return next
    },
  }
}

test('omite red si no es Midori', async () => {
  const storage = createMemoryStorage()
  const client = createClientMock([])
  const service = new MidoriUpdateService({ storage, client })

  const result = await service.checkForUpdate({
    browserInfo: { isMidori: false },
    currentVersion: '1.0.0',
    now: 10_000,
  })

  assert.equal(result.source, 'skipped')
  assert.equal(result.reason, 'not-midori')
  assert.equal(client.calls.length, 0)
})

test('usa cache diaria y evita segunda llamada de red en la misma ventana', async () => {
  const storage = createMemoryStorage()
  const client = createClientMock([
    {
      release: {
        version: '9.0.0',
        name: 'v9.0.0',
      },
      etag: 'W/etag-1',
      status: 200,
      notModified: false,
    },
  ])
  const service = new MidoriUpdateService({ storage, client })

  const first = await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1_000,
  })

  const second = await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 2_000,
  })

  assert.equal(first.eligible, true)
  assert.equal(first.latestVersion, '9.0.0')
  assert.equal(second.source, 'cache')
  assert.equal(second.reason, 'daily-window-active')
  assert.equal(client.calls.length, 1)
})

test('reutiliza ETag al expirar cache diaria y responde 304', async () => {
  const storage = createMemoryStorage()
  const client = createClientMock([
    {
      release: { version: '3.0.0', name: 'v3.0.0' },
      etag: 'W/etag-2',
      status: 200,
      notModified: false,
    },
    {
      release: null,
      etag: 'W/etag-2',
      status: 304,
      notModified: true,
    },
  ])
  const service = new MidoriUpdateService({ storage, client })

  await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1_000,
  })

  const nextDay = await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1_000 + 24 * 60 * 60 * 1000 + 1,
  })

  assert.equal(nextDay.reason, 'not-modified')
  assert.equal(nextDay.latestVersion, '3.0.0')
  assert.deepEqual(client.calls[1].headers, { 'If-None-Match': 'W/etag-2' })
})

test('deferForToday bloquea la alerta hasta el siguiente dia', async () => {
  const storage = createMemoryStorage()
  const client = createClientMock([
    {
      release: { version: '10.0.0', name: 'v10.0.0' },
      etag: 'W/etag-3',
      status: 200,
      notModified: false,
    },
  ])
  const service = new MidoriUpdateService({ storage, client })

  await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1_000,
  })

  service.deferForToday({ now: 2_000 })

  const sameDay = service.getEligibility({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 3_000,
  })

  const nextDay = service.getEligibility({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 2_000 + 24 * 60 * 60 * 1000 + 1,
  })

  assert.equal(sameDay.eligible, false)
  assert.equal(sameDay.deferredToday, true)
  assert.equal(nextDay.deferredToday, false)
  assert.equal(nextDay.eligible, true)
})

test('tolera cache corrupta y vuelve a calcular estado', async () => {
  const storage = createMemoryStorage({
    midori_update_check_state_v1: '{invalid-json',
  })
  const client = createClientMock([
    {
      release: { version: '2.1.0', name: 'v2.1.0' },
      etag: 'W/etag-4',
      status: 200,
      notModified: false,
    },
  ])
  const service = new MidoriUpdateService({ storage, client })

  const result = await service.checkForUpdate({
    browserInfo: { isMidori: true },
    currentVersion: '2.0.0',
    now: 100,
  })

  assert.equal(result.eligible, true)
  assert.equal(result.latestVersion, '2.1.0')
  assert.equal(client.calls.length, 1)
})

test('no muestra alerta cuando latestVersion es igual o prerelease', () => {
  const storage = createMemoryStorage()
  const service = new MidoriUpdateService({ storage, client: createClientMock([]) })

  storage.setItem('midori_update_check_state_v1', JSON.stringify({
    latestVersion: '1.0.0',
  }))

  const equalVersion = service.getEligibility({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1,
  })

  storage.setItem('midori_update_check_state_v1', JSON.stringify({
    latestVersion: '1.0.0-beta.1',
  }))

  const prereleaseVersion = service.getEligibility({
    browserInfo: { isMidori: true },
    currentVersion: '1.0.0',
    now: 1,
  })

  assert.equal(equalVersion.eligible, false)
  assert.equal(prereleaseVersion.eligible, false)
})