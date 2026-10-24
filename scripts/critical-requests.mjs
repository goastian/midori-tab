import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';

export const BUILD_BUDGETS = { jsBytes: 165 * 1024, cssBytes: 44 * 1024 };
export const RESOURCE_GRAPH_BASELINE = {
  artifactSha256: '601197235b97a362ab9edb243efddc63421730339f8570c550a802df6c52ed39',
  sourceReport: 'artifacts/a2/baseline-measured/firefox-default-cold-smoke.json',
  measuredAt: '2026-10-24', engine: 'firefox', scenario: 'default', cacheState: 'cold',
  interaction: { jsBytes: 264018, cssBytes: 51877 },
  capture: { jsBytes: 277657, cssBytes: 53658 },
  description: 'Frozen A1 package observed in Midori Gecko before A2. These are regression ceilings, not the 1.1 delivery targets. A2 interaction also waits for local bookmarks; the complete capture prevents moving startup cost past that marker.',
};
const WIDGET_FEATURES = {
  WeatherWidget: 'weather', WeatherService: 'weather', CurrencyWidget: 'currency', CurrencyService: 'currency',
  RssWidget: 'rss', AstianRssWidget: 'rss', RssWidgetService: 'rss', CalendarWidget: 'calendar',
  NotesWidget: 'notes', TodoWidget: 'todo', BrowserBookmarksWidget: 'browserBookmarks', PrivacyWidget: 'privacy',
};
const OPTIONAL_MODULES = [
  /\/src\/components\/(?:MarketplaceBrowser|SettingsModal|WidgetPicker)\.vue(?:\?|$)/,
  /\/src\/components\/(?:settings|rewards)\//,
  /\/src\/components\/dashboard\/(?:MarketplaceSheet|QuickSettingsPanel)\.vue(?:\?|$)/,
  /\/src\/services\/(?:MarketplaceApiClient|RewardsInterestService)\.js$/,
];
const OPTIONAL_FILES = /^\/assets\/(?:Marketplace|Settings|WidgetPicker|Rewards|QuickSettings)/;
const LAB_RESOURCE = /^\/assets\/labVisualStability-[^/]+\.js$/;
const CODE_RESOURCE = /\.(?:[cm]?js|css)$/;

function localPath(value, documentUrl) {
  const document = new URL(documentUrl);
  const url = new URL(value, document);
  if (url.protocol !== document.protocol || url.host !== document.host || !CODE_RESOURCE.test(url.pathname)) return null;
  const path = decodeURIComponent(url.pathname);
  if (path.includes('\\') || path.split('/').includes('..')) throw new Error(`Invalid resource path: ${path}`);
  return path;
}

export function htmlResources(html) {
  return [...html.matchAll(/<(script|link)\b[^>]*>/gi)].flatMap(([tag, type]) => {
    const value = tag.match(/\b(?:src|href)=["']([^"']+)["']/i)?.[1];
    if (!value) return [];
    const rel = tag.match(/\brel=["']([^"']+)["']/i)?.[1] || '';
    return [{ url: value, kind: type.toLowerCase() === 'script' ? 'script' : rel.toLowerCase(), startTime: 0 }];
  });
}

export function readBundleGraph(directory) {
  const path = join(directory, 'bundle-analysis.rollup.json');
  if (!existsSync(path)) throw new Error('Missing bundle-analysis.rollup.json; build with ANALYZE_BUNDLE=1');
  const records = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(records) || !records.some(record => record.isEntry)) throw new Error('Invalid Rollup dependency graph: no entry chunk');
  return new Map(records.map(record => [`/${record.fileName}`, record]));
}

export async function finishResourceObservation(session, page) {
  const timing = await page.evaluate(() => ({ origin: location.href, start: performance.timeOrigin,
    resources: performance.getEntriesByType('resource').map(entry => ({ url: entry.name, startTime: entry.startTime })) }));
  await session.network.stop();
  const native = await session.network.resources?.() || [];
  const resources = [...native.filter(record => record.scope !== 'background' && record.startEpochMs >= timing.start - 1), ...timing.resources];
  const paths = [...new Set(resources.map(record => localPath(record.url, timing.origin)).filter(Boolean))].sort();
  if (!paths.includes('/index.js')) throw new Error('Resource observation did not see the application entry; an empty resource list cannot prove optional chunks stayed unloaded');
  return { paths, source: native.length ? session.network.coverage.localExtensionResources : 'resource-timing',
    nativeObservationCount: native.length, resourceTimingCount: timing.resources.length };
}

