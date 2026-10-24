#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, artifactIdentity, buildExtension, closeContext, openContextWithRetry, parseOptions, runMeasurement } from './measure-newtab.mjs';
import { runTransportIntegration } from './integration-transport.mjs';
import { runUpdateIntegration } from './integration-updates.mjs';
import { readBundleGraph } from './critical-requests.mjs';
import { runEarlySearchIntegration } from '../tests/integration/early-search.mjs';
import { runStartupVisualIntegration } from '../tests/integration/startup-visual.mjs';
import { runBookmarkEditorIntegration } from '../tests/integration/bookmark-editor.mjs';
import { runUpdateToastIntegration } from '../tests/integration/update-toast.mjs';
import { instrumentFaviconFixture, runFaviconIntegration } from '../tests/integration/favicon-cache.mjs';
import { runSpacesIntegration } from '../tests/integration/spaces.mjs';
import { runSponsoredIntegration } from '../tests/integration/sponsored-runtime.mjs';
import { runSmartSuggestionsIntegration } from '../tests/integration/smart-suggestions.mjs';
import { runResizeLayoutIntegration } from '../tests/integration/resize-layout.mjs';
import { runWallpaperPrewarmIntegration } from '../tests/integration/wallpaper-prewarm.mjs';
import { instrumentStorageFaultFixture, runWidgetDataSafetyIntegration } from '../tests/integration/widget-data-safety.mjs';

const HELP = 'Usage: npm run test:integration -- [--engine firefox|chromium] [--build] [--dist PATH] [--output-dir PATH]';

function integrationOptions(args) {
  const options = { engine: 'firefox', build: false, extensionPath: join(ROOT, 'dist') };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--help') { options.help = true; continue; }
    if (argument === '--build') { options.build = true; continue; }
    const [flag, inline] = argument.split('=', 2);
    const key = { '--engine': 'engine', '--dist': 'extensionPath', '--output-dir': 'outputDir' }[flag];
    if (!key) throw new Error(`Unknown option ${argument}`);
    const value = inline ?? args[++index];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    options[key] = value;
  }
  if (!['firefox', 'chromium'].includes(options.engine)) throw new Error('Engine must be firefox or chromium');
  options.extensionPath = resolve(options.extensionPath);
  options.outputDir = resolve(options.outputDir || join(ROOT, 'artifacts', 'integration', options.engine));
  if (options.build && options.extensionPath !== join(ROOT, 'dist')) throw new Error('--build cannot overwrite a custom --dist');
  return options;
}

function saveJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function measurementOptions(options, directory, outputName, timeoutMs = 20_000) {
  return parseOptions(['--engine', options.engine, '--cold', '--smoke', '--reps', '1',
    '--dist', directory, '--output-dir', join(options.outputDir, outputName), '--timeout-ms', String(timeoutMs)]);
}

function describeMeasurement(result) {
  return { report: result.file, functionalPassed: result.functionalPassed, runtimeGate: result.report.gate,
    violations: result.report.gateResults.violations, failure: result.failure };
}

function hasViolation(result, metric) {
  return result.report.gateResults.violations.some(violation => violation.metric === metric);
}

async function startupFixture() {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ path: request.url, timestamp: Date.now() });
    response.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ fixture: 'unexpected-startup-request' }));
  });
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  return { url: `http://127.0.0.1:${server.address().port}/startup`, requests,
    close: () => new Promise((done, reject) => {
      server.close(error => error ? reject(error) : done());
      server.closeAllConnections();
    }) };
}

