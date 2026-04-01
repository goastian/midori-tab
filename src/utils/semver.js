const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/

function toVersionParts(version) {
  return String(version || '')
    .split(/[^0-9]+/)
    .filter(Boolean)
    .map(part => Number.parseInt(part, 10) || 0)
}

function compareIdentifiers(left, right) {
  const leftIsNumeric = /^\d+$/.test(left)
  const rightIsNumeric = /^\d+$/.test(right)

  if (leftIsNumeric && rightIsNumeric) {
    return Number.parseInt(left, 10) - Number.parseInt(right, 10)
  }

  if (leftIsNumeric) return -1
  if (rightIsNumeric) return 1
  return left.localeCompare(right)
}

export function compareVersions(left, right) {
  const leftParts = toVersionParts(left)
  const rightParts = toVersionParts(right)
  const size = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < size; index += 1) {
    const leftValue = leftParts[index] || 0
    const rightValue = rightParts[index] || 0
    if (leftValue > rightValue) return 1
    if (leftValue < rightValue) return -1
  }

  return 0
}

export function parseSemver(input) {
  const normalized = String(input || '').trim()
  const match = normalized.match(SEMVER_RE)

  if (!match) return null

  const major = Number.parseInt(match[1] || '0', 10)
  const minor = Number.parseInt(match[2] || '0', 10)
  const patch = Number.parseInt(match[3] || '0', 10)
  const prerelease = match[4] ? match[4].split('.').filter(Boolean) : []

  return {
    raw: normalized,
    version: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
    prerelease,
    build: match[5] || '',
  }
}

export function compareSemver(left, right) {
  const leftVersion = parseSemver(left)
  const rightVersion = parseSemver(right)

  if (!leftVersion || !rightVersion) {
    return compareVersions(left, right)
  }

  if (leftVersion.major !== rightVersion.major) {
    return leftVersion.major > rightVersion.major ? 1 : -1
  }

  if (leftVersion.minor !== rightVersion.minor) {
    return leftVersion.minor > rightVersion.minor ? 1 : -1
  }

  if (leftVersion.patch !== rightVersion.patch) {
    return leftVersion.patch > rightVersion.patch ? 1 : -1
  }

  const leftHasPrerelease = leftVersion.prerelease.length > 0
  const rightHasPrerelease = rightVersion.prerelease.length > 0

  if (!leftHasPrerelease && !rightHasPrerelease) return 0
  if (!leftHasPrerelease) return 1
  if (!rightHasPrerelease) return -1

  const size = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < size; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index]
    const rightIdentifier = rightVersion.prerelease[index]

    if (leftIdentifier === undefined) return -1
    if (rightIdentifier === undefined) return 1

    const result = compareIdentifiers(leftIdentifier, rightIdentifier)
    if (result !== 0) return result > 0 ? 1 : -1
  }

  return 0
}

export function isStableSemver(input) {
  const parsed = parseSemver(input)
  return Boolean(parsed && parsed.prerelease.length === 0)
}