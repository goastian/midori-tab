#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_BUDGETS, RESOURCE_GRAPH_BASELINE, htmlResources, readBundleGraph, resourceGraph } from './critical-requests.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HELP = 'Usage: npm run check:bundle -- [--strict] [--dist PATH] [--runtime-report PATH] [--js=165] [--css=44]';

function parseOptions(args) {
  const options = { directory: join(ROOT, 'dist'), js: BUILD_BUDGETS.jsBytes / 1024,
    css: BUILD_BUDGETS.cssBytes / 1024, strict: false };
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i];
    if (argument === '--strict') { options.strict = true; continue; }
    if (argument === '--help') { options.help = true; continue; }
    const [key, inline] = argument.split('=', 2);
    const value = inline ?? args[++i];
    const property = { '--dist': 'directory', '--runtime-report': 'runtimeReport', '--js': 'js', '--css': 'css' }[key];
    if (!property || !value || value.startsWith('--')) throw new Error(`Invalid option ${argument}`);
    options[property] = value;
  }
  for (const name of ['js', 'css']) {
    options[name] = Number(options[name]);
    if (!Number.isFinite(options[name]) || options[name] <= 0) throw new Error(`Invalid ${name} budget`);
  }
  options.directory = resolve(options.directory);
  return options;
}

function ensureAnalysis(options) {
  const entry = join(options.directory, 'index.html');
  if (!existsSync(entry)) throw new Error('Missing index.html; build the extension first');
  const graph = join(options.directory, 'bundle-analysis.rollup.json');
  const analysis = join(options.directory, 'bundle-analysis.json');
  const stale = !existsSync(graph) || !existsSync(analysis)
    || statSync(graph).mtimeMs < statSync(entry).mtimeMs || statSync(analysis).mtimeMs < statSync(entry).mtimeMs;
  if (!stale) return;
  if (options.strict || options.directory !== join(ROOT, 'dist')) {
    throw new Error('Missing or stale bundle analysis; build this target with ANALYZE_BUNDLE=1. Strict/custom-dist checks never rebuild.');
  }
  const manifest = JSON.parse(readFileSync(join(options.directory, 'manifest.json'), 'utf8'));
  const target = manifest.browser_specific_settings?.gecko?.id ? 'firefox' : 'chrome';
  const sourceManifest = join(ROOT, 'manifest/manifest.json');
  const original = readFileSync(sourceManifest);
  try {
    execFileSync('npm', ['run', `build:${target}`], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ANALYZE_BUNDLE: '1' } });
  } finally { writeFileSync(sourceManifest, original); }
}

export async function checkPerformanceBudget(options) {
  ensureAnalysis(options);
  const bundleGraph = readBundleGraph(options.directory);
  const html = readFileSync(join(options.directory, 'index.html'), 'utf8');
  const graph = resourceGraph({ directory: options.directory, documentUrl: 'https://extension.invalid/index.html',
    resources: htmlResources(html), bundleGraph, source: 'html-and-transitive-static-imports' });
  const failures = [];
  const check = (label, measured, limits, startup = true) => {
    console.log(`[check-performance-budget] ${label}: JS ${(measured.jsBytes / 1024).toFixed(2)} KiB / ${(limits.jsBytes / 1024).toFixed(2)}; CSS ${(measured.cssBytes / 1024).toFixed(2)} KiB / ${(limits.cssBytes / 1024).toFixed(2)}; ${measured.uniqueResources} unique files`);
    if (measured.jsBytes > limits.jsBytes) failures.push(`${label}: JavaScript exceeds ${limits.jsBytes} bytes`);
    if (measured.cssBytes > limits.cssBytes) failures.push(`${label}: CSS exceeds ${limits.cssBytes} bytes`);
    if (startup) failures.push(...measured.violations.map(path => `${label}: optional startup feature ${path}`));
    failures.push(...measured.missingResources.map(path => `${label}: missing requested file ${path}`));
  };
  check('HTML and static dependency closure', graph, { jsBytes: options.js * 1024, cssBytes: options.css * 1024 });
  if (options.runtimeReport) {
    const report = JSON.parse(readFileSync(resolve(options.runtimeReport), 'utf8'));
    const { artifactIdentity } = await import('./measure-newtab.mjs');
    if (report.artifact?.sha256 !== artifactIdentity(options.directory).sha256) failures.push('Runtime report does not describe this exact package');
    if (!report.samples?.length) failures.push('Runtime report contains no samples');
    for (const sample of report.samples || []) {
      const interaction = sample.resourceGraphs?.interaction;
      const vue = sample.resourceGraphs?.vue;
      const capture = sample.resourceGraphs?.capture;
      if (sample.startupResourceCoverage !== 'available' || !interaction || !vue || !capture) {
        failures.push(`Sample ${sample.index}: runtime resource observation is incomplete`);
        continue;
      }
      check(`Sample ${sample.index}, requests through interaction (A1 regression ceiling)`, interaction, RESOURCE_GRAPH_BASELINE.interaction);
      check(`Sample ${sample.index}, requests through Vue mount (A1 regression ceiling)`, vue, RESOURCE_GRAPH_BASELINE.interaction);
      check(`Sample ${sample.index}, complete capture (A1 regression ceiling)`, capture, RESOURCE_GRAPH_BASELINE.capture, false);
    }
  } else {
    console.log('[check-performance-budget] Dynamic startup imports require the runtime gate or --runtime-report; this result covers the static graph only.');
  }
  if (failures.length) throw new Error([...new Set(failures)].join('\n'));
  console.log('[check-performance-budget] Resource budgets passed.');
  return graph;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  await checkPerformanceBudget(options);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[check-performance-budget] ${error.message}`); process.exitCode = 1; });
}
