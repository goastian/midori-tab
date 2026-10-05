#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, firefox } from 'playwright';
import { connectWithMaxRetries, findFreeTcpPort } from '../node_modules/web-ext-run/lib/firefox/remote.js';
import { buildRuntimeReport, percentile } from './perf-report.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');

export function parseOptions(args) {
  const options = { engine: 'firefox', scenario: 'default', cacheState: 'cold', reps: 30, locale: 'en', layout: 'default', build: false, smoke: false, stressTabs: 500 };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--build' || arg === '--smoke') { options[arg.slice(2)] = true; continue; }
    if (arg === '--cold' || arg === '--warm') { options.cacheState = arg.slice(2); continue; }
    if (arg === '--help') { console.log('Usage: npm run measure:newtab -- --engine firefox|chromium --scenario default|stress --cold|--warm --reps 30 [--build] [--smoke]'); process.exit(0); }
    if (!arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    const [key, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? args[++i];
    if (!['engine', 'scenario', 'reps', 'locale', 'layout', 'stress-tabs'].includes(key) || value === undefined) throw new Error(`Invalid option ${arg}`);
    options[key === 'stress-tabs' ? 'stressTabs' : key] = value;
  }
  options.reps = Number(options.reps);
  options.stressTabs = Number(options.stressTabs);
  if (!['firefox', 'chromium'].includes(options.engine) || !['default', 'stress'].includes(options.scenario)) throw new Error('Invalid engine or scenario');
  if (options.layout !== 'default') throw new Error('Only the default layout is prepared by this runner');
  if (options.cacheState === 'cold' && options.locale !== 'en') throw new Error('Cold profile locale seeding is not supported yet');
  if (options.cacheState === 'cold' && options.scenario === 'stress') throw new Error('Stress needs prepared widgets and tabs; use --warm');
  if (!Number.isInteger(options.reps) || options.reps < (options.smoke ? 1 : 30)) throw new Error('Baselines need 30 samples; use --smoke for a shorter diagnostic');
  if (!Number.isInteger(options.stressTabs) || options.stressTabs < 0) throw new Error('Invalid stress tab count');
  return options;
}

function build(engine) {
  const manifestPath = resolve(ROOT, 'manifest/manifest.json');
  const original = readFileSync(manifestPath);
  try { execFileSync('npm', ['run', `build:${engine === 'firefox' ? 'firefox' : 'chrome'}`], { cwd: ROOT, stdio: 'inherit' }); }
  finally { writeFileSync(manifestPath, original); }
}

async function extensionUrl(context) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    for (const worker of context.serviceWorkers()) {
      const id = worker.url().match(/^chrome-extension:\/\/([^/]+)\//)?.[1];
      if (id) return `chrome-extension://${id}/index.html`;
    }
    await new Promise(done => setTimeout(done, 250));
  }
  throw new Error('Chromium did not register the Midori extension');
}

