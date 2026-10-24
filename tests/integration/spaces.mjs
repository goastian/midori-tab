import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finishResourceObservation } from '../../scripts/critical-requests.mjs';

export async function runSpacesIntegration(session, { outputDir } = {}) {
  const customSpace = { id: 'integration-space', name: 'Integration workspace', icon: 'F', color: '#663399',
    background: { type: 'Gradient', default: true, class: 'bg-purple' } };
  let page;
  try {
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await page.evaluate(async space => {
      const api = globalThis.browser || globalThis.chrome;
      const payload = { __midoriStorageVersion: 1, updatedAt: Date.now(), value: { spaces: [space] } };
      await api.storage.local.set({ midori_spaces_async_state_v1: payload });
      localStorage.setItem('midori_spaces_async_state_v1', JSON.stringify(payload));
      localStorage.setItem('spacesStore', JSON.stringify({ enabled: false, activeSpaceId: space.id }));
      const settings = JSON.parse(localStorage.getItem('tabStore') || '{}');
      localStorage.setItem('tabStore', JSON.stringify({ ...settings, showAds: false, widgetsEnabled: false, showSpeedDials: false }));
    }, customSpace);
    await page.close();
    page = await session.context.newPage();
    await session.network.start();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])
      && Number.isFinite(window.__midoriPerf?.marks?.['idle-complete']));
    const disabled = await page.evaluate(() => ({
      switcher: Boolean(document.querySelector('.space-switcher-bar')),
      storeCreated: document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.has('spacesStore'),
    }));
    disabled.resources = await finishResourceObservation(session, page);
    assert.equal(disabled.switcher, false);
    assert.equal(disabled.storeCreated, false, 'Disabled spaces must not instantiate or hydrate their store at startup');
    assert.ok(!disabled.resources.paths.some(url => /(?:SpaceSwitcher|useSpacesStore)[.-]/.test(url)), 'Disabled spaces must not load their chunks');

    await page.click('.dashboard-toolbar .top-actions .top-btn:last-child');
    await page.waitForFunction(() => document.querySelector('.open-start-page'));
    await page.click('.open-start-page');
    await page.waitForFunction(() => document.querySelector('.panel-tabs'));
    await page.click('.panel-tab:first-child');
    await page.waitForFunction(() => document.querySelector('.panel-content [role="switch"]'));
    await page.click('.panel-content [role="switch"]');
    await page.waitForFunction(() => document.querySelector('.space-switcher-bar .pill-label')?.textContent === 'Integration workspace');
    assert.equal(await page.evaluate(() => document.querySelector('.space-switcher-bar .active .pill-label')?.textContent), customSpace.name);
    await page.click('.panel-content [role="switch"]');
    await page.waitForFunction(() => !document.querySelector('.space-switcher-bar'));
    await page.click('.panel-content [role="switch"]');
    await page.waitForFunction(() => document.querySelector('.space-switcher-bar .pill-label')?.textContent === 'Integration workspace');
    await page.click('.panel-close');
    await page.waitForFunction(() => !document.querySelector('.panel-overlay'));
    const enabled = await page.evaluate(() => ({
      preference: JSON.parse(localStorage.getItem('spacesStore')),
      labels: [...document.querySelectorAll('.space-switcher-bar .pill-label')].map(element => element.textContent),
      resources: performance.getEntriesByType('resource').map(entry => entry.name),
    }));
    assert.equal(enabled.preference.enabled, true);
    assert.deepEqual(enabled.labels, [customSpace.name]);
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      await page.screenshot({ path: join(outputDir, 'spaces-enabled.png') });
    }
    await page.close();
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    const reopened = await page.evaluate(() => ({
      labels: [...document.querySelectorAll('.space-switcher-bar .pill-label')].map(element => element.textContent),
      hydrated: document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('spacesStore')?.hydrated,
      active: document.querySelector('.space-switcher-bar .active .pill-label')?.textContent,
    }));
    assert.equal(reopened.hydrated, true, 'Enabled spaces must hydrate before full interaction readiness');
    assert.deepEqual(reopened.labels, [customSpace.name]);
    assert.equal(reopened.active, customSpace.name);
    await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('spacesStore').resetSpaces());
    await page.waitForFunction(() => !document.querySelector('.space-switcher-bar') && JSON.parse(localStorage.getItem('spacesStore')).enabled === false);
    const reset = await page.evaluate(() => {
      const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('spacesStore');
      return { enabled: store.enabled, activeSpaceId: store.activeSpaceId, ids: store.spaces.map(space => space.id) };
    });
    assert.deepEqual(reset, { enabled: false, activeSpaceId: 'personal', ids: ['personal', 'work', 'study'] });
    const report = { passed: true, settingsToggle: 'native clicks on real settings switches',
      reset: { trigger: 'production store resetSpaces action in the running extension', ...reset }, disabled, enabled, reopened };
    if (outputDir) writeFileSync(join(outputDir, 'spaces-integration.json'), `${JSON.stringify(report, null, 2)}\n`);
    return report;
  } finally { await page?.close(); }
}
