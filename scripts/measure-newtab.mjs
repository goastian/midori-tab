#!/usr/bin/env node
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { arch, cpus, platform, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { openGeckoSession } from './gecko-transport.mjs';
import { buildRuntimeReport, visibleInteractionReady } from './perf-report.mjs';
import { htmlResources, readBundleGraph, resourceGraph } from './critical-requests.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VIEWPORT = { width: 1280, height: 800 };
const HELP = 'Usage: npm run measure:newtab -- --engine firefox|chromium --scenario default|stress --cold|--warm --reps 30 [--build] [--smoke] [--gate] [--dist PATH] [--output-dir PATH]';

export function parseOptions(args) {
  const options = { engine: 'firefox', scenario: 'default', cacheState: 'cold', reps: 30, locale: 'en', layout: 'default',
    build: false, smoke: false, gate: false, stressTabs: 500, extensionPath: resolve(ROOT, 'dist'), timeoutMs: 20_000 };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (['--build', '--smoke', '--gate', '--help'].includes(arg)) { options[arg.slice(2)] = true; continue; }
    if (arg === '--cold' || arg === '--warm') { options.cacheState = arg.slice(2); continue; }
    if (!arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
    const [key, inline] = arg.slice(2).split('=', 2);
    const value = inline ?? args[++i];
    const mapping = { 'stress-tabs': 'stressTabs', dist: 'extensionPath', 'output-dir': 'outputDir', 'timeout-ms': 'timeoutMs' };
    if (!['engine', 'scenario', 'reps', 'locale', 'layout', ...Object.keys(mapping)].includes(key)
      || value === undefined || value.startsWith('--')) throw new Error(`Invalid option ${arg}`);
    options[mapping[key] || key] = value;
  }
  if (options.help) return options;
  options.reps = Number(options.reps);
  options.stressTabs = Number(options.stressTabs);
  options.timeoutMs = Number(options.timeoutMs);
  options.extensionPath = resolve(options.extensionPath);
  if (!['firefox', 'chromium'].includes(options.engine) || !['default', 'stress'].includes(options.scenario)) throw new Error('Invalid engine or scenario');
  if (options.layout !== 'default') throw new Error('Only the default layout is prepared by this runner');
  if (options.cacheState === 'cold' && options.locale !== 'en') throw new Error('Cold profile locale seeding is not supported; use --warm');
  if (options.cacheState === 'cold' && options.scenario === 'stress') throw new Error('Stress needs prepared widgets and tabs; use --warm');
  if (!Number.isInteger(options.reps) || options.reps < (options.smoke ? 1 : 30)) throw new Error('Baselines need 30 samples; use --smoke for a diagnostic');
  if (!Number.isInteger(options.stressTabs) || options.stressTabs < 0) throw new Error('Invalid stress tab count');
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) throw new Error('Invalid timeout');
  if (options.build && options.extensionPath !== resolve(ROOT, 'dist')) throw new Error('--build cannot overwrite a custom --dist');
  return options;
}

export function buildExtension(engine) {
  const manifestPath = resolve(ROOT, 'manifest/manifest.json');
  const original = readFileSync(manifestPath);
  try {
    const target = engine === 'firefox' ? 'firefox' : 'chrome';
    const execution = { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ANALYZE_BUNDLE: '1' } };
    execFileSync(process.execPath, ['build-manifest.js', `manifest/${target}.json`], execution);
    const generatedManifest = readFileSync(manifestPath, 'utf8');
    execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], execution);
    const artifactText = readFileSync(resolve(ROOT, 'dist/manifest.json'), 'utf8');
    const artifact = JSON.parse(artifactText);
    if ((engine === 'firefox') !== Boolean(artifact.browser_specific_settings?.gecko?.id)) {
      throw new Error(`Build produced the wrong extension manifest for ${engine}`);
    }
    if (artifactText !== generatedManifest) throw new Error('Built manifest differs from the generated target manifest');
    if (process.env.ANALYZE_BUNDLE === '1' && !existsSync(resolve(ROOT, 'dist/bundle-analysis.json'))) {
      throw new Error('Requested bundle analysis was not generated');
    }
  }
  finally { writeFileSync(manifestPath, original); }
}

