import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const WIDGET_COLUMNS = width => (width >= 1152 ? 4 : width >= 952 ? 3 : width >= 712 ? 2 : 1);
const BOARD_MAX_WIDTH = columns => (columns >= 3 ? 1060 : columns === 2 ? 940 : null);

function observeLayout() {
  const evidence = window.__resizeLayout = { frames: [], visibility: [] };
  let resizedAt = -Infinity;
  const tracks = element => (element ? getComputedStyle(element).gridTemplateColumns.split(' ').length : 0);
  document.addEventListener('visibilitychange', () => evidence.visibility.push(document.visibilityState));
  addEventListener('resize', () => { resizedAt = performance.now(); });
  function sample(phase) {
    const board = document.querySelector('.widget-board');
    const widgets = document.querySelector('.dash-widgets');
    const dials = document.querySelector('.speed-dial-grid');
    if (!board || !widgets || !dials || evidence.frames.length > 4000) return;
    const dialStyle = getComputedStyle(dials);
    evidence.frames.push({
      phase,
      sinceResize: performance.now() - resizedAt,
      width: innerWidth,
      hidden: document.visibilityState === 'hidden',
      resizing: document.documentElement.hasAttribute('data-resizing'),
      widgetColumns: tracks(widgets),
      boardMaxWidth: getComputedStyle(board).maxWidth,
      dialColumns: tracks(dials),
      dialWidth: dials.getBoundingClientRect().width,
      dialGap: parseFloat(dialStyle.columnGap),
      dialMin: parseFloat(dialStyle.getPropertyValue('--dial-min')),
      dialConfigured: Number(dialStyle.getPropertyValue('--dial-columns')),
    });
  }
  // The observer runs after layout and after every handler the page registered
  // earlier, so it sees the state about to be painted.
  new ResizeObserver(() => sample('settled')).observe(document.documentElement);
  (function frame() { sample('frame'); requestAnimationFrame(frame); })();
}

function validate(frames, label) {
  const settled = frames.filter(frame => frame.phase === 'settled' && !frame.hidden);
  assert.ok(settled.length >= 4, `${label}: record the state before each resize is painted`);
  for (const frame of frames.filter(item => !item.hidden && (item.phase === 'settled' || item.sinceResize > 50))) {
    const where = `${label} at ${frame.width}px (${frame.phase})`;
    assert.equal(frame.widgetColumns, WIDGET_COLUMNS(frame.width), `${where}: widget columns follow the viewport`);
    const expected = BOARD_MAX_WIDTH(frame.widgetColumns);
    if (expected) assert.equal(frame.boardMaxWidth, `${expected}px`, `${where}: board width must not animate through intermediate values`);
  }
  for (const frame of settled) {
    const where = `${label} at ${frame.width}px`;
    const columnsFor = delta => Math.min(frame.dialConfigured,
      Math.floor((frame.dialWidth + delta + frame.dialGap) / (frame.dialMin + frame.dialGap)));
    const allowed = new Set([columnsFor(0), columnsFor(1), columnsFor(-1)]);
    assert.ok(allowed.has(frame.dialColumns), `${where}: ${frame.dialColumns} dial columns for ${frame.dialWidth}px, expected ${[...allowed]}`);
  }
}

export async function runResizeLayoutIntegration(session, { outputDir } = {}) {
  if (outputDir) mkdirSync(outputDir, { recursive: true });
  let page = await session.context.newPage();
  const report = { passed: false, steps: [] };
  try {
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready']));
    await page.evaluate(() => {
      localStorage.setItem('tabStore', JSON.stringify({ theme: 'dark', autoTheme: false, density: 'comfortable',
        background: { type: 'Gradient', default: true, class: 'bg-green' }, showAds: false, showSpeedDials: true,
        speedDialSize: 'tiny', speedDialColumns: 7, speedDialLimit: 8, showAddSpeedDialButton: true,
        widgetsEnabled: true, widgetColumns: 4, openLink: 'Self Tab' }));
      localStorage.setItem('widgetsStore', JSON.stringify({ enabled: { search: true, privacy: true, weather: true, notes: true, todo: true },
        order: ['search', 'privacy', 'weather', 'notes', 'todo'] }));
    });
    await page.close();
    page = await session.context.newPage();
    await page.goto(session.url);
    await page.waitForFunction(() => Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])
      && document.querySelector('.widget-board') && document.querySelector('.speed-dial-grid'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 600)));
    await page.evaluate(observeLayout);
    const sizes = [[1920, 1000], [1277, 900], [900, 700], [420, 700], [1302, 662]];
    for (const [width, height] of sizes) {
      const rect = await page.setWindowRect({ width, height });
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 450)));
      report.steps.push({ requested: [width, height], outer: [rect.width, rect.height] });
    }
    for (const command of ['WebDriver:MinimizeWindow', 'WebDriver:MaximizeWindow']) {
      await page.windowCommand(command);
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 700)));
      report.steps.push({ command });
    }
    const evidence = await page.evaluate(() => window.__resizeLayout);
    const visible = evidence.frames.filter(frame => !frame.hidden);
    validate(evidence.frames, 'resize and restore');
    assert.ok(new Set(visible.map(frame => frame.widgetColumns)).size >= 3, 'The test must exercise several responsive widget layouts');
    assert.ok(visible.some(frame => frame.resizing), 'Transitions must be suppressed while the viewport changes');
    assert.equal(visible.at(-1).resizing, false, 'Transitions must return after the viewport settles');
    assert.ok(evidence.visibility.includes('hidden') && evidence.visibility.at(-1) === 'visible',
      'The real browser window must be minimized and restored');
    report.frames = visible.length;
    report.columns = [...new Set(visible.map(frame => frame.widgetColumns))];
    if (outputDir) await page.screenshot({ path: join(outputDir, 'after-restore.png') });
    report.passed = true;
    return report;
  } finally {
    if (outputDir) writeFileSync(join(outputDir, 'resize-layout.json'), `${JSON.stringify(report, null, 2)}\n`);
    await page.close();
  }
}
