import fs from 'fs'
import path from 'path'

const basePath = path.resolve('manifest', 'main.json')
const targetPath = process.argv[2] || 'manifest/chrome.json'  // O 'src/firefox.json'

const baseManifest = JSON.parse(fs.readFileSync(basePath, 'utf-8'))
const targetManifest = JSON.parse(fs.readFileSync(path.resolve(targetPath), 'utf-8'))

const mergedManifest = {
  ...baseManifest,
  ...targetManifest,
  // si quieres que algunas propiedades se fusionen más profundamente,
  // puedes agregar lógica aquí
}

fs.writeFileSync('manifest/manifest.json', JSON.stringify(mergedManifest, null, 2))

console.log(`Manifest generado combinando base + ${targetPath}`)