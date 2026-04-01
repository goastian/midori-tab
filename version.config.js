import fs from 'node:fs'

const packageJsonUrl = new URL('./package.json', import.meta.url)
const packageJson = JSON.parse(fs.readFileSync(packageJsonUrl, 'utf-8'))

export const APP_VERSION = String(packageJson.version || '0.0.0')