export function artifactIdentity(directory) {
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json')));
  const hash = createHash('sha256');
  function visit(relative = '') {
    for (const entry of readdirSync(join(directory, relative), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(relative, entry.name);
      if (path === 'perf' || path.startsWith('bundle-analysis')) continue;
      if (entry.isDirectory()) visit(path);
      else { hash.update(path); hash.update('\0'); hash.update(readFileSync(join(directory, path))); }
    }
  }
  visit();
  let gitCommit = null;
  let dirty = null;
  try {
    gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim());
  } catch { /* Artifacts can also be measured outside a Git checkout. */ }
  return { version: manifest.version, sha256: hash.digest('hex'), manifestVersion: manifest.manifest_version,
    experimentApis: Object.keys(manifest.experiment_apis || {}), gitCommit, dirty };
}

function chromiumNetwork(context) {
  const requests = new Map();
  const resources = new Map();
  let active = false;
  let sequence = 0;
  const pendingSizes = new Set();
  context.on('request', request => {
    if (!active) return;
    if (request.url().startsWith('chrome-extension:')) {
      resources.set(request, { url: request.url(), startEpochMs: Date.now(), kind: request.resourceType(),
        scope: request.serviceWorker() ? 'background' : 'page' });
      return;
    }
    if (!/^https?:/.test(request.url())) return;
    let scope = 'page';
    let documentUrl = '';
    const worker = request.serviceWorker();
    if (worker) { scope = 'background'; documentUrl = worker.url(); }
    else { try { documentUrl = request.frame().url(); } catch { scope = 'unknown'; } }
    const started = request.timing().startTime;
    requests.set(request, { id: ++sequence, url: request.url(), documentUrl, scope,
      startEpochMs: started > 0 ? started : Date.now(), endEpochMs: null, state: 'pending', bytes: null });
  });
  context.on('requestfinished', request => {
    if (resources.has(request) && request.timing().startTime > 0) resources.get(request).startEpochMs = request.timing().startTime;
    const record = requests.get(request);
    if (!record) return;
    if (request.timing().startTime > 0) record.startEpochMs = request.timing().startTime;
    record.endEpochMs = Date.now();
    record.state = 'finished';
    const operation = request.sizes().then(size => { record.bytes = size.responseBodySize + size.responseHeadersSize; }).catch(() => {}).finally(() => pendingSizes.delete(operation));
    pendingSizes.add(operation);
  });
  context.on('requestfailed', request => {
    const record = requests.get(request);
    if (!record) return;
    if (request.timing().startTime > 0) record.startEpochMs = request.timing().startTime;
    record.endEpochMs = Date.now();
    record.state = /abort|cancel/i.test(request.failure()?.errorText || '') ? 'cancelled' : 'failed';
  });
  return {
    coverage: { source: 'playwright-browser-context', scopes: ['page', 'background'], cancelledRequests: true,
      localExtensionResources: 'browser-context-requests' },
    start: async () => { requests.clear(); resources.clear(); sequence = 0; active = true; return { startEpochMs: Date.now() }; },
    resources: async () => [...resources.values()],
    stop: async () => {
      active = false;
      await Promise.all([...pendingSizes]);
      return [...requests.values()].map(record => ({ ...record,
        url: safeUrl(record.url, 'about:blank'), documentUrl: safeUrl(record.documentUrl, 'about:blank') }));
    },
  };
}