export function criticalResourceViolations(resources, documentUrl, { laboratory = false, bundleGraph,
  enabledWidgets = { privacy: true }, spacesEnabled = false } = {}) {
  const violations = new Set();
  const unrequested = value => {
    const name = value.split('/').at(-1).split(/[.\-?]/)[0];
    return (Object.hasOwn(WIDGET_FEATURES, name) && !enabledWidgets[WIDGET_FEATURES[name]])
      || (!spacesEnabled && ['SpaceSwitcher', 'SpacesManager', 'useSpacesStore'].includes(name));
  };
  for (const resource of resources) {
    const path = localPath(typeof resource === 'string' ? resource : resource.path || resource.url || resource.name, documentUrl);
    if (!path || (laboratory && LAB_RESOURCE.test(path))) continue;
    if (OPTIONAL_FILES.test(path) || unrequested(path)) violations.add(path);
    for (const module of bundleGraph?.get(path)?.modules || []) {
      const normalized = `/${module.replaceAll('\\', '/').replace(/^\//, '')}`;
      if (OPTIONAL_MODULES.some(pattern => pattern.test(normalized)) || unrequested(normalized)) violations.add(`${path}: ${normalized.replace(/^.*\/src\//, 'src/')}`);
    }
  }
  return [...violations].sort();
}

export function resourceGraph({ directory, documentUrl, resources, navigationStart = 0, cutoff = Infinity,
  laboratory = false, bundleGraph = readBundleGraph(directory), source = 'unknown', enabledWidgets, spacesEnabled }) {
  const files = new Map();
  const root = resolve(directory);
  function add(path, time, kind, inferred = false, parent = null) {
    if (files.has(path)) {
      const file = files.get(path);
      file.firstRequestMs = Math.min(file.firstRequestMs, time);
      if (!inferred) file.observations += 1;
      if (!file.kinds.includes(kind)) file.kinds.push(kind);
      if (parent && !file.parents.includes(parent)) file.parents.push(parent);
      return;
    }
    const absolute = resolve(root, `.${path}`);
    if (!absolute.startsWith(`${root}${sep}`)) throw new Error(`Resource escaped extension directory: ${path}`);
    const bytes = existsSync(absolute) ? statSync(absolute).size : null;
    const chunk = bundleGraph.get(path);
    const file = { path, bytes, type: path.endsWith('.css') ? 'css' : 'js', firstRequestMs: time,
      observations: inferred ? 0 : 1, kinds: [kind], parents: parent ? [parent] : [],
      laboratory: laboratory && LAB_RESOURCE.test(path), missing: bytes === null };
    files.set(path, file);
    for (const dependency of [...(chunk?.imports || []), ...(chunk?.css || [])]) {
      const dependencyPath = localPath(`/${dependency.replace(/^\//, '')}`, documentUrl);
      if (dependencyPath) add(dependencyPath, time, 'static-dependency', true, path);
    }
  }
  for (const resource of resources) {
    const raw = typeof resource === 'string' ? { url: resource, startTime: 0 } : resource;
    const path = localPath(raw.url || raw.name || raw.path, documentUrl);
    const time = Number.isFinite(raw.startEpochMs) ? raw.startEpochMs - navigationStart : raw.startTime;
    if (!path || !Number.isFinite(time) || time < -1 || time > cutoff) continue;
    add(path, Math.max(0, time), raw.kind || raw.initiatorType || 'loader-request');
  }
  const entries = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
  const totals = entries.reduce((acc, file) => {
    if (file.laboratory) acc.laboratoryBytes += file.bytes || 0;
    else acc[`${file.type}Bytes`] += file.bytes || 0;
    return acc;
  }, { jsBytes: 0, cssBytes: 0, laboratoryBytes: 0 });
  return { source, cutoffMs: Number.isFinite(cutoff) ? cutoff : null, ...totals,
    uniqueResources: entries.length, observedResources: entries.filter(file => file.observations).length,
    duplicateObservations: entries.reduce((total, file) => total + Math.max(0, file.observations - 1), 0),
    inferredStaticDependencies: entries.filter(file => !file.observations).map(file => file.path),
    missingResources: entries.filter(file => file.missing).map(file => file.path),
    violations: criticalResourceViolations(entries, documentUrl, { laboratory, bundleGraph, enabledWidgets, spacesEnabled }), files: entries };
}
