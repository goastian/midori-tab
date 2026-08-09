import useSpacesStore from '../stores/useSpacesStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';
import perfMarks from './perfMarks.js';

function scheduleIdle(task) {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(task, { timeout: 1500 });
    return;
  }
  setTimeout(task, 500);
}

/**
 * Hydrates only the stores required for the visible dashboard on boot.
 * The catalog store (marketplace) is intentionally excluded: its chunk is
 * imported lazily by MarketplaceBrowser/ThemePicker when the user opens them,
 * keeping it out of the eager preload path of dist/index.html.
 */
export function hydrateAsyncStores(pinia) {
  scheduleIdle(async () => {
    const themeStore = useThemeStore(pinia);
    const widgetsStore = useWidgetsStore(pinia);
    const spacesStore = useSpacesStore(pinia);

    await Promise.all([
      themeStore.hydrateAsyncState(),
      widgetsStore.hydrateAsyncState(),
      spacesStore.hydrateAsyncState(),
    ]);

    themeStore.$subscribe(() => themeStore.persistAsyncState(), { detached: true });
    widgetsStore.$subscribe(() => widgetsStore.persistAsyncState(), { detached: true });
    spacesStore.$subscribe(() => spacesStore.persistAsyncState(), { detached: true });

    perfMarks.mark('idle-complete');

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('midori:async-stores-hydrated', {
        detail: { stores: ['theme', 'widgets', 'spaces'] },
      }));
    }
  });
}