async function launchNativeFocusChromium(profile, { extensionPath, viewport, env, chromiumArgs = [] }) {
  const child = spawn(process.env.MIDORI_CHROMIUM_EXECUTABLE || chromium.executablePath(), [
    `--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-background-networking', '--disable-features=Translate,OptimizationHints',
    `--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
    `--window-size=${viewport.width},${viewport.height + 160}`, ...chromiumArgs, 'about:blank',
  ], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  let browser;
  let log = '';
  const closed = new Promise(resolve => child.once('close', resolve));
  const close = async () => {
    try { await browser?.close(); }
    finally {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 2000);
      try { await closed; } finally { clearTimeout(force); }
    }
  };
  try {
    const endpoint = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Chromium native-focus transport did not become ready: ${log}`)), 30_000);
      const fail = error => { clearTimeout(timeout); reject(error); };
      child.once('error', fail);
      child.once('exit', (code, signal) => fail(new Error(`Chromium exited (${code ?? signal}): ${log}`)));
      child.stderr.on('data', chunk => {
        log = (log + chunk).slice(-16_000);
        const match = log.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    // A second CDP session cannot remove the focus override owned by Playwright's
    // original session. Connect without installing it in the first place.
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 30_000 });
    const context = browser.contexts()[0];
    if (!context) throw new Error('The native-focus Chromium process did not expose its persistent context');
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      await page.setViewportSize(viewport);
      return page;
    };
    return { context, close };
  } catch (error) { await close(); throw error; }
}

export async function openContextWithRetry(options) {
  const extensionPath = options.extensionPath || resolve(ROOT, 'dist');
  const viewport = options.viewport || VIEWPORT;
  const headless = options.headless ?? true;
  if (options.engine === 'firefox') return openGeckoSession({ extensionPath,
    executablePath: process.env.MIDORI_FIREFOX_EXECUTABLE || undefined, viewport, headless, env: options.env });
  const profile = mkdtempSync(join(tmpdir(), 'midori-chromium-profile-'));
  let context;
  let nativeClose;
  const closeBrowser = () => nativeClose ? nativeClose() : context?.close();
  try {
    if (options.nativeFocus) {
      if (headless) throw new Error('Native-focus Chromium visual integration requires a headed session');
      const launch = await launchNativeFocusChromium(profile, { ...options, extensionPath, viewport });
      context = launch.context;
      nativeClose = launch.close;
    } else {
      context = await chromium.launchPersistentContext(profile, { headless, channel: 'chromium', timeout: 30_000,
        executablePath: process.env.MIDORI_CHROMIUM_EXECUTABLE || undefined,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`,
          '--disable-features=Translate,OptimizationHints', ...(options.chromiumArgs || [])],
        viewport, env: options.env });
    }
    const network = chromiumNetwork(context);
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker', { timeout: 10_000 });
    const id = new URL(worker.url()).host;
    const metadata = { transport: options.nativeFocus ? 'playwright-cdp-native-focus' : 'playwright',
      browserName: 'chromium', browserVersion: context.browser()?.version() || null,
      viewport, headless, extensionId: id, fullExtensionInstalled: true };
    const close = async () => { try { await closeBrowser(); } finally { rmSync(profile, { recursive: true, force: true }); } };
    return { context, profile, url: `chrome-extension://${id}/index.html`, network, metadata, close };
  } catch (error) {
    try { await closeBrowser(); }
    finally { rmSync(profile, { recursive: true, force: true }); }
    throw error;
  }
}

export async function closeContext(session) {
  if (session.close) await session.close();
  else { try { await session.context.close(); } finally { rmSync(session.profile, { recursive: true, force: true }); } }
}

async function prepareScenario(session, options) {
  const page = await session.context.newPage();
  try {
    const url = new URL(session.url);
    url.searchParams.set('midori-perf', '1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__midoriPerf?.isComplete === true, null, { timeout: options.timeoutMs });
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
      for (let i = 0; i < count; i += 1) await tabs.create({ url: 'about:blank', active: false });
      const allTabs = await tabs.query({});
      if (allTabs.length < count) throw new Error(`Stress requested ${count} tabs but only ${allTabs.length} exist`);
    }, options.stressTabs);
  } finally { await page.close(); }
}

function safeUrl(value, documentUrl) {
  try {
    const url = new URL(value);
    if (url.protocol === 'moz-extension:' || url.protocol === 'chrome-extension:') return url.pathname;
    if (url.host === new URL(documentUrl).host) return url.pathname;
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return '[unavailable]'; }
}

