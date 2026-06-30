import useCatalogStore from '../stores/useCatalogStore.js';
import useSpacesStore from '../stores/useSpacesStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';

function scheduleIdle(task) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 1500 });
    return;
  }
  setTimeout(task, 500);
}

export function hydrateAsyncStores(pinia) {
  scheduleIdle(async () => {
    const themeStore = useThemeStore(pinia);
    const widgetsStore = useWidgetsStore(pinia);
    const catalogStore = useCatalogStore(pinia);
    const spacesStore = useSpacesStore(pinia);

    await Promise.all([
      themeStore.hydrateAsyncState(),
      widgetsStore.hydrateAsyncState(),
      catalogStore.hydrateAsyncState(),
      spacesStore.hydrateAsyncState(),
    ]);

    themeStore.$subscribe(() => themeStore.persistAsyncState(), { detached: true });
    widgetsStore.$subscribe(() => widgetsStore.persistAsyncState(), { detached: true });
    catalogStore.$subscribe(() => catalogStore.persistAsyncState(), { detached: true });
    spacesStore.$subscribe(() => spacesStore.persistAsyncState(), { detached: true });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('midori:async-stores-hydrated', {
        detail: { stores: ['theme', 'widgets', 'catalog', 'spaces'] },
      }));
    }
  });
}
