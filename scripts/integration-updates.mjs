import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = new Set([
  '/src/services/MidoriUpdateService.js',
  '/src/services/GitHubReleaseClient.js',
  '/src/services/fetchJsonWithTimeout.js',
  '/src/utils/semver.js',
]);

const HARNESS = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Midori update integration</title></head><body>
<output id="result">Loading production modules</output>
<script type="module">
import MidoriUpdateService from '/src/services/MidoriUpdateService.js';
import GitHubReleaseClient from '/src/services/GitHubReleaseClient.js';
window.checkUpdate = async function (options) {
  const storageKey = 'integration-update-' + options.id;
  const service = new MidoriUpdateService({
    storageKey,
    client: new GitHubReleaseClient({ apiBaseUrl: location.origin + '/api/' + options.id }),
  });
  const result = await service.checkForUpdate({
    browserInfo: options.browserInfo,
    currentVersion: options.extensionVersion,
    force: options.force || false,
  });
  const persisted = JSON.parse(localStorage.getItem(storageKey) || 'null');
  const evidence = {
    eligible: result.eligible,
    hasNewerVersion: result.hasNewerVersion,
    currentVersion: result.currentVersion,
    latestVersion: result.latestVersion,
    source: result.source,
    reason: result.reason,
    persisted,
  };
  document.querySelector('#result').textContent = JSON.stringify(evidence);
  return evidence;
};
window.integrationReady = true;
</script></body></html>`;

async function fixtureServer(cases) {
  const calls = [];
  const scenarios = new Map(cases.map(scenario => [scenario.id, scenario]));
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    try {
      if (pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        response.end(HARNESS);
      } else if (MODULES.has(pathname)) {
        response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        response.end(await readFile(resolve(ROOT, pathname.slice(1))));
      } else if (/^\/api\/[^/]+\/repos\/goastian\/midori-desktop\/releases$/.test(pathname)) {
        const id = pathname.split('/')[2];
        const scenario = scenarios.get(id);
        if (!scenario) { response.writeHead(404); response.end(); return; }
        const etag = `"integration-${id}"`;
        const notModified = request.headers['if-none-match'] === etag;
        calls.push({ id, status: notModified ? 304 : 200, ifNoneMatch: request.headers['if-none-match'] || null });
        response.writeHead(notModified ? 304 : 200, { 'Content-Type': 'application/json', ETag: etag, 'Cache-Control': 'no-store' });
        response.end(notModified ? undefined : JSON.stringify([
          { id: 1, tag_name: `v${scenario.release}`, draft: false, prerelease: false },
          { id: 2, tag_name: 'v999999.0.0', draft: true, prerelease: false },
          { id: 3, tag_name: 'v999999.0.0-beta.1', draft: false, prerelease: true },
        ]));
      } else {
        response.writeHead(404);
        response.end();
      }
    } catch (error) {
      response.writeHead(500);
      response.end(error.message);
    }
  });
  await new Promise((resolveListening, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListening);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    calls,
    close: () => new Promise((done, reject) => {
      server.close(error => error ? reject(error) : done());
      server.closeAllConnections();
    }),
  };
}

export async function runUpdateIntegration(session) {
  const page = await session.context.newPage();
  let fixture;
  try {
    await page.goto(session.url, { waitUntil: 'domcontentloaded' });
    const nativeIdentity = await page.evaluate(async () => {
      const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
      return typeof runtime?.getBrowserInfo === 'function' ? await runtime.getBrowserInfo() : null;
    });
    const nativeVersion = /^midori$/i.test(nativeIdentity?.name || '') ? nativeIdentity.version : null;
    const currentVersion = nativeVersion || '11.9.1';
    const major = Number(currentVersion.split('.')[0]);
    assert.ok(Number.isInteger(major) && major > 0, 'A valid current browser version is required');
    const nextVersion = `${major + 1}.0.0`;
    const cases = [
      { id: 'unknown', version: '', release: nextVersion, eligible: false, extensionVersion: '1.0.53' },
      { id: 'equal', version: currentVersion, release: currentVersion, eligible: false, extensionVersion: '1.0.53' },
      { id: 'older', version: currentVersion, release: '0.0.1', eligible: false, extensionVersion: '0.0.0' },
      { id: 'newer', version: currentVersion, release: nextVersion, eligible: true, extensionVersion: '999999.0.0' },
      { id: 'not-midori', version: currentVersion, release: nextVersion, eligible: false, isMidori: false, extensionVersion: '1.0.53' },
    ];
    fixture = await fixtureServer(cases);
    await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.integrationReady === true, null, { timeout: 10_000 });
    const results = [];
    for (const scenario of cases) {
      const options = {
        id: scenario.id,
        browserInfo: { isMidori: scenario.isMidori !== false, version: scenario.version },
        extensionVersion: scenario.extensionVersion,
      };
      const first = await page.evaluate(options => window.checkUpdate(options), options);
      assert.equal(first.eligible, scenario.eligible, `${scenario.id}: update eligibility`);
      assert.equal(first.currentVersion, scenario.version, `${scenario.id}: native version must win over extension version`);
      if (scenario.isMidori === false) {
        assert.equal(first.reason, 'not-midori');
        assert.equal(first.persisted, null);
        assert.equal(fixture.calls.filter(call => call.id === scenario.id).length, 0);
        results.push({ id: scenario.id, options, first });
        continue;
      }
      assert.equal(first.source, 'network');
      assert.equal(first.latestVersion, scenario.release, `${scenario.id}: draft/prerelease must be excluded`);
      assert.equal(first.persisted.latestVersion, scenario.release);
      assert.equal(fixture.calls.filter(call => call.id === scenario.id).length, 1);

      await page.goto(fixture.url, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.integrationReady === true, null, { timeout: 10_000 });
      const cached = await page.evaluate(options => window.checkUpdate(options), options);
      assert.equal(cached.source, 'cache', `${scenario.id}: cache must survive a document reload`);
      assert.equal(cached.eligible, scenario.eligible);
      assert.equal(fixture.calls.filter(call => call.id === scenario.id).length, 1);

      const revalidated = await page.evaluate(options => window.checkUpdate({ ...options, force: true }), options);
      assert.equal(revalidated.reason, 'not-modified', `${scenario.id}: real HTTP 304`);
      assert.equal(revalidated.eligible, scenario.eligible);
      assert.deepEqual(fixture.calls.filter(call => call.id === scenario.id).map(call => call.status), [200, 304]);
      results.push({ id: scenario.id, options, first, cached, revalidated });
    }
    return {
      status: 'passed',
      transport: 'browser-fetch-and-localStorage',
      moduleSource: 'unmodified-production-es-modules',
      nativeIdentity,
      versionSource: nativeVersion ? 'native-Midori-with-explicit-edge-case-fixtures' : 'explicit-Midori-fixtures-in-non-Midori-browser',
      cases: results,
      requests: fixture.calls,
    };
  } finally {
    try {
      await page.close();
    } finally {
      await fixture?.close();
    }
  }
}
