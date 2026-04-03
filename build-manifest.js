import fs from 'node:fs'
import path from 'node:path'

import { APP_VERSION } from './version.config.js'

const basePath = path.resolve('manifest', 'main.json')
const targetPath = process.argv[2] || 'manifest/chrome.json'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(baseValue, overrideValue) {
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

const baseManifest = readJson(basePath)
const targetManifest = readJson(path.resolve(targetPath))

const mergedManifest = {
  ...deepMerge(baseManifest, targetManifest),
  version: APP_VERSION,
}

fs.writeFileSync('manifest/manifest.json', `${JSON.stringify(mergedManifest, null, 2)}\n`)

console.log(`Manifest generado combinando base + ${targetPath} con version ${APP_VERSION}`)