import { defineStore } from 'pinia';
import MarketplaceApiClient from '../services/MarketplaceApiClient.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';
import useTabStore from './useTabStore.js';
import useThemeStore from './useThemeStore.js';
import useWidgetsStore from './useWidgetsStore.js';
import useSpacesStore from './useSpacesStore.js';
import {
  buildInstalledAssetRecord,
  buildMarketplaceThemeDefinition,
  buildMarketplaceWallpaperBackground,
  normalizeMarketplaceAsset,
} from '../utils/marketplaceAssets.js';

const EMPTY_META = {
  current_page: 1,
  last_page: 1,
  per_page: 12,
  total: 0,
};

function createEmptyTypeMap(factory) {
  return {
    theme: factory(),
    wallpaper: factory(),
    widget: factory(),
  };
}

const client = new MarketplaceApiClient();
const CATALOG_CACHE_KEY = 'midori_marketplace_catalog_cache_v2';
const INSTALLED_ASSETS_KEY = 'midori_marketplace_installed_assets_v1';
const CATALOG_CACHE_TTL_MS = 15 * 60 * 1000;
const CATALOG_CACHE_MAX_ITEMS_PER_TYPE = 24;

function toPlainObject(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

function readLegacyCatalogState() {
  try {
    const raw = JSON.parse(localStorage.getItem('catalogStore') || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const useCatalogStore = defineStore('catalogStore', {
  state: () => ({
    catalogByType: createEmptyTypeMap(() => []),
    metaByType: createEmptyTypeMap(() => ({ ...EMPTY_META })),
    statusByType: createEmptyTypeMap(() => 'idle'),
    errorByType: createEmptyTypeMap(() => ''),
    queryByType: createEmptyTypeMap(() => ''),
    installedAssets: {},
  }),

  getters: {
    isConfigured() {
      return client.isConfigured();
    },

    itemsForType(state) {
      return type => state.catalogByType[type] || [];
    },

    statusForType(state) {
      return type => state.statusByType[type] || 'idle';
    },

    errorForType(state) {
      return type => state.errorByType[type] || '';
    },

    isInstalled(state) {
      return slug => Boolean(state.installedAssets[slug]);
    },

    installedRecord(state) {
      return slug => state.installedAssets[slug] || null;
    },
  },

  actions: {
    async ensureCatalog(type, options = {}) {
      const normalizedType = type || 'theme';
      const normalizedQuery = String(options.q || '').trim();
      const force = Boolean(options.force);

      if (!this.isConfigured) {
        this.statusByType[normalizedType] = 'unconfigured';
        this.errorByType[normalizedType] = 'Marketplace API unavailable.';
        return [];
      }

      if (
        !force
        && this.catalogByType[normalizedType].length
        && this.queryByType[normalizedType] === normalizedQuery
      ) {
        return this.catalogByType[normalizedType];
      }

      if (!force) {
        const cachedItems = await this.loadCachedCatalog(normalizedType, normalizedQuery);
        if (cachedItems.length) {
          return cachedItems;
        }
      }

      return this.fetchCatalog(normalizedType, options);
    },

    async loadCachedCatalog(type, query) {
      const cache = await getJson(CATALOG_CACHE_KEY, {});
      const entry = cache?.[type];
      if (!entry || entry.query !== query || Date.now() - entry.timestamp > CATALOG_CACHE_TTL_MS) {
        return [];
      }

      const items = Array.isArray(entry.items)
        ? entry.items.slice(0, CATALOG_CACHE_MAX_ITEMS_PER_TYPE)
        : [];
      this.catalogByType[type] = items;
      this.metaByType[type] = {
        ...EMPTY_META,
        ...(entry.meta || {}),
      };
      this.queryByType[type] = query;
      this.statusByType[type] = 'ready';
      return items;
    },

    async saveCachedCatalog(type, query, items, meta) {
      const cache = toPlainObject(await getJson(CATALOG_CACHE_KEY, {}), {});
      cache[type] = {
        timestamp: Date.now(),
        query,
        items: toPlainObject(items.slice(0, CATALOG_CACHE_MAX_ITEMS_PER_TYPE), []),
        meta: toPlainObject(meta, { ...EMPTY_META }),
      };
      setJsonDebounced(CATALOG_CACHE_KEY, cache, { delayMs: 800, maxBytes: 350_000 });
    },

    async fetchCatalog(type, options = {}) {
      const normalizedType = type || 'theme';
      this.statusByType[normalizedType] = 'loading';
      this.errorByType[normalizedType] = '';

      try {
        const response = await client.getCatalog({
          type: normalizedType,
          q: options.q,
          page: options.page || 1,
          per_page: options.perPage || 12,
        });

        const items = Array.isArray(response?.data)
          ? response.data.map(item => normalizeMarketplaceAsset(item, { apiBaseUrl: client.baseUrl }))
          : [];

        this.catalogByType[normalizedType] = items;
        this.metaByType[normalizedType] = {
          ...EMPTY_META,
          ...(response?.meta || {}),
        };
        this.queryByType[normalizedType] = String(options.q || '').trim();
        this.statusByType[normalizedType] = 'ready';
        this.saveCachedCatalog(normalizedType, this.queryByType[normalizedType], items, this.metaByType[normalizedType]);

        return items;
      } catch (error) {
        this.statusByType[normalizedType] = 'error';
        this.errorByType[normalizedType] = error?.message || 'Marketplace request failed.';
        return [];
      }
    },

    async installAsset(asset, options = {}) {
      if (!asset?.slug || !asset?.type) return null;

      let installedRecord = null;

      if (asset.type === 'theme') {
        const themeStore = useThemeStore();
        const installedTheme = buildMarketplaceThemeDefinition(asset);
        if (!installedTheme) return null;

        themeStore.installMarketplaceTheme(asset);
        installedRecord = buildInstalledAssetRecord(asset, {
          localId: installedTheme.id,
        });

        if (options.apply) {
          themeStore.setTheme(installedTheme.id);
        }
      }

      if (asset.type === 'wallpaper') {
        const background = buildMarketplaceWallpaperBackground(asset);
        if (!background) return null;

        installedRecord = buildInstalledAssetRecord(asset, {
          background,
        });

        if (options.apply) {
          const spacesStore = useSpacesStore();
          const tabStore = useTabStore();
          if (spacesStore.enabled) {
            spacesStore.setActiveSpaceBackground(background);
          } else {
            tabStore.changeBackground(background);
          }
        }
      }

      if (asset.type === 'widget') {
        const widgetsStore = useWidgetsStore();
        const builtinWidgetKey = widgetsStore.installMarketplaceWidget(asset);

        installedRecord = buildInstalledAssetRecord(asset, {
          builtinWidgetKey,
          supported: Boolean(builtinWidgetKey),
        });

        if (options.apply && builtinWidgetKey) {
          widgetsStore.enableInstalledMarketplaceWidget(asset.slug);
        }
      }

      if (!installedRecord) return null;

      this.installedAssets[asset.slug] = installedRecord;
      this.persistAsyncState();
      return installedRecord;
    },

    async applyInstalledAsset(asset) {
      if (!asset?.slug) return null;

      if (!this.installedAssets[asset.slug]) {
        return this.installAsset(asset, { apply: true });
      }

      const installedRecord = this.installedAssets[asset.slug];

      if (installedRecord.type === 'theme' && installedRecord.localId) {
        const themeStore = useThemeStore();
        themeStore.setTheme(installedRecord.localId);
      }

      if (installedRecord.type === 'wallpaper' && installedRecord.background) {
        const spacesStore = useSpacesStore();
        const tabStore = useTabStore();
        if (spacesStore.enabled) {
          spacesStore.setActiveSpaceBackground(installedRecord.background);
        } else {
          tabStore.changeBackground(installedRecord.background);
        }
      }

      if (installedRecord.type === 'widget' && installedRecord.builtinWidgetKey) {
        const widgetsStore = useWidgetsStore();
        widgetsStore.enableInstalledMarketplaceWidget(asset.slug);
      }

      return installedRecord;
    },

    async hydrateAsyncState() {
      const legacy = readLegacyCatalogState();
      const installedAssets = await getJson(INSTALLED_ASSETS_KEY, null);
      this.installedAssets = toPlainObject(
        installedAssets || legacy.installedAssets || {},
        {},
      );
      this.persistAsyncState();
    },

    persistAsyncState() {
      setJsonDebounced(INSTALLED_ASSETS_KEY, toPlainObject(this.installedAssets, {}), {
        delayMs: 800,
        maxBytes: 250_000,
      });
    },
  },
});

export default useCatalogStore;
