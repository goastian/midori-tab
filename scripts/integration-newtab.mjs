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
