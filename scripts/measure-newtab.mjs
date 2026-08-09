#!/usr/bin/env node

/**
 * PERF-002 — Harness WebExtension.
 *
 * Construye la extensión, la carga desempaquetada en Chromium vía Playwright,
 * abre la New Tab N veces y recoge:
 *   - marcas propias (midori:boot-start … midori:idle-complete)
 *   - long tasks y CLS (del reporte de perfMarks)
 *   - navigationStart → marcas
 *   - conteo de nodos y listeners
 * Produce dist/perf/<escenario>.json con p50/p75/p95 por marca.
 *
 * Uso:
 *   node scripts/measure-newtab.mjs --reps 30 [--cold|--warm] [--build]
 *   node scripts/measure-newtab.mjs --scenario stress --reps 20
 *
 * Requiere: Chromium de Playwright instalado. Ejecutar desde midori-tab/.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const REPO_ROOT = resolve(PROJECT_ROOT, '..');
const DIST_DIR = resolve(PROJECT_ROOT, 'dist');
const PERF_DIR = resolve(DIST_DIR, 'perf');

const playwrightModule = await import(
  resolve(REPO_ROOT, 'node_modules/@playwright/test/index.mjs')
);
const { chromium } = playwrightModule;

const DEFAULT_REPS = 30;

function parseArg(name, fallback) {
  const match = process.argv.find((a) => a.startsWith(`--${name}=`));
  return match ? match.slice(`--${name}=`.length) : fallback;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

async function build() {
  console.log('[measure-newtab] build:chrome...');
  execFileSync('npm', ['run', 'build:chrome'], { cwd: PROJECT_ROOT, stdio: 'inherit' });
}

async function launchWithExtension() {
  const extensionPath = DIST_DIR;
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    channel: undefined,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-features=Translate,OptimizationHints',
    ],
    viewport: { width: 1280, height: 800 },
  });

  let extensionId = null;

  const pushWorkerId = (url) => {
    const match = url.match(/^chrome-extension:\/\/([a-z]{32})\//);
    if (match && !extensionId) extensionId = match[1];
  };

  for (const worker of context.serviceWorkers()) {
    pushWorkerId(worker.url());
  }

  const onServiceWorkerRegistered = (worker) => {
    worker.url().startsWith('chrome-extension://') && pushWorkerId(worker.url());
  };
  context.on('serviceworker', onServiceWorkerRegistered);

  const browser = context.browser();
  if (browser && !extensionId) {
    try {
      const cdp = await browser.newBrowserCDPSession();
      const { targetInfos } = await cdp.send('Target.getTargets');
      for (const target of targetInfos) {
        pushWorkerId(target.url || '');
      }
      await cdp.detach();
    } catch {
      /* CDP no disponible */
    }
  }

  for (let i = 0; !extensionId && i < 40; i += 1) {
    const pages = context.pages();
    for (const page of pages) {
      if (page.url().startsWith('chrome-extension://')) {
        extensionId = new URL(page.url()).host;
        break;
      }
    }
    if (extensionId) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  context.off('serviceworker', onServiceWorkerRegistered);
  void onServiceWorkerRegistered;

  if (!extensionId) {
    await context.close();
    throw new Error('No se pudo localizar el id de la extensión cargada.');
  }

  return { context, extensionId };
}

async function openNewTab(context, extensionId, warm, scenario, i) {
  const page = await context.newPage();
  const perfReady = page.waitForEvent('console', { timeout: 0 }).catch(() => null);

  await page.goto(`chrome-extension://${extensionId}/index.html`, {
    waitUntil: 'domcontentloaded',
  });

  await page.waitForFunction(
    () => window.__midoriPerf && window.__midoriPerf.isComplete === true,
    { timeout: 15_000 },
  ).catch(() => null);

  const result = await page.evaluate(() => {
    const perf = window.__midoriPerf;
    const nav = performance.getEntriesByType('navigation')[0];
    const paint = performance.getEntriesByType('paint');
    const firstPaint = paint.find((p) => p.name === 'first-paint');
    const firstContentfulPaint = paint.find((p) => p.name === 'first-contentful-paint');
    const resourceEntries = performance.getEntriesByType('resource');

    return {
      perf,
      nav: {
        domContentLoaded: nav ? nav.domContentLoadedEventEnd : null,
        loadEvent: nav ? nav.loadEventEnd : null,
        transferSize: nav ? nav.transferSize : null,
      },
      firstPaintMs: firstPaint ? firstPaint.startTime : null,
      firstContentfulPaintMs: firstContentfulPaint ? firstContentfulPaint.startTime : null,
      remoteRequests: resourceEntries
        .map((r) => ({ name: r.name, startTime: r.startTime }))
        .filter((r) => /^https?:/.test(r.name)),
    };
  });

  await page.close();
  return result;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

function summarize(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    n: sorted.length,
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p95: percentile(sorted, 95),
    mean: sorted.length ? Math.round((sum / sorted.length) * 100) / 100 : null,
    min: sorted[0] ?? null,
    max: sorted[sorted.length - 1] ?? null,
  };
}

