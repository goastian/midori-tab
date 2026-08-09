#!/usr/bin/env node

/**
 * PERF-003 — Presupuesto de build.
 *
 * Valida que el bundle de producción cumpla los presupuestos del plan:
 *  - JS raw enlazado por dist/index.html (entry + modulepreload)
 *  - CSS raw enlazado por dist/index.html
 *  - Ningún chunk no crítico vuelve a los preloads del entry.
 *
 * Uso:
 *   node scripts/check-performance-budget.mjs [--js=165] [--css=44] [--strict]
 *
 * Si no existe bundle-analysis.json o está más viejo que dist/index.html,
 * reconstruye con el analizador (ANALYZE_BUNDLE=1). Para umbrales numéricos
 * por defecto se usan los objetivos de la Fase 1 del plan (JS ≤ 165 KiB,
 * CSS ≤ 44 KiB). Con --strict también se declara fallo si el archivo de
 * análisis tiene que reconstruirse (útil en CI para exigir reproducibilidad).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const DIST_DIR = resolve(PROJECT_ROOT, 'dist');
const ANALYSIS_FILE = resolve(DIST_DIR, 'bundle-analysis.json');
const ENTRY_FILE = resolve(DIST_DIR, 'index.html');

const DEFAULT_JS_BUDGET = 165;
const DEFAULT_CSS_BUDGET = 44;

const CRITICAL_PRELOAD_RE = /^\/?(index\.js|assets\/vendor-|assets\/i18n-en-|assets\/omni-.*\.css$)/;

function isCriticalJSPreload(path) {
  return (
    path === '/index.js'
    || /^\/assets\/vendor-.*\.js$/.test(path)
    || /^\/assets\/i18n-en-.*\.js$/.test(path)
  );
}

function isCriticalCSSPreload(path) {
  return /^\/assets\/index-.*\.css$/.test(path);
}

function parseBool(flag, argv) {
  return argv.includes(flag);
}

function parseArg(name, defaultValue) {
  const match = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`));
  if (!match) return defaultValue;
  const value = Number(match.slice(`--${name}=`.length));
  return Number.isFinite(value) && value > 0 ? value : defaultValue;
}

function readAnalysis() {
  return JSON.parse(readFileSync(ANALYSIS_FILE, 'utf8'));
}

function main() {
  const argv = process.argv.slice(2);
  const strict = parseBool('--strict', argv);
  const jsBudget = parseArg('js', DEFAULT_JS_BUDGET);
  const cssBudget = parseArg('css', DEFAULT_CSS_BUDGET);

  if (!existsSync(ENTRY_FILE)) {
    console.error('[check-performance-budget] dist/index.html no existe. Ejecuta primero un build.');
    process.exit(1);
  }

  const analysisMissing = !existsSync(ANALYSIS_FILE);
  const analysisStale = analysisMissing
    || statSync(ANALYSIS_FILE).mtimeMs < statSync(ENTRY_FILE).mtimeMs;

  if (analysisMissing || analysisStale) {
    console.log('[check-performance-budget] Regenerando bundle-analysis (ANALYZE_BUNDLE=1)...');
    try {
      execFileSync('npm', ['run', 'analyze:bundle'], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit',
      });
    } catch (err) {
      console.error('[check-performance-budget] El build de análisis falló.');
      console.error(err.stderr?.toString?.() || String(err));
      process.exit(1);
    }
    if (strict) {
      console.error(
        '[check-performance-budget] Análisis irreproducible: hubo que reconstruirlo. ¿Ejecutaste analyze:bundle en el flujo de CI?',
      );
      process.exit(1);
    }
  }

  const analysis = readAnalysis();
  const html = readFileSync(ENTRY_FILE, 'utf8');
  const entryLinks = [...html.matchAll(/(?:href|src)="(\/[^"]+)"/g)]
    .map((m) => m[1])
    .filter((p) => /\.(js|css)$/.test(p));

  const byFile = new Map(analysis.files.map((f) => ['/' + f.fileName, f]));

  let jsBytes = 0;
  let cssBytes = 0;
  const violations = [];

  for (const link of entryLinks) {
    const file = byFile.get(link);
    const bytes = file ? file.bytes : statSync(resolve(DIST_DIR, link.replace(/^\//, ''))).size;

    if (link.endsWith('.js')) jsBytes += bytes;
    else if (link.endsWith('.css')) cssBytes += bytes;

    if (link.endsWith('.js') && !isCriticalJSPreload(link)) {
      violations.push(`Chunk no crítico en preload JS: ${link}`);
    }
    if (link.endsWith('.css') && !isCriticalCSSPreload(link)) {
      violations.push(`Chunk no crítico en preload CSS: ${link}`);
    }
  }

  const jsKiB = jsBytes / 1024;
  const cssKiB = cssBytes / 1024;

  console.log('--- Presupuesto de build -------------------------------------------------');
  console.log(`JS inicial enlazado : ${jsKiB.toFixed(2)} KiB  (presupuesto ≤ ${jsBudget} KiB)`);
  console.log(`CSS inicial enlazado: ${cssKiB.toFixed(2)} KiB  (presupuesto ≤ ${cssBudget} KiB)`);

  const failures = [];

  if (jsKiB > jsBudget) {
    failures.push(`JS inicial ${jsKiB.toFixed(2)} KiB supera el presupuesto de ${jsBudget} KiB`);
  }
  if (cssKiB > cssBudget) {
    failures.push(`CSS inicial ${cssKiB.toFixed(2)} KiB supera el presupuesto de ${cssBudget} KiB`);
  }
  failures.push(...violations);

  if (failures.length) {
    console.error('\n--- Fallos ---------------------------------------------------------------');
    for (const failure of failures) {
      console.error(`✗ ${failure}`);
    }
    process.exit(1);
  }

  console.log('\n✔ Presupuesto cumplido.');
  process.exit(0);
}

main();