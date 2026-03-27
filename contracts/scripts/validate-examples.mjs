import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAssetContract } from '../asset-contract-validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const examplesDir = path.resolve(__dirname, '../examples');

const files = fs.readdirSync(examplesDir).filter(name => name.endsWith('.json')).sort();
let hasErrors = false;

for (const file of files) {
  const fullPath = path.join(examplesDir, file);
  const asset = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  const result = validateAssetContract(asset);

  if (result.valid) {
    console.log(`OK   ${file}`);
    continue;
  }

  hasErrors = true;
  console.error(`FAIL ${file}`);
  for (const err of result.schemaErrors) console.error(`  schema: ${err}`);
  for (const err of result.logicalErrors) console.error(`  logic : ${err}`);
}

if (hasErrors) {
  process.exitCode = 1;
}
