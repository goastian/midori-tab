import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { APP_VERSION } from './version.config.js'

export const DEV_HOST_PERMISSIONS = [
  'http://localhost/*',
  'http://127.0.0.1/*',
]

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function deepMerge(baseValue, overrideValue) {
  if (overrideValue === null) {
    return undefined
  }

  if (Array.isArray(overrideValue)) {
    return overrideValue
  }

  if (isPlainObject(baseValue) && isPlainObject(overrideValue)) {
    const merged = { ...baseValue }

    for (const [key, value] of Object.entries(overrideValue)) {
      const nextValue = deepMerge(baseValue[key], value)
      if (nextValue === undefined) {
        delete merged[key]
      } else {
        merged[key] = nextValue
      }
    }

    return merged
  }

  return overrideValue === undefined ? baseValue : overrideValue
}

export function buildMergedManifest(baseManifest, targetManifest, options = {}) {
  const mergedManifest = {
    ...deepMerge(baseManifest, targetManifest),
    version: options.version || APP_VERSION,
  }

  if (options.development === true) {
    const permissionsKey = mergedManifest.manifest_version === 2
      ? 'permissions'
      : 'host_permissions'
    mergedManifest[permissionsKey] = [
      ...(mergedManifest[permissionsKey] || []),
      ...DEV_HOST_PERMISSIONS,
    ].filter((permission, index, values) => values.indexOf(permission) === index)
  }

  return mergedManifest
}

export function writeMergedManifest({
  targetPath = 'manifest/chrome.json',
  development = false,
} = {}) {
  const basePath = path.resolve('manifest', 'main.json')
  const resolvedTargetPath = path.resolve(targetPath)
  const baseManifest = readJson(basePath)
  const targetManifest = readJson(resolvedTargetPath)
  const mergedManifest = buildMergedManifest(baseManifest, targetManifest, { development })

  fs.writeFileSync('manifest/manifest.json', `${JSON.stringify(mergedManifest, null, 2)}\n`)
  console.log(
    `Manifest generado combinando base + ${targetPath} con version ${APP_VERSION}`
    + (development ? ' (permisos locales de desarrollo)' : ''),
  )
  return mergedManifest
}

const isDirectExecution = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectExecution) {
  const args = process.argv.slice(2)
  const targetPath = args.find(arg => !arg.startsWith('--')) || 'manifest/chrome.json'
  writeMergedManifest({
    targetPath,
    development: args.includes('--dev'),
  })
}
