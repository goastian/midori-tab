import { compareSemver, isStableSemver, parseSemver } from '../utils/semver.js'

const DEFAULT_TIMEOUT = 4000
const DEFAULT_API_BASE_URL = 'https://api.github.com'
const DEFAULT_REPOSITORY = 'goastian/midori-desktop'
const DEFAULT_PER_PAGE = 10

function normalizeRepository(repository) {
  const normalized = String(repository || '').trim().replace(/^\/+|\/+$/g, '')
  if (!normalized || !normalized.includes('/')) {
    throw new Error('GitHub repository must use the "owner/name" format.')
  }

  return normalized
}

function buildReleasesUrl(apiBaseUrl, repository, perPage) {
  const url = new URL(`${apiBaseUrl}/repos/${repository}/releases`)
  url.searchParams.set('per_page', String(perPage))
  return url
}

function normalizeRelease(rawRelease) {
  const versionSource = rawRelease?.tag_name || rawRelease?.name || ''
  const parsedVersion = parseSemver(versionSource)

  if (!parsedVersion) return null

  return {
    id: rawRelease?.id ?? null,
    name: rawRelease?.name || rawRelease?.tag_name || parsedVersion.version,
    tagName: rawRelease?.tag_name || '',
    version: parsedVersion.version,
    isPrerelease: Boolean(rawRelease?.prerelease) || !isStableSemver(versionSource),
    isDraft: Boolean(rawRelease?.draft),
    publishedAt: rawRelease?.published_at || null,
    htmlUrl: rawRelease?.html_url || '',
    apiUrl: rawRelease?.url || '',
  }
}

export default class GitHubReleaseClient {
  constructor(options = {}) {
    this.apiBaseUrl = String(options.apiBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
    this.repository = normalizeRepository(options.repository || DEFAULT_REPOSITORY)
    this.timeout = Number(options.timeout) > 0 ? Number(options.timeout) : DEFAULT_TIMEOUT
    this.perPage = Number(options.perPage) > 0 ? Number(options.perPage) : DEFAULT_PER_PAGE
    this.fetchImpl = options.fetchImpl || globalThis.fetch
  }

  async getLatestStableRelease(options = {}) {
    const { headers = {}, signal } = options
    const response = await this.#fetchReleases({ headers, signal })
    const stableReleases = response.payload
      .map(normalizeRelease)
      .filter(release => release && !release.isDraft && !release.isPrerelease)
      .sort((left, right) => compareSemver(right.version, left.version))

    return {
      release: stableReleases[0] || null,
      etag: response.etag,
      status: response.status,
    }
  }

  async #fetchReleases(options = {}) {
    if (typeof this.fetchImpl !== 'function') {
      throw new Error('Fetch API is not available in the current environment.')
    }

    const { headers = {}, signal } = options
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
    const timeoutId = controller
      ? globalThis.setTimeout(() => controller.abort(), this.timeout)
      : null

    let abortListener = null
    if (controller && signal) {
      abortListener = () => controller.abort()
      signal.addEventListener('abort', abortListener, { once: true })
    }

    try {
      const response = await this.fetchImpl(buildReleasesUrl(this.apiBaseUrl, this.repository, this.perPage), {
        method: 'GET',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...headers,
        },
        signal: controller?.signal || signal,
      })

      if (!response.ok) {
        throw new Error(`GitHub releases request failed with status ${response.status}.`)
      }

      const payload = await response.json()
      return {
        payload: Array.isArray(payload) ? payload : [],
        etag: response.headers.get('etag') || '',
        status: response.status,
      }
    } catch (error) {
      if (error?.name === 'AbortError' || controller?.signal?.aborted) {
        throw new Error(`GitHub releases request timed out after ${this.timeout}ms.`)
      }

      throw error
    } finally {
      if (timeoutId) {
        globalThis.clearTimeout(timeoutId)
      }

      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener)
      }
    }
  }
}