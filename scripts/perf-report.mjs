import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schema = JSON.parse(readFileSync(resolve(ROOT, 'contracts/performance-runtime.schema.json')));
const validate = new Ajv2020({ validateFormats: false }).compile(schema);
const CORE_METRICS = ['bootStartMs', 'shellVisibleMs', 'interactionReadyMs', 'idleCompleteMs', 'captureDurationMs'];
const SUMMARY_METRICS = [...CORE_METRICS, 'searchReadyMs', 'inputResponseMs', 'aboveFoldStableMs', 'firstContentfulPaintMs', 'domContentLoadedMs', 'loadEventMs', 'longTasksMs', 'longTaskBlockingMs', 'longTaskBlockingBeforeInteractionMs', 'cls', 'nodeCount'];

export function percentile(values, percentage) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * percentage / 100) - 1)] ?? null;
}

export function visibleInteractionReady(marks) {
  const ready = marks?.['interaction-ready'];
  const visible = marks?.['shell-visible'];
  if (!Number.isFinite(ready) || !Number.isFinite(visible)) return null;
  return Math.max(ready, visible);
}

export function runtimeBudgets(meta) {
  const mobile = meta.deviceClass === 'android';
  const cold = meta.cacheState === 'cold';
  return {
    shellVisibleMs: cold ? 350 : (mobile ? 220 : 120),
    interactionReadyMs: cold ? 650 : (mobile ? 400 : 250),
    inputResponseMs: 100,
    ...(cold ? {} : { aboveFoldStableMs: mobile ? 900 : 600 }),
    cls: 0.05,
    longTaskBlockingBeforeInteractionMs: mobile ? 80 : 25,
    networkBeforeInteraction: 0,
    captureDurationMinimumMs: 5000,
  };
}

function summarize(samples) {
  return Object.fromEntries(SUMMARY_METRICS.map(metric => {
    const values = samples.map(sample => sample[metric]).filter(Number.isFinite);
    return [metric, {
      count: values.length,
      missing: samples.length - values.length,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      p50: percentile(values, 50),
      p75: percentile(values, 75),
      p95: percentile(values, 95),
    }];
  }));
}

