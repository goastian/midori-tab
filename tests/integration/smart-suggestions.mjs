import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finishResourceObservation } from '../../scripts/critical-requests.mjs';

export async function runSmartSuggestionsIntegration(session, { outputDir } = {}) {
  const writer = await session.context.newPage();
  const page = await session.context.newPage();
  let previous;
  try {
    await writer.goto(session.url);
    previous = await writer.evaluate(() => {
      const value = localStorage.getItem('suggestionsStore');
      localStorage.removeItem('suggestionsStore');
      return value;
    });
    await session.network.start();
    await page.goto(`${session.url}?midori-perf=1`);
    await page.waitForFunction(() => window.__midoriPerf?.isComplete, null, { timeout: 20_000 });
    const initialResources = await finishResourceObservation(session, page);
    assert.ok(!initialResources.paths.some(path => /SmartSuggestions.*\.(?:js|css)$/.test(path)), 'The default empty habits state must not request the suggestions feature');
    assert.equal(await page.evaluate(() => document.querySelectorAll('.smart-suggestions').length), 0);

    await writer.evaluate(() => {
      const now = new Date();
      localStorage.setItem('suggestionsStore', JSON.stringify({ enabled: true, habits: [{
        url: 'https://example.org/midori-integration', title: 'Integration suggestion',
        hour: now.getHours(), dayOfWeek: now.getDay(), count: 3, lastVisit: Date.now(),
      }] }));
    });
    await page.waitForFunction(() => document.querySelector('.smart-suggestions .suggestion-card'), null, { timeout: 20_000 });
    const card = await page.evaluate(() => ({
      title: document.querySelector('.smart-suggestions .suggestion-title').textContent,
      href: document.querySelector('.smart-suggestions .suggestion-card').href,
    }));
    assert.equal(card.title, 'Integration suggestion');
    assert.equal(card.href, 'https://example.org/midori-integration');
    await page.click('.smart-suggestions .dismiss-btn');
    await page.waitForFunction(() => !document.querySelector('.smart-suggestions'));

    await page.goto(session.url);
    await page.waitForFunction(() => document.querySelector('.smart-suggestions .suggestion-card'), null, { timeout: 20_000 });
    await writer.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('suggestionsStore'));
      localStorage.setItem('suggestionsStore', JSON.stringify({ ...value, enabled: false }));
    });
    await page.waitForFunction(() => !document.querySelector('.smart-suggestions'));
    await writer.evaluate(() => {
      const value = JSON.parse(localStorage.getItem('suggestionsStore'));
      localStorage.setItem('suggestionsStore', JSON.stringify({ ...value, enabled: true }));
    });
    await page.waitForFunction(() => document.querySelector('.smart-suggestions .suggestion-card'), null, { timeout: 20_000 });
    const result = { passed: true, emptyStateRequestedFeature: false, initialResources,
      cases: ['empty-default-no-feature-request', 'native-storage-event-loads-saved-habit', 'native-dismiss', 'reload-restores-persisted-habit', 'storage-disable-and-enable'], card };
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(join(outputDir, 'smart-suggestions.json'), `${JSON.stringify(result, null, 2)}\n`);
    }
    return result;
  } finally {
    await page.close();
    if (previous !== undefined) await writer.evaluate(value => {
      if (value === null) localStorage.removeItem('suggestionsStore');
      else localStorage.setItem('suggestionsStore', value);
    }, previous);
    await writer.close();
  }
}