function buildReport(rows, scenario) {
  const marks = ['boot-start', 'shell-visible', 'search-ready', 'above-fold-stable', 'idle-complete'];

  const marksSummary = {};
  for (const mark of marks) {
    const values = rows
      .map((row) => row?.perf?.marks?.[mark])
      .filter((v) => typeof v === 'number');
    marksSummary[mark] = summarize(values);
  }

  const navigationSummary = {};
  for (const key of ['domContentLoaded', 'loadEvent', 'firstPaintMs', 'firstContentfulPaintMs']) {
    const values = rows.map((row) => row?.nav?.[key]).filter((v) => typeof v === 'number');
    navigationSummary[key] = summarize(values);
  }

  const longTasks = rows
    .map((row) => row?.perf?.longTasks?.totalMs)
    .filter((v) => typeof v === 'number');

  const clsValues = rows.map((row) => row?.perf?.cls).filter((v) => typeof v === 'number');

  const nodeValues = rows.map((row) => row?.perf?.nodes).filter((v) => typeof v === 'number');

  const remoteRequestsBeforeSearchReady = rows
    .map((row) => {
      const sr = row?.perf?.marks?.['search-ready'];
      if (sr == null) return 0;
      return (row?.remoteRequests || []).filter((r) => r.startTime < sr).length;
    })
    .reduce((acc, count) => acc + count, 0);

  // Requests antes de search-ready que no son el wallpaper (api.unsplash.com /
  // images.unsplash.com). El resto se considera fuga de la ruta crítica.
  const unexpectedRequestsBeforeSearchReady = rows
    .map((row) => {
      const sr = row?.perf?.marks?.['search-ready'];
      if (sr == null) return 0;
      return (row?.remoteRequests || []).filter((r) => r.startTime < sr
        && !/unsplash\.com/.test(r.name)).length;
    })
    .reduce((acc, count) => acc + count, 0);

  const reportsAtSearchReady = rows.filter((row) => {
    const sr = row?.perf?.marks?.['search-ready'];
    return sr != null;
  });

  return {
    generatedAt: new Date().toISOString(),
    scenario,
    reps: rows.length,
    environment: rows.find((row) => row?.perf?.browser)?.perf?.browser ?? null,
    marks: marksSummary,
    navigation: navigationSummary,
    longTasks: summarize(longTasks),
    cls: summarize(clsValues),
    nodes: summarize(nodeValues),
    remoteRequestsBeforeSearchReady,
    unexpectedRequestsBeforeSearchReady,
    note: 'Las marcas miden desde navigationStart de index.html. Ver plan §2 y §6.',
  };
}

async function main() {
  const scenario = parseArg('scenario', 'default');
  const reps = Number(parseArg('reps', String(DEFAULT_REPS)));
  const warm = !hasFlag('cold');
  const shouldBuild = hasFlag('build');

  if (shouldBuild) {
    await build();
  }

  if (!existsSync(DIST_DIR) || !existsSync(resolve(DIST_DIR, 'index.html'))) {
    console.error('[measure-newtab] dist/ vacío. Usa --build o ejecuta npm run build:chrome.');
    process.exit(1);
  }

  mkdirSync(PERF_DIR, { recursive: true });

  const { context, extensionId } = await launchWithExtension();
  const rows = [];

  for (let i = 0; i < reps; i += 1) {
    const row = await openNewTab(context, extensionId, warm, scenario, i);
    rows.push(row);
    process.stdout.write(`\r[measure-newtab] ${i + 1}/${reps}`);
  }

  await context.close();
  process.stdout.write('\n');

  const report = buildReport(rows, scenario);
  const fileName = `${scenario}-${warm ? 'warm' : 'cold'}.json`;
  const outFile = resolve(PERF_DIR, fileName);
  writeFileSync(outFile, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\n[measure-newtab] Reporte: ${outFile}`);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error('[measure-newtab] Error:', err.message);
  process.exit(1);
});