export function evaluateRuntimeGate(meta, samples, { diagnostic = false, minimumSamples } = {}) {
  const requiredSamples = diagnostic ? Math.max(1, minimumSamples ?? 1) : Math.max(30, minimumSamples ?? 30);
  const budgets = runtimeBudgets(meta);
  const violations = [];
  const unsupportedMetrics = [];
  const checks = [];
  const summary = summarize(samples);
  const fail = (metric, reason, details = {}) => violations.push({ metric, reason, ...details });
  const unsupported = (metric, reason, sampleIndex, required = false) => unsupportedMetrics.push({ metric, reason, sampleIndex, required });

  if (samples.length < requiredSamples) fail('sampleCount', 'insufficient-samples', { actual: samples.length, limit: requiredSamples });
  if (meta.failure) fail('execution', 'measurement-failed', { detail: meta.failure });
  const indices = new Set();
  for (const sample of samples) {
    const sampleIndex = sample.index;
    if (indices.has(sampleIndex)) fail('sampleIndex', 'duplicate-index', { sampleIndex });
    indices.add(sampleIndex);
    for (const metric of CORE_METRICS) {
      if (!Number.isFinite(sample[metric])) fail(metric, 'missing-measurement', { sampleIndex });
    }
    if (sample.errors?.length) fail('errors', 'page-or-measurement-errors', { sampleIndex, detail: sample.errors });
    if (sample.interactionReadyMs < sample.shellVisibleMs) fail('interactionReadyMs', 'before-visible-shell', { sampleIndex });
    if (sample.captureDurationMs < budgets.captureDurationMinimumMs) fail('captureDurationMs', 'capture-too-short', { sampleIndex, actual: sample.captureDurationMs, limit: budgets.captureDurationMinimumMs });
    if (sample.buffersTruncated) fail('buffers', 'measurement-buffer-overflow', { sampleIndex });
    if (!sample.visualStability?.supported) {
      unsupported('visualStability', 'visual-tracker-unavailable', sampleIndex, true);
    } else if (!sample.visualStability.stable || !Number.isFinite(sample.aboveFoldStableMs)) {
      fail('aboveFoldStableMs', 'viewport-not-stable-during-capture', { sampleIndex, detail: sample.visualStability });
    }
    if (sample.visualStability?.overflow) fail('visualStability', 'visual-tracker-overflow', { sampleIndex });
    const network = sample.networkBeforeInteraction;
    if (network?.coverage !== 'page-and-background') unsupported('networkBeforeInteraction', 'background-network-not-covered', sampleIndex, true);
    if (!Number.isInteger(network?.total) || !Number.isInteger(network?.unexpected)) {
      fail('networkBeforeInteraction', 'missing-request-count', { sampleIndex });
    } else if (network.unexpected > budgets.networkBeforeInteraction) {
      fail('networkBeforeInteraction', 'automatic-http-before-interaction', { sampleIndex, actual: network.unexpected, limit: 0 });
    }
    if (sample.startupGraphViolations?.length) fail('startupGraph', 'unexpected-startup-resources', { sampleIndex, detail: sample.startupGraphViolations });
    if (sample.startupResourceCoverage === 'unavailable') unsupported('startupGraph', 'resource-timing-unavailable', sampleIndex);
    if (sample.functional?.searchEnabled) {
      if (!sample.functional.inputTyped) fail('search', 'input-not-functional', { sampleIndex });
      for (const metric of ['searchReadyMs', 'inputResponseMs']) {
        if (!Number.isFinite(sample[metric])) fail(metric, 'missing-measurement', { sampleIndex });
      }
    }
    for (const [metric, capability] of [['cls', 'layoutShift'], ['longTaskBlockingBeforeInteractionMs', 'longTasks']]) {
      const related = capability === 'longTasks' ? ['longTasksMs', 'longTaskBlockingMs', metric] : [metric];
      if (!sample.capabilities?.[capability]) {
        unsupported(metric, 'browser-api-unavailable', sampleIndex);
        for (const name of related) {
          if (sample[name] !== null && sample[name] !== undefined) fail(name, 'unsupported-metric-must-be-null', { sampleIndex });
        }
      } else {
        for (const name of related) {
          if (!Number.isFinite(sample[name])) fail(name, 'supported-metric-not-recorded', { sampleIndex });
        }
      }
    }
  }
  for (const metric of ['shellVisibleMs', 'interactionReadyMs', 'inputResponseMs', 'aboveFoldStableMs', 'cls', 'longTaskBlockingBeforeInteractionMs']) {
    if (budgets[metric] === undefined) continue;
    const actual = summary[metric].p95;
    const limit = budgets[metric];
    checks.push({ metric, actual, limit, status: actual === null ? 'unsupported' : actual > limit ? 'failed' : 'passed' });
    if (actual !== null && actual > limit) fail(metric, 'p95-exceeds-budget', { actual, limit });
  }
  const status = violations.length ? 'failed' : unsupportedMetrics.some(item => item.required) ? 'unsupported' : 'passed';
  return { status, violations, unsupportedMetrics, checks, budgets, requiredSamples, summary };
}

export function buildRuntimeReport(meta, samples, options = {}) {
  const diagnostic = Boolean(options.diagnostic ?? meta.diagnostic);
  const result = evaluateRuntimeGate(meta, samples, { ...options, diagnostic });
  const { summary, ...gateResults } = result;
  const report = {
    ...meta,
    schemaVersion: 3,
    generatedAt: new Date().toISOString(),
    diagnostic,
    baselineEligible: !diagnostic && samples.length >= 30
      && !result.violations.some(item => ['missing-measurement', 'capture-too-short', 'measurement-failed', 'page-or-measurement-errors', 'duplicate-index', 'measurement-buffer-overflow', 'visual-tracker-overflow', 'supported-metric-not-recorded', 'unsupported-metric-must-be-null'].includes(item.reason))
      && !result.unsupportedMetrics.some(item => item.required),
    samples,
    summary,
    gate: result.status,
    gateResults,
  };
  if (!validate(report)) throw new Error(`Invalid performance report: ${JSON.stringify(validate.errors)}`);
  return report;
}
