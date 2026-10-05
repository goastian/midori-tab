import assert from 'node:assert/strict';
import test from 'node:test';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import persistedState from 'pinia-plugin-persistedstate';

const localValues = new Map();
globalThis.localStorage = {
  getItem(key) { return localValues.get(key) ?? null; },
  setItem(key, value) { localValues.set(key, String(value)); },
  removeItem(key) { localValues.delete(key); },
};

const { migrateLegacyStores, createSafePersistencePlugin } = await import('../src/bootstrap/migrateLegacyStores.js');
const { flushDebounced } = await import('../src/services/StorageService.js');
const { default: useTabStore } = await import('../src/stores/useTabStore.js');
const { default: useThemeStore } = await import('../src/stores/useThemeStore.js');
const { default: useWidgetsStore } = await import('../src/stores/useWidgetsStore.js');
const { default: useSpacesStore } = await import('../src/stores/useSpacesStore.js');
const { default: useI18nStore } = await import('../src/stores/useI18nStore.js');
const { default: useSuggestionsStore } = await import('../src/stores/useSuggestionsStore.js');
const { default: useCatalogStore } = await import('../src/stores/useCatalogStore.js');

const asyncKeys = {
  themeStore: 'midori_theme_async_state_v1',
  widgetsStore: 'midori_widgets_async_state_v1',
  spacesStore: 'midori_spaces_async_state_v1',
};

function firefoxStorage({ failSet = false } = {}) {
  const values = new Map();
  const calls = [];
  globalThis.browser = {
    storage: {
      local: {
        async get(key) {
          calls.push(['get', arguments.length]);
          return { [key]: values.get(key) };
        },
        async set(payload) {
          calls.push(['set', arguments.length]);
          if (failSet) throw new Error('storage unavailable');
          for (const [key, value] of Object.entries(payload)) values.set(key, value);
        },
      },
    },
  };
  return { values, calls };
}

function installDom() {
  const body = { style: {}, className: '', classList: { add() {} } };
  const attributes = new Map([['data-theme', 'dark']]);
  globalThis.document = {
    documentElement: {
      getAttribute(key) { return attributes.get(key) ?? null; },
      setAttribute(key, value) { attributes.set(key, value); },
      removeAttribute(key) { attributes.delete(key); },
    },
    getElementsByTagName() { return [body]; },
  };
  globalThis.window = { dispatchEvent() {} };
  globalThis.CustomEvent = class { constructor(name, options) { this.name = name; this.detail = options?.detail; } };
}

function createStores(unmigrated) {
  const pinia = createPinia();
  pinia.use(createSafePersistencePlugin(persistedState, unmigrated));
  createApp({}).use(pinia);
  return {
    tab: useTabStore(pinia),
    theme: useThemeStore(pinia),
    widgets: useWidgetsStore(pinia),
    spaces: useSpacesStore(pinia),
    i18n: useI18nStore(pinia),
    suggestions: useSuggestionsStore(pinia),
  };
}

function legacyFixture() {
  return {
    tabStore: { theme: 'dark', density: 'compact', state: true, settingsSection: 'visual', background: { type: 'Solid', color: '#123456' } },
    themeStore: {
      activeThemeId: 'custom',
      marketplaceThemes: { forest: { id: 'forest', light: { '--color-bg': '#fff' }, dark: { '--color-bg': '#000' } } },
      customTheme: { id: 'custom', light: { '--color-bg': '#abc' }, dark: { '--color-bg': '#def' } },
    },
    widgetsStore: {
      enabled: { search: true, task: true, privacy: false },
      order: ['task', 'search', 'privacy'],
      installedMarketplaceWidgets: { 'todo-pack': { slug: 'todo-pack', builtinWidgetKey: 'todo', supported: true } },
    },
    spacesStore: {
      activeSpaceId: 'work', enabled: true,
      spaces: [{ id: 'work', name: 'Trabajo', background: { type: 'Solid', color: '#123456' } }],
    },
    i18nStore: { locale: 'es', messages: { es: { settings: { title: 'Configuración' } } } },
    suggestionsStore: { habits: [{ url: 'https://example.org', count: 2 }], enabled: true, dismissed: ['https://example.org'] },
    midori_notes: { __midoriStorageVersion: 1, value: 'Una nota antigua', updatedAt: 1 },
  };
}

function seedFixture() {
  localValues.clear();
  for (const [key, value] of Object.entries(legacyFixture())) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  installDom();
  delete globalThis.chrome;
}

async function flushStores(stores) {
  await Promise.all([
    flushDebounced(asyncKeys.themeStore, {
      marketplaceThemes: stores.theme.marketplaceThemes,
      customTheme: stores.theme.customTheme,
    }),
    flushDebounced(asyncKeys.widgetsStore, {
      installedMarketplaceWidgets: stores.widgets.installedMarketplaceWidgets,
    }),
    flushDebounced(asyncKeys.spacesStore, { spaces: stores.spaces.spaces }),
  ]);
}

