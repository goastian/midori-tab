import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const platform = process.argv[2]; // 'chrome' or 'firefox'

if (!platform || !['chrome', 'firefox'].includes(platform)) {
  console.error('Usage: node scripts/package.js <chrome|firefox>');
  process.exit(1);
}

const distDir = path.resolve('dist');
const outDir = path.resolve('packages');

if (!fs.existsSync(distDir)) {
  console.error('Error: dist/ directory not found. Run the build first.');
  process.exit(1);
}

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8'));
const version = pkg.version;

// Create packages directory if it doesn't exist
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const zipName = `midori-tab-${version}-${platform}.zip`;
const zipPath = path.join(outDir, zipName);

// Remove old zip if exists
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

// Create zip from dist contents
try {
  execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'inherit' });
  
  const stats = fs.statSync(zipPath);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log('');
  console.log(`✅ Package created successfully!`);
  console.log(`   Platform : ${platform}`);
  console.log(`   Version  : ${version}`);
  console.log(`   File     : packages/${zipName}`);
  console.log(`   Size     : ${sizeMB} MB`);
  console.log('');
  
  if (platform === 'chrome') {
    console.log('📦 Upload to: https://chrome.google.com/webstore/devconsole');
  } else {
    console.log('📦 Upload to: https://addons.mozilla.org/developers/');
  }
} catch (error) {
  console.error('Error creating zip:', error.message);
  process.exit(1);
}
