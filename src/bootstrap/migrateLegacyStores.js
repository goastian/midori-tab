import { getJson, quotaSafeSet, verifyJsonStored } from '../services/StorageService.js';

const MIGRATIONS = [
  {
    store: 'themeStore',
    target: 'midori_theme_async_state_v1',
    fields: ['marketplaceThemes', 'customTheme'],
    maxBytes: 250_000,
    merge(legacy, current) {
      return {
        marketplaceThemes: {
          ...(legacy.marketplaceThemes || {}),
          ...(current?.marketplaceThemes || {}),
        },
        customTheme: current?.customTheme || legacy.customTheme,
      };
    },
  },
  {
    store: 'widgetsStore',
    target: 'midori_widgets_async_state_v1',
    fields: ['installedMarketplaceWidgets'],
    maxBytes: 120_000,
    merge(legacy, current) {
      return {
        installedMarketplaceWidgets: {
          ...(legacy.installedMarketplaceWidgets || {}),
          ...(current?.installedMarketplaceWidgets || {}),
        },
      };
    },
  },
  {
    store: 'spacesStore',
    target: 'midori_spaces_async_state_v1',
    fields: ['spaces'],
    maxBytes: 250_000,
    merge(legacy, current) {
      const spaces = new Map();
      for (const space of legacy.spaces || []) {
        if (space?.id) spaces.set(space.id, space);
      }
      for (const space of current?.spaces || []) {
        if (space?.id) spaces.set(space.id, space);
      }
      return { spaces: [...spaces.values()] };
    },
  },
];

function readLegacyStore(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

export async function migrateLegacyStores() {
  const unmigrated = new Set();

  for (const migration of MIGRATIONS) {
    const legacy = readLegacyStore(migration.store);
    if (!legacy || !migration.fields.some((field) => Object.hasOwn(legacy, field))) continue;

    try {
      const current = await getJson(migration.target, null);
      const value = migration.merge(legacy, current);
      await quotaSafeSet(migration.target, value, { maxBytes: migration.maxBytes });
      if (!await verifyJsonStored(migration.target, value)) {
        throw new Error(`Migration readback failed: ${migration.target}`);
      }
    } catch (error) {
      unmigrated.add(migration.store);
      console.warn(`[Midori] Preserving legacy ${migration.store} until migration succeeds`, error);
    }
  }

  return unmigrated;
}

export function createSafePersistencePlugin(persistedState, unmigrated) {
  return (context) => {
    if (!unmigrated.has(context.store.$id)) return persistedState(context);
    return persistedState({
      ...context,
      options: {
        ...context.options,
        persist: {
          storage: localStorage,
          afterHydrate: context.options.persist?.afterHydrate,
        },
      },
    });
  };
}