async function openContext(options) {
  const profile = mkdtempSync(resolve(tmpdir(), `midori-${options.engine}-profile-`));
  let context;
  try {
    if (options.engine === 'firefox') {
      const port = await findFreeTcpPort();
      context = await firefox.launchPersistentContext(profile, {
        headless: true,
        args: ['-start-debugger-server', String(port)],
        executablePath: process.env.MIDORI_FIREFOX_EXECUTABLE || undefined,
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
          'devtools.chrome.enabled': true,
          'xpinstall.signatures.required': false,
          'extensions.experiments.enabled': true,
        },
        viewport: { width: 1280, height: 800 },
      });
      const remote = await connectWithMaxRetries({ port });
      try {
        await remote.installTemporaryAddon(DIST);
        const addon = await remote.getInstalledAddon('midoritabs@astian.org');
        return { context, profile, url: addon.manifestURL.replace(/manifest\.json$/, 'index.html') };
      } finally { remote.disconnect(); }
    } else {
      context = await chromium.launchPersistentContext(profile, {
        headless: true,
        channel: 'chromium',
        executablePath: process.env.MIDORI_CHROMIUM_EXECUTABLE || undefined,
        args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`, '--disable-features=Translate,OptimizationHints'],
        viewport: { width: 1280, height: 800 },
      });
    }
    return { context, profile, url: await extensionUrl(context) };
  } catch (error) {
    await context?.close();
    rmSync(profile, { recursive: true, force: true });
    if (/requires a privileged add-on/.test(error.message)) {
      throw new Error('Firefox estándar no acepta experiment_apis; usa el ejecutable Midori con MIDORI_FIREFOX_EXECUTABLE para medir la extensión completa.', { cause: error });
    }
    throw error;
  }
}

async function openContextWithRetry(options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await openContext(options); }
    catch (error) {
      lastError = error;
      if (!/did not register/.test(error.message)) throw error;
      await new Promise(done => setTimeout(done, 500));
    }
  }
  throw lastError;
}

async function closeContext(session) {
  await session.context.close();
  rmSync(session.profile, { recursive: true, force: true });
}

async function prepareScenario(session, options) {
  const page = await session.context.newPage();
  try {
    await page.goto(session.url, { waitUntil: 'domcontentloaded' });
    await page.evaluate(({ locale, stress }) => {
      localStorage.setItem('i18nStore', JSON.stringify({ locale }));
      if (stress) localStorage.setItem('widgetsStore', JSON.stringify({
        enabled: { search: true, weather: true, currency: true, browserBookmarks: true, privacy: true, rss: true, calendar: true, notes: true, todo: true },
        order: ['search', 'weather', 'currency', 'browserBookmarks', 'privacy', 'rss', 'calendar', 'notes', 'todo'],
      }));
    }, { locale: options.locale, stress: options.scenario === 'stress' });
    if (options.scenario === 'stress') await page.evaluate(async count => {
      const tabs = globalThis.browser?.tabs || globalThis.chrome?.tabs;
      if (!tabs?.create) throw new Error('Tabs API unavailable');
      for (let i = 0; i < count; i += 1) {
        const details = { url: 'about:blank', active: false };
        if (globalThis.browser?.tabs?.create) await tabs.create(details);
        else await new Promise((resolve, reject) => tabs.create(details, tab => globalThis.chrome.runtime.lastError ? reject(new Error(globalThis.chrome.runtime.lastError.message)) : resolve(tab)));
      }
    }, options.stressTabs);
  } finally { await page.close(); }
}

async function measure(session, index) {
  const page = await session.context.newPage();
  const errors = [];
  const requests = new Map();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) requests.set(request, { start: Date.now(), state: 'pending' }); });
  page.on('requestfinished', request => { if (requests.has(request)) requests.get(request).state = 'finished'; });
  page.on('requestfailed', request => { if (requests.has(request)) requests.get(request).state = 'failed'; });
  try {
    await page.goto(session.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => window.__midoriPerf?.isComplete === true, null, { timeout: 20_000 });
    const data = await page.evaluate(() => {
      const perf = window.__midoriCollectPerf?.() || window.__midoriPerf;
      const navigation = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint');
      return { perf, start: performance.timeOrigin, fcp: fcp?.startTime ?? null, dcl: navigation?.domContentLoadedEventEnd ?? null, load: navigation?.loadEventEnd ?? null };
    });
    const marks = data.perf?.marks || {};
    const beforeInteraction = [...requests.values()].filter(request => request.start < data.start + marks['interaction-ready']);
    const sample = {
      index, navigationStartEpochMs: data.start, bootStartMs: marks['boot-start'], shellVisibleMs: marks['shell-visible'], interactionReadyMs: marks['interaction-ready'],
      aboveFoldStableMs: marks['above-fold-stable'], idleCompleteMs: marks['idle-complete'],
      firstContentfulPaintMs: data.fcp, domContentLoadedMs: data.dcl, loadEventMs: data.load,
      longTasksMs: data.perf?.longTasks?.totalMs, cls: data.perf?.cls, nodeCount: data.perf?.nodes,
      networkBeforeInteraction: { total: beforeInteraction.length, unexpected: beforeInteraction.length, pendingOrCancelled: beforeInteraction.filter(request => request.state !== 'finished').length },
      errors,
    };
    if (typeof marks['search-ready'] === 'number') sample.searchReadyMs = marks['search-ready'];
    for (const [key, value] of Object.entries(sample)) if (value === null || value === undefined) throw new Error(`Sample ${index} missing ${key}`);
    if (errors.length) throw new Error(`Sample ${index} page errors: ${errors.join('; ')}`);
    return sample;
  } finally { await page.close(); }
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.build) build(options.engine);
  if (!existsSync(resolve(DIST, 'index.html'))) throw new Error('Missing dist/index.html; use --build');
  const manifest = JSON.parse(readFileSync(resolve(DIST, 'manifest.json')));
  if ((options.engine === 'firefox') !== Boolean(manifest.browser_specific_settings?.gecko?.id)) throw new Error(`Build the ${options.engine} target before measuring`);
  let session;
  const samples = [];
  try {
    if (options.cacheState === 'warm') { session = await openContextWithRetry(options); await prepareScenario(session, options); }
    for (let i = 0; i < options.reps; i += 1) {
      if (options.cacheState === 'cold') { session = await openContextWithRetry(options); if (options.scenario === 'stress') await prepareScenario(session, options); }
      try { samples.push(await measure(session, i)); }
      finally { if (options.cacheState === 'cold') { await closeContext(session); session = null; } }
      process.stdout.write(`\r[measure-newtab] ${i + 1}/${options.reps}`);
    }
    process.stdout.write('\n');
    const meta = { engine: options.engine, runtimeTarget: options.engine === 'firefox' ? 'midori-firefox' : 'chromium', deviceClass: 'desktop', scenario: options.scenario, cacheState: options.cacheState,
      profilePolicy: options.cacheState === 'cold' ? 'fresh-per-sample' : 'reused-warmed', locale: options.locale, layout: options.layout };
    const report = options.smoke ? { diagnostic: true, ...meta, samples } : buildRuntimeReport(meta, samples);
    const outDir = resolve(DIST, 'perf');
    mkdirSync(outDir, { recursive: true });
    const file = resolve(outDir, `${options.engine}-${options.scenario}-${options.cacheState}${options.smoke ? '-smoke' : ''}.json`);
    writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[measure-newtab] ${file}`);
    console.log(`p95 interaction-ready: ${percentile(samples.map(item => item.interactionReadyMs), 95)} ms; runtime gate not evaluated`);
  } finally {
    if (session) await closeContext(session);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[measure-newtab] ${error.stack || error}`); process.exitCode = 1; });
}
