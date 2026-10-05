import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(resolve(ROOT, 'docs/performance-baselines/schema-v2.json')));
const validate = new Ajv2020({ validateFormats: false }).compile(schema);

export function percentile(values, percentage) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentage / 100) - 1)] ?? null;
}

export function visibleInteractionReady(marks) {
  const ready = marks?.['interaction-ready'];
  const visible = marks?.['shell-visible'];
  if (!Number.isFinite(ready) || !Number.isFinite(visible)) return null;
  return Math.max(ready, visible);
}

export function buildRuntimeReport(meta, samples, { minimumSamples = 30 } = {}) {
  if (samples.length < minimumSamples) throw new Error(`Expected at least ${minimumSamples} complete samples, received ${samples.length}`);
  for (const sample of samples) {
    if (sample.errors.length) throw new Error(`Sample ${sample.index} has errors: ${sample.errors.join('; ')}`);
    if (sample.interactionReadyMs < sample.shellVisibleMs) {
      throw new Error(`Sample ${sample.index} has interaction-ready before shell-visible`);
    }
  }
  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    ...meta,
    samples,
    gate: 'not-evaluated',
  };
  if (!validate(report)) throw new Error(`Invalid performance report: ${JSON.stringify(validate.errors)}`);
  return report;
}
