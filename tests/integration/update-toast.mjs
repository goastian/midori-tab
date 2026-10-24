import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finishResourceObservation, readBundleGraph } from '../../scripts/critical-requests.mjs';

export async function runUpdateToastIntegration(session, { engine, extensionPath, outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  const report = { passed: false, cases: [], downloadAction: 'Not invoked; no external navigation is part of this check' };
  let page;
  let observing = false;
  const reopen = async () => {
    await page?.close();
    page = await session.context.newPage();
    await session.network.start();
    observing = true;
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])
      && Number.isFinite(window.__midoriPerf?.marks?.['idle-complete']));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 750)));
  };
  const resources = async () => {
    const result = await finishResourceObservation(session, page);
    observing = false;
    assert.ok(result.paths.some(path => /\/MidoriUpdateNotice-[^/]+\.js$/.test(path)),
      'The real update controller must load before asserting that its optional toast stays absent');
    return result;
  };
  try {
    const toastChunk = [...readBundleGraph(extensionPath).values()]
      .find(chunk => chunk.modules?.some(module => /\/MidoriUpdateToast\.vue(?:\?|$)/.test(module)));
    assert.ok(toastChunk, 'The production build must contain the deferred MidoriUpdateToast');
    assert.notEqual(toastChunk.fileName, 'index.js');
    const toastResources = [`/${toastChunk.fileName}`, ...(toastChunk.css || []).map(path => `/${path}`)];
    report.toastResources = toastResources;
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    report.identity = await page.evaluate(async () => {
      const runtime = globalThis.browser?.runtime || globalThis.chrome?.runtime;
      const native = typeof runtime?.getBrowserInfo === 'function' ? await runtime.getBrowserInfo() : null;
      return { native, userAgent: navigator.userAgent, extensionVersion: runtime.getManifest().version };
    });
    const isMidori = /^midori$/i.test(report.identity.native?.name || '');
    if (engine === 'firefox') assert.ok(isMidori, 'The Firefox UI integration requires the real Midori browser identity');
    const version = isMidori ? report.identity.native.version : '0.0.0';
    const major = Number(version.replace(/^v/, '').split('.')[0]);
    assert.ok(Number.isInteger(major) && major >= 0, 'Use a parseable native browser version');
    const newerVersion = isMidori ? `${major + 1}.0.0` : '999999.0.0';
    await page.evaluate(currentVersion => {
      localStorage.setItem('midori_update_check_state_v1', JSON.stringify({ latestVersion: currentVersion,
        lastCheckedAt: Date.now(), lastResult: 'ok', deferredUntil: 0 }));
      const settings = JSON.parse(localStorage.getItem('tabStore') || '{}');
      localStorage.setItem('tabStore', JSON.stringify({ ...settings, showAds: false, widgetsEnabled: false,
        showSpeedDials: false, background: { type: 'Solid', default: false, color: '#eff8f3' } }));
      localStorage.setItem('widgetsStore', JSON.stringify({ enabled: { search: true, privacy: false } }));
      localStorage.setItem('i18nStore', JSON.stringify({ locale: 'en' }));
      localStorage.removeItem('midori_boot_snapshot_v1');
    }, version);
    await reopen();
    const current = await resources();
    assert.equal(await page.evaluate(() => Boolean(document.querySelector('.update-toast'))), false,
      'A release equal to the real browser version must not show an update notice');
    assert.ok(toastResources.every(path => !current.paths.includes(path)), 'A closed notice must not load toast JavaScript or CSS');
    report.cases.push({ id: 'current-browser-version-keeps-toast-unloaded', browserVersion: report.identity.native?.version || null,
      cachedVersion: version, resources: current });

    await page.evaluate(latestVersion => localStorage.setItem('midori_update_check_state_v1', JSON.stringify({ latestVersion,
      lastCheckedAt: Date.now(), lastResult: 'ok', deferredUntil: 0 })), newerVersion);
    await reopen();
    if (!isMidori) {
      const otherBrowser = await resources();
      assert.equal(await page.evaluate(() => Boolean(document.querySelector('.update-toast'))), false,
        'An actual non-Midori browser must never show the Midori browser update toast');
      assert.ok(toastResources.every(path => !otherBrowser.paths.includes(path)));
      report.cases.push({ id: 'non-midori-ignores-newer-cached-release', resources: otherBrowser });
    } else {
      await page.waitForFunction(() => Boolean(document.querySelector('.update-toast')), null, { timeout: 10_000 });
      const visible = { resources: await resources(), message: await page.evaluate(() => document.querySelector('.update-toast__message').textContent) };
      assert.ok(visible.message.includes(newerVersion), 'The toast must render the cached version newer than the native browser');
      assert.ok(toastResources.every(path => visible.resources.paths.includes(path)), 'Showing an eligible update must load the real deferred toast');
      report.cases.push({ id: 'newer-native-browser-release-renders-toast', latestVersion: newerVersion, ...visible });
      if (outputDir) await page.screenshot({ path: join(outputDir, 'update-toast-visible.png') });
      const clickedAt = await page.evaluate(() => Date.now());
      await page.click('.update-toast__button--secondary');
      await page.waitForFunction(() => !document.querySelector('.update-toast')
        && JSON.parse(localStorage.getItem('midori_update_check_state_v1') || '{}').lastResult === 'deferred');
      const deferred = await page.evaluate(() => JSON.parse(localStorage.getItem('midori_update_check_state_v1')));
      assert.ok(deferred.deferredUntil >= clickedAt, 'The native defer click must persist its timestamp');
      assert.equal(deferred.latestVersion, newerVersion);
      report.cases.push({ id: 'native-defer-click-hides-and-persists', state: deferred });
      await reopen();
      const reopened = { resources: await resources(), state: await page.evaluate(() => JSON.parse(localStorage.getItem('midori_update_check_state_v1'))) };
      assert.equal(await page.evaluate(() => Boolean(document.querySelector('.update-toast'))), false,
        'The deferred update must remain hidden after reopening the new tab');
      assert.ok(toastResources.every(path => !reopened.resources.paths.includes(path)), 'Reopening a deferred notice must not import its toast again');
      assert.equal(reopened.state.deferredUntil, deferred.deferredUntil);
      assert.equal(reopened.state.latestVersion, newerVersion);
      report.cases.push({ id: 'defer-survives-reopening-without-toast-import', ...reopened });
    }
    report.passed = true;
    return report;
  } catch (error) {
    report.error = error.stack || String(error);
    throw error;
  } finally {
    try {
      if (observing) await session.network.stop();
      if (outputDir) writeFileSync(join(outputDir, 'update-toast.json'), `${JSON.stringify(report, null, 2)}\n`);
    } finally { await page?.close(); }
  }
}