export async function measureSession(session, index, options) {
  const errors = [];
  const networkWindow = await session.network.start();
  const page = await session.context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  let requests = [];
  let localResources = [];
  let data = {};
  let functional = { searchEnabled: false, inputTyped: false };
  let inputResponseMs = null;
  try {
    const url = new URL(session.url);
    url.searchParams.set('midori-perf', '1');
    try {
      await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await page.waitForFunction(() => window.__midoriPerf?.isComplete === true, null, { timeout: options.timeoutMs });
    } catch (error) { errors.push(error.message); }
    data = await page.evaluate(() => {
      const perf = window.__midoriPerf;
      const navigation = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByType('paint').find(entry => entry.name === 'first-contentful-paint');
      const resources = performance.getEntriesByType('resource');
      const resourceTimings = resources.map(entry => ({ url: entry.name, startTime: entry.startTime, kind: entry.initiatorType }));
      const early = performance.getEntriesByName('early-search-ready')[0];
      const widgetState = JSON.parse(localStorage.getItem('widgetsStore') || '{}');
      return { perf, start: performance.timeOrigin, origin: location.href, resourceTimings,
        earlySearchReadyMs: early?.startTime ?? window.__midoriEarlySearch?.readyAt ?? null,
        fcp: fcp?.startTime ?? null, dcl: navigation?.domContentLoadedEventEnd ?? null, load: navigation?.loadEventEnd ?? null,
        searchEnabled: Boolean(document.querySelector('.search-input')),
        searchExpected: (widgetState.enabled?.search ?? widgetState.search ?? true) !== false,
        widgetState,
        spacesEnabled: JSON.parse(localStorage.getItem('spacesStore') || '{}').enabled === true };
    });
    if (data.perf?.instrumentationError) errors.push(`Laboratory instrumentation failed: ${data.perf.instrumentationError}`);
    requests = await session.network.stop();
    localResources = await session.network.resources?.() || [];
    networkWindow.endEpochMs = Date.now();
    functional.searchExpected = data.searchExpected;
    if (data.searchEnabled) {
      await page.evaluate(() => {
        window.__midoriInputProbe = new Promise(resolveProbe => {
          const input = document.querySelector('.search-input');
          const timeout = setTimeout(() => { input.removeEventListener('input', onInput); resolveProbe(null); }, 2000);
          function onInput(event) {
            if (!input.value || event.inputType?.startsWith('delete')) return;
            input.removeEventListener('input', onInput);
            if (!event.isTrusted) { clearTimeout(timeout); resolveProbe(null); return; }
            const timestamp = event.timeStamp > performance.timeOrigin ? event.timeStamp - performance.timeOrigin : event.timeStamp;
            requestAnimationFrame(() => requestAnimationFrame(() => {
              clearTimeout(timeout);
              resolveProbe(Math.max(0, performance.now() - timestamp));
            }));
          }
          input.addEventListener('input', onInput);
        });
      });
      await page.fill('.search-input', 'midori integration');
      inputResponseMs = await page.evaluate(() => window.__midoriInputProbe);
      functional = { searchEnabled: true, searchExpected: data.searchExpected, inputTyped: await page.evaluate(() => {
        const input = document.querySelector('.search-input');
        return input?.value === 'midori integration' && document.activeElement === input;
      }) };
      if (!functional.inputTyped) errors.push('Native keyboard input did not reach the search field');
    } else if (data.searchExpected) errors.push('The enabled search widget did not render its search field');
    if (data.searchEnabled && !data.searchExpected) errors.push('The disabled search widget rendered a search field');
    if (options.screenshotPath) await page.screenshot({ path: options.screenshotPath });
    if (options.scenario === 'stress' && !data.widgetState?.enabled?.rss) errors.push('Stress widget fixture was not applied');
  } catch (error) { errors.push(error.message); }
  finally {
    if (!networkWindow.endEpochMs) {
      requests = await session.network.stop();
      localResources = await session.network.resources?.() || [];
      networkWindow.endEpochMs = Date.now();
    }
    await page.close();
  }
  const perf = data.perf || {};
  const marks = perf.marks || {};
  const rawShellMountedMs = marks['shell-visible'] ?? null;
  const shellVisibleMs = Number.isFinite(rawShellMountedMs) && Number.isFinite(data.fcp)
    ? Math.max(rawShellMountedMs, data.fcp) : null;
  const rawInteractionReadyMs = visibleInteractionReady(marks);
  const interactionReadyMs = Number.isFinite(rawInteractionReadyMs) && Number.isFinite(shellVisibleMs)
    ? Math.max(rawInteractionReadyMs, shellVisibleMs) : null;
  const longTaskBlockingBeforeInteractionMs = perf.capabilities?.longTasks && Number.isFinite(interactionReadyMs)
    && Array.isArray(perf.longTasks?.records)
    ? perf.longTasks.records.reduce((total, entry) => total + Math.max(0,
      Math.min(entry.durationMs, interactionReadyMs - entry.startMs) - 50), 0) : null;
  const beforeInteraction = requests.filter(request => interactionReadyMs !== null && request.startEpochMs < data.start + interactionReadyMs);
  const networkCoverage = session.network.coverage?.scopes?.includes('background')
    && session.network.coverage?.scopes?.includes('page') ? 'page-and-background' : 'page-only';
  let graphs = null;
  let startupResourceCoverage = 'unavailable';
  try {
    const bundleGraph = readBundleGraph(options.extensionPath);
    const native = localResources.filter(resource => resource.scope !== 'background');
    const resources = [...native, ...(data.resourceTimings || [])];
    const source = native.length ? session.network.coverage.localExtensionResources : 'resource-timing';
    const enabledWidgets = { privacy: true, ...data.widgetState?.enabled };
    const graphOptions = { directory: options.extensionPath, documentUrl: session.url, resources,
      navigationStart: data.start, laboratory: true, bundleGraph, source, enabledWidgets, spacesEnabled: data.spacesEnabled === true };
    const html = htmlResources(readFileSync(join(options.extensionPath, 'index.html'), 'utf8'));
    graphs = {
      html: resourceGraph({ ...graphOptions, resources: html, navigationStart: 0, source: 'html-and-transitive-static-imports' }),
      earlySearch: resourceGraph({ ...graphOptions, cutoff: data.earlySearchReadyMs ?? 0 }),
      interaction: resourceGraph({ ...graphOptions, cutoff: interactionReadyMs ?? 0 }),
      vue: resourceGraph({ ...graphOptions, cutoff: marks['vue-ready'] ?? interactionReadyMs ?? 0 }),
      capture: resourceGraph(graphOptions),
    };
    const observedPaths = new Set(graphs.capture.files.filter(file => file.observations > 0).map(file => file.path));
    const requiredPaths = graphs.html.files.filter(file => file.kinds.some(kind => kind === 'script' || kind === 'stylesheet')).map(file => file.path);
    startupResourceCoverage = requiredPaths.length && requiredPaths.every(path => observedPaths.has(path)) ? 'available' : 'unavailable';
    graphs.coverage = { source, nativeObservationCount: native.length, resourceTimingCount: data.resourceTimings?.length || 0,
      requiredPaths, missingObservedPaths: requiredPaths.filter(path => !observedPaths.has(path)),
      featurePolicy: { enabledWidgets, spacesEnabled: data.spacesEnabled === true },
      semantics: source === 'native-content-policy-loads' ? 'native loader attempts; bytes are unique on-disk package bytes, not HTTP transfer bytes' : 'native resource requests; bytes are unique on-disk package bytes',
      staticClosure: 'Static module and CSS dependencies are included even if satisfied from the module cache.' };
  } catch (error) { errors.push(`Resource graph: ${error.message}`); }
  return {
    index, navigationStartEpochMs: data.start ?? null, measurementStartedEpochMs: networkWindow.startEpochMs,
    bootStartMs: marks['boot-start'] ?? null, rawShellMountedMs, shellVisibleMs, interactionReadyMs,
    earlySearchReadyMs: data.earlySearchReadyMs ?? null, vueReadyMs: marks['vue-ready'] ?? null,
    paintCoverage: Number.isFinite(data.fcp) ? 'first-contentful-paint' : 'unavailable',
    searchReadyMs: marks['search-ready'] ?? null, aboveFoldStableMs: marks['above-fold-stable'] ?? null, idleCompleteMs: marks['idle-complete'] ?? null,
    firstContentfulPaintMs: data.fcp ?? null, domContentLoadedMs: data.dcl ?? null, loadEventMs: data.load ?? null,
    longTasksMs: perf.longTasks?.totalMs ?? null, longTaskBlockingMs: perf.longTasks?.blockingMs ?? null,
    longTaskBlockingBeforeInteractionMs,
    cls: perf.cls ?? null, nodeCount: perf.nodes ?? null,
    capabilities: perf.capabilities || {}, captureDurationMs: perf.captureDurationMs ?? null,
    visualStability: perf.visualStability || {}, buffersTruncated: perf.buffersTruncated ?? false,
    networkBeforeInteraction: { total: beforeInteraction.length, unexpected: beforeInteraction.length,
      pendingOrCancelled: beforeInteraction.filter(request => request.state !== 'finished').length,
      page: beforeInteraction.filter(request => request.scope === 'page').length,
      background: beforeInteraction.filter(request => request.scope === 'background').length,
      unattributed: beforeInteraction.filter(request => !['page', 'background'].includes(request.scope)).length, coverage: networkCoverage },
    networkWindow, networkCoverage: session.network.coverage,
    requests: requests.map(request => ({ ...request, url: safeUrl(request.url, session.url), documentUrl: safeUrl(request.documentUrl, session.url) })),
    resourceGraphs: graphs,
    startupGraphViolations: graphs?.interaction.violations || [],
    startupResources: graphs?.interaction.files.map(file => file.path) || [], startupResourceCoverage,
    criticalJsBytes: graphs?.interaction.jsBytes ?? null, criticalCssBytes: graphs?.interaction.cssBytes ?? null,
    htmlJsBytes: graphs?.html.jsBytes ?? null, htmlCssBytes: graphs?.html.cssBytes ?? null,
    captureJsBytes: graphs?.capture.jsBytes ?? null, captureCssBytes: graphs?.capture.cssBytes ?? null,
    inputResponseMs, inputResponseMethod: 'trusted-input-event-to-two-animation-frames',
    functional, errors: [...new Set(errors)],
  };
}

