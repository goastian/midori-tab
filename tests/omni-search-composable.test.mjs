import assert from 'node:assert/strict'
import test from 'node:test'

import { createPinia, setActivePinia } from 'pinia'
import { useOmniSearch } from '../src/omni/composables/useOmniSearch.js'

test('useOmniSearch creates with its store import available', () => {
  setActivePinia(createPinia())
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage(_request, callback) {
        callback({ results: [] })
      },
    },
  }

  const omniSearch = useOmniSearch()

  assert.equal(typeof omniSearch.search, 'function')
})
