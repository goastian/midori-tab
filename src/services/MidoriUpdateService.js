import GitHubReleaseClient from './GitHubReleaseClient.js'
import { APP_VERSION } from '../utils/appVersion.js'
import { compareSemver } from '../utils/semver.js'

const STORAGE_KEY = 'midori_update_check_state_v1'
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const DEFAULT_CHECK_INTERVAL_MS = 30 * 60 * 1000
const DEFAULT_DEFER_WINDOW_MS = ONE_DAY_MS

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
    this.checkIntervalMs = Number(options.checkIntervalMs) > 0
      ? Number(options.checkIntervalMs)
      : DEFAULT_CHECK_INTERVAL_MS
    this.errorRetryIntervalMs = Number(options.errorRetryIntervalMs) > 0
      ? Number(options.errorRetryIntervalMs)
      : this.checkIntervalMs
    this.deferWindowMs = Number(options.deferWindowMs) > 0
      ? Number(options.deferWindowMs)
      : DEFAULT_DEFER_WINDOW_MS
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

    const activeCheckWindowMs = state.lastResult === 'error'
      ? this.errorRetryIntervalMs
      : this.checkIntervalMs

    if (!force && isWithinWindow(state.lastCheckedAt, now, activeCheckWindowMs)) {
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
    const deferredToday = isWithinWindow(state.deferredUntil, now, this.deferWindowMs)
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