export async function runMeasurement(options) {
  if (options.build) buildExtension(options.engine);
  const outputDir = resolve(options.outputDir || join(options.extensionPath, 'perf'));
  mkdirSync(outputDir, { recursive: true });
  const meta = { engine: options.engine, runtimeTarget: options.engine === 'firefox' ? 'midori-firefox' : 'chromium', deviceClass: 'desktop',
    scenario: options.scenario, cacheState: options.cacheState, profilePolicy: options.cacheState === 'cold' ? 'fresh-per-sample' : 'reused-warmed',
    locale: options.locale, layout: options.layout, instrumentation: { laboratory: true, visualTrackerIncluded: true },
    environment: { node: process.version, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, memoryBytes: totalmem(), viewport: VIEWPORT } };
  const samples = [];
  let session;
  let failure = null;
  try {
    if (!existsSync(join(options.extensionPath, 'index.html'))) throw new Error('Missing dist/index.html; use --build');
    const manifest = JSON.parse(readFileSync(join(options.extensionPath, 'manifest.json')));
    if ((options.engine === 'firefox') !== Boolean(manifest.browser_specific_settings?.gecko?.id)) throw new Error(`Build the ${options.engine} target before measuring`);
    meta.artifact = artifactIdentity(options.extensionPath);
    if (options.cacheState === 'warm') {
      session = await openContextWithRetry(options);
      meta.browser = session.metadata;
      await prepareScenario(session, options);
    }
    for (let i = 0; i < options.reps; i += 1) {
      if (options.cacheState === 'cold') { session = await openContextWithRetry(options); meta.browser = session.metadata; }
      const sample = await measureSession(session, i, options);
      samples.push(sample);
      if (options.cacheState === 'cold') { await closeContext(session); session = null; }
      console.log(`[measure-newtab] ${i + 1}/${options.reps}: interaction=${sample.interactionReadyMs} ms; errors=${sample.errors.length}`);
      if (sample.errors.length) break;
    }
  } catch (error) { failure = error.stack || String(error); }
  finally {
    if (session) {
      try { await closeContext(session); }
      catch (error) { failure = [failure, `Session cleanup failed: ${error.stack || error}`].filter(Boolean).join('\n'); }
    }
  }
  if (failure) meta.failure = failure;
  const report = buildRuntimeReport(meta, samples, { minimumSamples: options.smoke ? options.reps : 30, diagnostic: options.smoke });
  const file = join(outputDir, `${options.engine}-${options.scenario}-${options.cacheState}${options.smoke ? '-smoke' : ''}.json`);
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
  const functionalPassed = !failure && samples.length === options.reps && samples.every(sample => sample.errors.length === 0 && (!sample.functional.searchEnabled || sample.functional.inputTyped));
  console.log(`[measure-newtab] report=${file}; functional=${functionalPassed ? 'passed' : 'failed'}; runtime=${report.gate}`);
  return { report, file, functionalPassed, failure };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const result = await runMeasurement(options);
  if (!result.functionalPassed || (options.gate && result.report.gate !== 'passed')) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[measure-newtab] ${error.stack || error}`); process.exitCode = 1; });
}
