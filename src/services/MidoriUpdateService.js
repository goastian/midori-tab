import GitHubReleaseClient from './GitHubReleaseClient.js'
import { APP_VERSION } from '../utils/appVersion.js'
import { compareSemver } from '../utils/semver.js'

const STORAGE_KEY = 'midori_update_check_state_v1'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_NO_UPDATE_WINDOW_MS = 2 * 60 * 60 * 1000
const DEFAULT_ERROR_WINDOW_MS = 30 * 60 * 1000

function createStorageAdapter() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage
    }
  } catch (error) {
  }

  return {
    getItem() {
      return null
    },
    setItem() {
    },
  }
}

function toTimestamp(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function sanitizeCache(raw) {
  const cache = raw && typeof raw === 'object' ? raw : {}

  return {
    lastCheckedAt: toTimestamp(cache.lastCheckedAt),
    latestVersion: typeof cache.latestVersion === 'string' ? cache.latestVersion : '',
    latestRelease: cache.latestRelease && typeof cache.latestRelease === 'object' ? cache.latestRelease : null,
    etag: typeof cache.etag === 'string' ? cache.etag : '',
    lastResult: typeof cache.lastResult === 'string' ? cache.lastResult : 'unknown',
    deferredUntil: toTimestamp(cache.deferredUntil),
    lastError: typeof cache.lastError === 'string' ? cache.lastError : '',
  }
}

function isWithinWindow(timestamp, now, windowMs) {
  if (!timestamp) return false
  return now - timestamp < windowMs
}

export default class MidoriUpdateService {
  constructor(options = {}) {
    this.storageKey = options.storageKey || STORAGE_KEY
    this.storage = options.storage || createStorageAdapter()
    this.client = options.client || new GitHubReleaseClient({ timeout: options.timeout })
    this.dailyWindowMs = Number(options.dailyWindowMs) > 0 ? Number(options.dailyWindowMs) : ONE_DAY_MS
    this.noUpdateWindowMs = Number(options.noUpdateWindowMs) > 0
      ? Number(options.noUpdateWindowMs)
      : DEFAULT_NO_UPDATE_WINDOW_MS
    this.errorWindowMs = Number(options.errorWindowMs) > 0
      ? Number(options.errorWindowMs)
      : DEFAULT_ERROR_WINDOW_MS
  }

  #getCheckWindowMs(state, currentVersion) {
    if (state.lastResult === 'error') {
      return this.errorWindowMs
    }

    const hasCachedUpdate = state.latestVersion
      ? compareSemver(state.latestVersion, currentVersion) > 0
      : false

    return hasCachedUpdate ? this.dailyWindowMs : this.noUpdateWindowMs
  }

  getCachedState() {
    try {
      const raw = this.storage.getItem(this.storageKey)
      if (!raw) return sanitizeCache(null)
      return sanitizeCache(JSON.parse(raw))
    } catch (error) {
      return sanitizeCache(null)
    }
  }

  async checkForUpdate(options = {}) {
    const now = Number(options.now) > 0 ? Number(options.now) : Date.now()
    const browserInfo = options.browserInfo || null
    const currentVersion = options.currentVersion || APP_VERSION
    const force = Boolean(options.force)
    const state = this.getCachedState()

    if (!browserInfo?.isMidori) {
      return {
        state,
        currentVersion,
        source: 'skipped',
        reason: 'not-midori',
        checkedAt: now,
        ...this.getEligibility({ browserInfo, currentVersion, state, now }),
      }
    }

    const checkWindowMs = this.#getCheckWindowMs(state, currentVersion)

    if (!force && isWithinWindow(state.lastCheckedAt, now, checkWindowMs)) {
      return {
        state,
        currentVersion,
        source: 'cache',
        reason: 'check-window-active',
        checkedAt: state.lastCheckedAt,
        ...this.getEligibility({ browserInfo, currentVersion, state, now }),
      }
    }

    const headers = state.etag ? { 'If-None-Match': state.etag } : {}

    try {
      const response = await this.client.getLatestStableRelease({ headers })
      const nextState = {
        ...state,
        lastCheckedAt: now,
        etag: response.etag || state.etag,
        lastError: '',
      }

      if (response.notModified) {
        nextState.lastResult = 'not-modified'
        this.#persistState(nextState)
        return {
          state: nextState,
          currentVersion,
          source: 'network',
          reason: 'not-modified',
          checkedAt: now,
          ...this.getEligibility({ browserInfo, currentVersion, state: nextState, now }),
        }
      }

      nextState.latestVersion = response.release?.version || ''
      nextState.latestRelease = response.release || null
      nextState.lastResult = nextState.latestVersion ? 'ok' : 'no-release'

      this.#persistState(nextState)

      return {
        state: nextState,
        currentVersion,
        source: 'network',
        reason: 'fetched',
        checkedAt: now,
        ...this.getEligibility({ browserInfo, currentVersion, state: nextState, now }),
      }
    } catch (error) {
      const nextState = {
        ...state,
        lastCheckedAt: now,
        lastResult: 'error',
        lastError: error?.message || 'unknown-error',
      }

      this.#persistState(nextState)

      return {
        state: nextState,
        currentVersion,
        source: 'network',
        reason: 'error',
        checkedAt: now,
        error,
        ...this.getEligibility({ browserInfo, currentVersion, state: nextState, now }),
      }
    }
  }

  getEligibility({ browserInfo, currentVersion = APP_VERSION, state = this.getCachedState(), now = Date.now() } = {}) {
    const latestVersion = state.latestVersion || ''
    const hasNewerVersion = latestVersion
      ? compareSemver(latestVersion, currentVersion) > 0
      : false
    const deferredToday = isWithinWindow(state.deferredUntil, now, this.dailyWindowMs)
    const eligible = Boolean(browserInfo?.isMidori && hasNewerVersion && !deferredToday)

    return {
      eligible,
      latestVersion,
      latestRelease: state.latestRelease,
      deferredToday,
      hasNewerVersion,
      isMidori: Boolean(browserInfo?.isMidori),
    }
  }

  deferForToday(options = {}) {
    const now = Number(options.now) > 0 ? Number(options.now) : Date.now()
    const state = this.getCachedState()
    const nextState = {
      ...state,
      deferredUntil: now,
      lastResult: 'deferred',
    }

    this.#persistState(nextState)
    return nextState
  }

  #persistState(state) {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(sanitizeCache(state)))
    } catch (error) {
    }
  }
}