export async function runIntegration(options) {
  mkdirSync(options.outputDir, { recursive: true });
  const summary = { kind: 'newtab-browser-integration', engine: options.engine,
    generatedAt: new Date().toISOString(), status: 'running', cases: [] };
  const summaryFile = join(options.outputDir, 'summary.json');
  let temporaryDirectory;
  let originalArtifact;
  const check = async (name, operation) => {
    try {
      const evidence = await operation();
      summary.cases.push({ name, status: 'passed', evidence });
      console.log(`[integration-newtab] PASS ${name}`);
    } catch (error) {
      summary.cases.push({ name, status: 'failed', error: error.stack || String(error) });
      console.error(`[integration-newtab] FAIL ${name}: ${error.message}`);
    }
    saveJson(summaryFile, summary);
  };
  try {
    if (options.build) buildExtension(options.engine);
    originalArtifact = artifactIdentity(options.extensionPath);
    summary.artifact = originalArtifact;
    const baseOptions = measurementOptions(options, options.extensionPath, 'smoke');
    let session;
    await check('installed-extension', async () => {
      session = await openContextWithRetry(baseOptions);
      summary.browser = session.metadata;
      assert.equal(session.metadata.fullExtensionInstalled, true, 'The full extension must be installed');
      assert.ok(session.profile, 'The browser session must use an isolated temporary profile');
      return session.metadata;
    });
    if (session) {
      try {
        await check('update-service-http-storage-version', async () => {
          const result = await runUpdateIntegration(session);
          saveJson(join(options.outputDir, 'updates.json'), result);
          return { report: join(options.outputDir, 'updates.json'), nativeIdentity: result.nativeIdentity,
            cases: result.cases.map(item => item.id), httpRequests: result.requests.length };
        });
        await check('newtab-search-and-network-transport', async () => {
          const directory = join(options.outputDir, 'transport');
          const result = await runTransportIntegration(session, { outputDir: directory });
          return { report: join(directory, 'transport-integration.json'), passed: result.passed };
        });
        await check('update-toast-deferred-load-native-version-and-dismissal', async () => {
          const outputDir = join(options.outputDir, 'update-toast');
          const result = await runUpdateToastIntegration(session, { engine: options.engine,
            extensionPath: options.extensionPath, outputDir });
          return { report: join(outputDir, 'update-toast.json'), passed: result.passed,
            identity: result.identity, cases: result.cases.map(item => item.id) };
        });
      } finally {
        await check('temporary-profile-cleanup', async () => {
          await closeContext(session);
          assert.equal(existsSync(session.profile), false, 'Temporary browser profile must be deleted');
          return { removed: true };
        });
      }
    }

    await check('normal-newtab-smoke', async () => {
      const result = await runMeasurement(baseOptions);
      summary.runtimeGate = result.report.gate;
      assert.equal(result.functionalPassed, true, `Normal new tab smoke must work; see ${result.file}`);
      // Performance is enforced separately in CI. Preserve the actual verdict here.
      return describeMeasurement(result);
    });

    temporaryDirectory = mkdtempSync(join(tmpdir(), `midori-integration-${options.engine}-`));
    const copyExtension = name => {
      const directory = join(temporaryDirectory, name);
      cpSync(options.extensionPath, directory, { recursive: true });
      return directory;
    };

    await check('early-html-search-and-vue-handoff', async () => {
      return runEarlySearchIntegration({ engine: options.engine, extensionPath: options.extensionPath,
        outputDir: join(options.outputDir, 'early-search') });
    });

    await check('startup-visual-background-and-layout-continuity', async () => {
      const outputDir = join(options.outputDir, 'startup-visual');
      const result = await runStartupVisualIntegration({ engine: options.engine,
        extensionPath: options.extensionPath, outputDir, throwOnFailure: false });
      const report = join(outputDir, 'startup-visual.json');
      const failed = result.cases.filter(item => item.status !== 'passed').map(item => item.id);
      assert.equal(result.passed, true, `Startup visual regressions: ${failed.join(', ')}; see ${report}`);
      return { report, passed: result.passed,
        cases: result.cases.map(({ id, status, measurements }) => ({ id, status, measurements })) };
    });

    await check('disabled-search-still-reaches-dashboard-readiness', async () => {
      const directory = copyExtension('disabled-search');
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      writeFileSync(join(directory, 'index.html'), html.replace('<head>', '<head><script src="/integration-disable-search.js"></script>'));
      writeFileSync(join(directory, 'integration-disable-search.js'),
        `localStorage.setItem('widgetsStore', JSON.stringify({enabled: {search: false, privacy: true}}));\n`);
      const result = await runMeasurement(measurementOptions(options, directory, 'disabled-search'));
      assert.equal(result.functionalPassed, true, 'Disabling search must leave the rest of the dashboard usable');
      const sample = result.report.samples[0];
      assert.equal(sample.functional.searchExpected, false);
      assert.equal(sample.functional.searchEnabled, false, 'Neither the HTML shell nor Vue may render the disabled search field');
      assert.equal(sample.earlySearchReadyMs, null, 'A disabled search must not publish invented readiness');
      assert.equal(sample.inputResponseMs, null, 'No keyboard probe may target a disabled field');
      assert.ok(Number.isFinite(sample.interactionReadyMs), 'Visible bookmarks must still complete the readiness barrier');
      assert.equal(result.report.gateResults.violations.some(item => ['earlySearchReadyMs', 'searchReadyMs', 'inputResponseMs', 'search'].includes(item.metric)), false);
      return describeMeasurement(result);
    });

    await check('favicon-cache-first-frame-and-category-reuse', async () => {
      const directory = copyExtension('favicon-cache');
      instrumentFaviconFixture(directory);
      const faviconSession = await openContextWithRetry({ ...baseOptions, extensionPath: directory });
      try { return await runFaviconIntegration(faviconSession, { outputDir: join(options.outputDir, 'favicon-cache') }); }
      finally { await closeContext(faviconSession); }
    });

    await check('widget-data-safety-hydration-hide-close-conflicts-statuses-and-undo', async () => {
      const directory = copyExtension('widget-data-safety');
      instrumentStorageFaultFixture(directory);
      const safetySession = await openContextWithRetry({ ...baseOptions, extensionPath: directory });
      const outputDir = join(options.outputDir, 'widget-data-safety');
      try {
        const result = await runWidgetDataSafetyIntegration(safetySession, { outputDir });
        return { report: join(outputDir, 'widget-data-safety.json'), passed: result.passed, cases: result.cases.map(item => item.id) };
      } finally { await closeContext(safetySession); }
    });

    await check('bookmark-editor-deferred-load-and-persistent-editing', async () => {
      const editorSession = await openContextWithRetry(baseOptions);
      const outputDir = join(options.outputDir, 'bookmark-editor');
      try {
        const result = await runBookmarkEditorIntegration(editorSession, { extensionPath: options.extensionPath, outputDir });
        return { report: join(outputDir, 'bookmark-editor.json'), passed: result.passed,
          cases: result.cases, editorResources: result.editorResources };
      } finally { await closeContext(editorSession); }
    });

    await check('spaces-optional-load-toggle-persistence-and-reset', async () => {
      const spacesSession = await openContextWithRetry(baseOptions);
      try { return await runSpacesIntegration(spacesSession, { outputDir: join(options.outputDir, 'spaces') }); }
      finally { await closeContext(spacesSession); }
    });

    await check('resize-and-restore-layout-follows-viewport-without-intermediate-states', async () => {
      const resizeSession = await openContextWithRetry(baseOptions);
      const outputDir = join(options.outputDir, 'resize-layout');
      try {
        const result = await runResizeLayoutIntegration(resizeSession, { outputDir });
        return { report: join(outputDir, 'resize-layout.json'), passed: result.passed, frames: result.frames, columns: result.columns };
      } finally { await closeContext(resizeSession); }
    });

    await check('next-wallpaper-preview-is-prewarmed-for-the-following-tab', async () => {
      const prewarmSession = await openContextWithRetry(baseOptions);
      const outputDir = join(options.outputDir, 'wallpaper-prewarm');
      try {
        const result = await runWallpaperPrewarmIntegration(prewarmSession, { outputDir });
        return { report: join(outputDir, 'wallpaper-prewarm.json'), passed: result.passed, requests: result.requests };
      } finally { await closeContext(prewarmSession); }
    });

    await check('smart-suggestions-optional-load-cross-tab-and-dismiss', async () => {
      const suggestionsSession = await openContextWithRetry(baseOptions);
      try { return await runSmartSuggestionsIntegration(suggestionsSession, { outputDir: join(options.outputDir, 'smart-suggestions') }); }
      finally { await closeContext(suggestionsSession); }
    });

    await check('sponsored-dials-deferred-load-viewability-and-native-click', async () => {
      return runSponsoredIntegration({ engine: options.engine, extensionPath: options.extensionPath,
        outputDir: join(options.outputDir, 'sponsored-runtime') });
    });

    await check('negative-dynamic-optional-feature-and-deduplicated-css', async () => {
      const directory = copyExtension('optional-feature');
      const bundle = readBundleGraph(directory);
      const optional = [...bundle.values()].find(chunk => chunk.modules?.some(module => /\/NotesWidget\.vue(?:\?|$)/.test(module)));
      assert.ok(optional, 'The actual Notes widget must have a deferred production chunk');
      assert.notEqual(optional.fileName, 'index.js', 'An optional Notes widget must not be compiled into the entry');
      const css = optional.css?.[0];
      assert.ok(css, 'The actual deferred widget must provide CSS metadata');
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      assert.match(html, /src="\/index\.js"/);
      const stylesheet = `<link rel="stylesheet" href="/${css}">`;
      writeFileSync(join(directory, 'index.html'), html.replace('</head>', `${stylesheet}${stylesheet}</head>`)
        .replace('src="/index.js"', 'src="/integration-graph-entry.js"'));
      writeFileSync(join(directory, 'integration-graph-entry.js'),
        `await import(${JSON.stringify(`./${optional.fileName}`)});\nawait import('./index.js');\n`);
      const result = await runMeasurement(measurementOptions(options, directory, 'negative-optional-feature'));
      assert.equal(result.functionalPassed, true, 'Loading an unused optional component must not break the page');
      assert.equal(result.report.gate, 'failed');
      assert.ok(hasViolation(result, 'startupGraph'), 'An actual optional widget imported dynamically before interaction must be rejected');
      const sample = result.report.samples[0];
      assert.equal(sample.startupResourceCoverage, 'available', 'Both engines must observe local resource loads');
      const graph = sample.resourceGraphs.interaction;
      assert.ok(graph.files.some(file => file.path === `/${optional.fileName}` && file.observations > 0), 'The browser must observe the dynamic import itself');
      assert.equal(graph.files.filter(file => file.path === `/${css}`).length, 1, 'Repeated CSS links must count once');
      assert.equal(graph.cssBytes, graph.files.filter(file => file.type === 'css' && !file.laboratory).reduce((total, file) => total + file.bytes, 0));
      assert.equal(new Set(graph.files.map(file => file.path)).size, graph.files.length, 'Static imports, dynamic imports and preloads must share one resource set');
      return { ...describeMeasurement(result), importedProductionChunk: optional.fileName, duplicatedStylesheet: css,
        graph: { jsBytes: graph.jsBytes, cssBytes: graph.cssBytes, uniqueResources: graph.uniqueResources } };
    });

    await check('negative-post-readiness-resource-budget-is-rejected', async () => {
      const directory = copyExtension('late-resource-budget');
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      assert.match(html, /src="\/index\.js"/);
      writeFileSync(join(directory, 'index.html'), html.replace('src="/index.js"', 'src="/integration-late-entry.js"'));
      writeFileSync(join(directory, 'integration-late-entry.js'), `
        await import('./index.js');
        function loadAfterReadiness() { setTimeout(() => import('./integration-large-resource.js'), 50); }
        if (Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])) loadAfterReadiness();
        else window.addEventListener('midori:perf-mark', function ready(event) {
          if (event.detail.name !== 'interaction-ready') return;
          window.removeEventListener('midori:perf-mark', ready);
          loadAfterReadiness();
        });
      `);
      writeFileSync(join(directory, 'integration-large-resource.js'), `export const payload = ${JSON.stringify('budget-payload '.repeat(24_000))};\n`);
      const result = await runMeasurement(measurementOptions(options, directory, 'negative-late-resource-budget'));
      assert.equal(result.functionalPassed, true, 'The page must remain usable while the extra real module loads');
      const sample = result.report.samples[0];
      assert.equal(sample.startupResourceCoverage, 'available');
      assert.equal(sample.resourceGraphs.interaction.files.some(file => file.path === '/integration-large-resource.js'), false, 'The fixture must actually load after the full readiness barrier');
      assert.ok(sample.resourceGraphs.capture.files.some(file => file.path === '/integration-large-resource.js' && file.observations > 0), 'The browser must observe the late module request');
      assert.ok(hasViolation(result, 'captureJsBytes'), 'Moving resource cost past readiness must still fail the complete-capture budget');
      assert.equal(result.report.gate, 'failed');
      return describeMeasurement(result);
    });

    await check('negative-slow-startup-is-rejected', async () => {
      const directory = copyExtension('slow-startup');
      const html = readFileSync(join(directory, 'index.html'), 'utf8');
      assert.match(html, /<head>/i);
      writeFileSync(join(directory, 'index.html'), html.replace(/<head>/i, '<head><script src="/integration-delay.js"></script>'));
      writeFileSync(join(directory, 'integration-delay.js'), 'const integrationDelayStarted = performance.now(); while (performance.now() - integrationDelayStarted < 1200) {}\n');
      const result = await runMeasurement(measurementOptions(options, directory, 'negative-slow-startup'));
      assert.equal(result.functionalPassed, true, 'Delayed startup must still render a working page');
      assert.equal(result.report.gate, 'failed');
      assert.ok(result.report.samples[0]?.interactionReadyMs > 650, 'Navigation-relative timing must include the injected 1200 ms delay');
      assert.ok(hasViolation(result, 'interactionReadyMs'), 'The real startup delay must violate the interaction budget');
      return describeMeasurement(result);
    });

    await check('negative-missing-import-is-rejected', async () => {
      const directory = copyExtension('missing-import');
      const entry = join(directory, 'index.js');
      writeFileSync(entry, `import './integration-missing.mjs';\n${readFileSync(entry, 'utf8')}`);
      const result = await runMeasurement(measurementOptions(options, directory, 'negative-missing-import', 2500));
      assert.equal(result.functionalPassed, false, 'An unresolved entry import must fail the functional smoke');
      assert.equal(result.report.gate, 'failed');
      assert.ok(result.report.samples.some(sample => sample.errors.length > 0), 'Import failure must be reported explicitly');
      assert.ok(result.report.samples.some(sample => sample.interactionReadyMs === null), 'Missing readiness marks cannot be invented');
      assert.ok(hasViolation(result, 'interactionReadyMs'), 'Missing readiness must fail the runtime gate');
      return describeMeasurement(result);
    });

    await check('negative-startup-network-is-rejected', async () => {
      const fixture = await startupFixture();
      try {
        const directory = copyExtension('startup-network');
        const html = readFileSync(join(directory, 'index.html'), 'utf8');
        assert.match(html, /src="\/index\.js"/);
        writeFileSync(join(directory, 'index.html'), html.replace('src="/index.js"', 'src="/integration-startup-network.js"'));
        writeFileSync(join(directory, 'integration-startup-network.js'),
          `await fetch(${JSON.stringify(fixture.url)}).then(response => response.json());\nawait import('./index.js');\n`);
        const result = await runMeasurement(measurementOptions(options, directory, 'negative-startup-network'));
        saveJson(join(options.outputDir, 'negative-startup-network', 'fixture-http.json'), fixture.requests);
        assert.equal(result.functionalPassed, true, 'The page with an unwanted startup request must still work');
        assert.ok(fixture.requests.length > 0, 'The fixture must receive an actual HTTP request');
        assert.equal(result.report.gate, 'failed');
        assert.ok(hasViolation(result, 'networkBeforeInteraction'), 'The actual early HTTP request must fail the zero-network budget');
        assert.ok(result.report.samples.some(sample => sample.requests.some(request => request.url === fixture.url)), 'The browser transport must record the fixture request');
        return { ...describeMeasurement(result), fixtureRequests: fixture.requests.length };
      } finally { await fixture.close(); }
    });
  } catch (error) {
    summary.cases.push({ name: 'integration-setup', status: 'failed', error: error.stack || String(error) });
  } finally {
    if (temporaryDirectory) {
      await check('negative-fixture-cleanup', async () => {
        rmSync(temporaryDirectory, { recursive: true, force: true });
        assert.equal(existsSync(temporaryDirectory), false);
        return { removed: true };
      });
    }
    if (originalArtifact) await check('original-build-preserved', async () => {
      const finalArtifact = artifactIdentity(options.extensionPath);
      assert.equal(finalArtifact.sha256, originalArtifact.sha256, 'Integration must not modify the original build');
      return { sha256: finalArtifact.sha256 };
    });
    summary.status = summary.cases.some(item => item.status === 'failed') ? 'failed' : 'passed';
    saveJson(summaryFile, summary);
  }
  console.log(`[integration-newtab] ${summary.status.toUpperCase()} ${summaryFile}`);
  return summary;
}

async function main() {
  const options = integrationOptions(process.argv.slice(2));
  if (options.help) { console.log(HELP); return; }
  const result = await runIntegration(options);
  if (result.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`[integration-newtab] ${error.stack || error}`); process.exitCode = 1; });
}
