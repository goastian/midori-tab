import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.join(__dirname, 'asset-contract.schema.json');
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateSchema = ajv.compile(schema);

function parseSemver(input) {
  const match = String(input || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function semverGte(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function validateCompatibilityRanges(asset) {
  const issues = [];

  const appMin = parseSemver(asset?.compatibility?.app?.minVersion);
  const appMax = parseSemver(asset?.compatibility?.app?.maxVersion);
  if (appMin && appMax && !semverGte(appMax, appMin)) {
    issues.push('compatibility.app.maxVersion debe ser >= compatibility.app.minVersion');
  }

  for (const browser of asset?.compatibility?.browsers || []) {
    const min = parseSemver(browser?.minVersion);
    const max = parseSemver(browser?.maxVersion);
    if (min && max && !semverGte(max, min)) {
      issues.push(`compatibility.browsers.${browser.id}.maxVersion debe ser >= minVersion`);
    }
  }

  return issues;
}

export function validateAssetContract(asset) {
  const schemaValid = validateSchema(asset);
  const schemaErrors = schemaValid ? [] : (validateSchema.errors || []).map(err => `${err.instancePath || '/'} ${err.message}`);
  const logicalErrors = validateCompatibilityRanges(asset);

  return {
    valid: schemaErrors.length === 0 && logicalErrors.length === 0,
    schemaErrors,
    logicalErrors,
  };
}

export function getAssetSchemaPath() {
  return SCHEMA_PATH;
}
