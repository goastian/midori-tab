import fs from 'node:fs'
import path from 'node:path'

import { APP_VERSION } from './version.config.js'

const basePath = path.resolve('manifest', 'main.json')
const targetPath = process.argv[2] || 'manifest/chrome.json'

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

const baseManifest = readJson(basePath)
const targetManifest = readJson(path.resolve(targetPath))

const mergedManifest = {
  ...baseManifest,
  ...targetManifest,
  version: APP_VERSION,
}

fs.writeFileSync('manifest/manifest.json', `${JSON.stringify(mergedManifest, null, 2)}\n`)

console.log(`Manifest generado combinando base + ${targetPath} con version ${APP_VERSION}`)