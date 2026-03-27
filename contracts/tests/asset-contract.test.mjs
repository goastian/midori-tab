import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAssetContract } from '../asset-contract-validator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const examplesDir = path.resolve(__dirname, '../examples');

function loadExample(name) {
  const filePath = path.join(examplesDir, `${name}.json`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

const validExamples = [
  'theme',
  'wallpaper',
  'widget',
  'animation',
  'collection',
  'midori-update',
];

for (const exampleName of validExamples) {
  test(`example ${exampleName} cumple el contrato`, () => {
    const asset = loadExample(exampleName);
    const result = validateAssetContract(asset);

    assert.equal(result.valid, true, [
      `schemaErrors=${JSON.stringify(result.schemaErrors)}`,
      `logicalErrors=${JSON.stringify(result.logicalErrors)}`,
    ].join(' | '));
  });
}

test('falla si el tipo de asset no existe', () => {
  const invalid = loadExample('theme');
  invalid.type = 'plugin';

  const result = validateAssetContract(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.schemaErrors.length > 0, true);
});

test('falla si falta payload requerido para widget', () => {
  const invalid = loadExample('widget');
  delete invalid.payload.entry;

  const result = validateAssetContract(invalid);
  assert.equal(result.valid, false);
  assert.equal(result.schemaErrors.length > 0, true);
});

test('falla si maxVersion es menor a minVersion', () => {
  const invalid = loadExample('theme');
  invalid.compatibility.app.minVersion = '2.0.0';
  invalid.compatibility.app.maxVersion = '1.0.0';

  const result = validateAssetContract(invalid);
  assert.equal(result.valid, false);
  assert.deepEqual(result.logicalErrors, [
    'compatibility.app.maxVersion debe ser >= compatibility.app.minVersion',
  ]);
});