test('Firefox migration verifies async data before compacting stores and survives reload', async () => {
  seedFixture();
  const extension = firefoxStorage();
  const legacyNotes = localStorage.getItem('midori_notes');
  const unmigrated = await migrateLegacyStores();
  assert.equal(unmigrated.size, 0);
  assert.deepEqual(await migrateLegacyStores(), new Set());
  assert.equal(extension.values.get(asyncKeys.themeStore).value.marketplaceThemes.forest.id, 'forest');
  assert.equal(extension.values.get(asyncKeys.widgetsStore).value.installedMarketplaceWidgets['todo-pack'].builtinWidgetKey, 'todo');
  assert.equal(extension.values.get(asyncKeys.spacesStore).value.spaces[0].id, 'work');
  assert.ok(extension.calls.every(([method, argumentCount]) => argumentCount === 1), 'Firefox storage uses promise calls');

  const first = createStores(unmigrated);
  assert.equal(first.tab.state, false);
  assert.equal(first.tab.theme, 'dark');
  assert.equal(first.theme.activeThemeId, 'custom');
  assert.equal(first.widgets.enabled.todo, true);
  assert.ok(first.widgets.order.includes('todo'));
  assert.equal(first.spaces.activeSpaceId, 'work');
  assert.equal(first.i18n.locale, 'es');
  await Promise.all([first.theme.hydrateAsyncState(), first.widgets.hydrateAsyncState(), first.spaces.hydrateAsyncState()]);
  assert.equal(first.theme.customTheme.light['--color-bg'], '#abc');
  assert.equal(first.widgets.installedMarketplaceWidgets['todo-pack'].supported, true);
  assert.equal(first.spaces.spaces[0].name, 'Trabajo');
  first.tab.state = true;
  for (const store of Object.values(first)) store.$persist();
  await flushStores(first);
  await new Promise((resolve) => setTimeout(resolve, 1100));

  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('i18nStore'))), ['locale']);
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('themeStore'))), ['activeThemeId']);
  assert.deepEqual(Object.keys(JSON.parse(localStorage.getItem('spacesStore'))).sort(), ['activeSpaceId', 'enabled']);
  assert.equal('state' in JSON.parse(localStorage.getItem('tabStore')), false);
  assert.equal('dismissed' in JSON.parse(localStorage.getItem('suggestionsStore')), false);
  assert.equal(localStorage.getItem('midori_notes'), legacyNotes);

  const second = createStores(await migrateLegacyStores());
  await Promise.all([second.theme.hydrateAsyncState(), second.widgets.hydrateAsyncState(), second.spaces.hydrateAsyncState()]);
  assert.equal(second.tab.state, false);
  assert.equal(second.theme.customTheme.dark['--color-bg'], '#def');
  assert.equal(second.widgets.installedMarketplaceWidgets['todo-pack'].builtinWidgetKey, 'todo');
  assert.equal(second.spaces.activeSpaceId, 'work');
  await flushStores(second);
});

test('Firefox storage failure keeps the complete legacy data for retry', async () => {
  seedFixture();
  firefoxStorage({ failSet: true });
  const warnings = [];
  const oldWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  let unmigrated;
  try {
    unmigrated = await migrateLegacyStores();
  } finally {
    console.warn = oldWarn;
  }
  assert.deepEqual(unmigrated, new Set(['themeStore', 'widgetsStore', 'spacesStore']));
  const stores = createStores(unmigrated);
  for (const key of ['theme', 'widgets', 'spaces']) stores[key].$persist();
  assert.equal(JSON.parse(localStorage.getItem('themeStore')).customTheme.light['--color-bg'], '#abc');
  assert.equal(JSON.parse(localStorage.getItem('widgetsStore')).installedMarketplaceWidgets['todo-pack'].slug, 'todo-pack');
  assert.equal(JSON.parse(localStorage.getItem('spacesStore')).spaces[0].name, 'Trabajo');
  assert.ok(warnings.length >= 3);

  const extension = firefoxStorage();
  assert.equal((await migrateLegacyStores()).size, 0);
  assert.equal(extension.values.get(asyncKeys.themeStore).value.customTheme.id, 'custom');
});

test('marketplace widget install resolves before apply and persists supported keys only', async () => {
  seedFixture();
  firefoxStorage();
  const stores = createStores(await migrateLegacyStores());
  const catalog = useCatalogStore();

  const supported = {
    slug: 'tasks-marketplace', type: 'widget', name: 'Tasks', version: '1.0.0',
    manifest: { payload: { midoriWidgetKey: 'todo' } },
  };
  const installed = await catalog.installAsset(supported, { apply: true });
  assert.equal(installed.builtinWidgetKey, 'todo');
  assert.equal(installed.supported, true);
  assert.equal(stores.widgets.enabled.todo, true);
  assert.equal(stores.widgets.installedMarketplaceWidgets[supported.slug].builtinWidgetKey, 'todo');

  const unsupported = {
    slug: 'unsupported-marketplace', type: 'widget', name: 'Unknown', version: '1.0.0',
    manifest: { payload: { midoriWidgetKey: 'not-a-widget' } },
  };
  const rejected = await catalog.installAsset(unsupported, { apply: true });
  assert.equal(rejected.builtinWidgetKey, null);
  assert.equal(rejected.supported, false);
  assert.equal(stores.widgets.enabled['not-a-widget'], undefined);
  assert.equal(JSON.stringify(catalog.installedAssets).includes('Promise'), false);

  await Promise.all([
    flushDebounced(asyncKeys.widgetsStore, { installedMarketplaceWidgets: stores.widgets.installedMarketplaceWidgets }),
    flushDebounced('midori_marketplace_installed_assets_v1', catalog.installedAssets),
  ]);

  const reloaded = createStores(new Set());
  const reloadedCatalog = useCatalogStore();
  await Promise.all([reloaded.widgets.hydrateAsyncState(), reloadedCatalog.hydrateAsyncState()]);
  assert.equal(reloadedCatalog.installedAssets[supported.slug].builtinWidgetKey, 'todo');
  assert.equal(reloadedCatalog.installedAssets[unsupported.slug].supported, false);
  assert.equal(reloaded.widgets.installedMarketplaceWidgets[supported.slug].builtinWidgetKey, 'todo');
  await Promise.all([
    flushDebounced(asyncKeys.widgetsStore, { installedMarketplaceWidgets: reloaded.widgets.installedMarketplaceWidgets }),
    flushDebounced('midori_marketplace_installed_assets_v1', reloadedCatalog.installedAssets),
  ]);
});
