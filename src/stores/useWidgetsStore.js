import { defineStore } from 'pinia';
import { resolveBuiltinWidgetKey } from '../utils/marketplaceAssets.js';

/** Default widget order */
const DEFAULT_ORDER = ['search', 'bookmarks', 'weather', 'currency', 'browserBookmarks', 'privacy', 'rss', 'calendar', 'notes', 'todo'];

/**
 * Store that manages which widgets are enabled and their display order.
 * Supports drag & drop reordering via the `order` array.
 */
const useWidgetsStore = defineStore('widgetsStore', {
  state: () => ({
    enabled: {
      search: true,
      bookmarks: true,
      weather: false,
      currency: false,
      browserBookmarks: false,
      privacy: true,
      rss: false,
      calendar: false,
      notes: false,
      todo: false,
    },
    /** Ordered list of widget keys — determines render order on the page */
    order: [...DEFAULT_ORDER],
    installedMarketplaceWidgets: {},
  }),

  getters: {
    /** Returns only the enabled widgets in their configured order. */
    activeWidgets(state) {
      return state.order.filter(key => state.enabled[key]);
    },
  },

  actions: {
    /** Toggles a widget on/off by key. */
    toggle(widget) {
      if (widget in this.enabled) {
        this.enabled[widget] = !this.enabled[widget];
      }
    },

    /** Moves a widget from one index to another (drag & drop). */
    reorder(fromIndex, toIndex) {
      const item = this.order.splice(fromIndex, 1)[0];
      this.order.splice(toIndex, 0, item);
    },

    /** Resets order to default. */
    resetOrder() {
      this.order = [...DEFAULT_ORDER];
    },

    installMarketplaceWidget(asset) {
      const builtinWidgetKey = resolveBuiltinWidgetKey(asset);

      this.installedMarketplaceWidgets[asset.slug] = {
        slug: asset.slug,
        name: asset.name,
        version: asset.version,
        builtinWidgetKey,
        supported: Boolean(builtinWidgetKey),
        installedAt: new Date().toISOString(),
      };

      if (builtinWidgetKey && !this.order.includes(builtinWidgetKey)) {
        this.order.push(builtinWidgetKey);
      }

      return builtinWidgetKey;
    },

    enableInstalledMarketplaceWidget(slug) {
      const installedWidget = this.installedMarketplaceWidgets[slug];
      if (!installedWidget?.builtinWidgetKey) return false;

      this.enabled[installedWidget.builtinWidgetKey] = true;
      if (!this.order.includes(installedWidget.builtinWidgetKey)) {
        this.order.push(installedWidget.builtinWidgetKey);
      }

      return true;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['enabled', 'order', 'installedMarketplaceWidgets'],
    afterRestore(ctx) {
      const store = ctx.store;
      // Migrate from old flat format { search: true } to new { enabled: { search: true } }
      const raw = JSON.parse(localStorage.getItem('widgetsStore') || '{}');
      if ('search' in raw && !('enabled' in raw)) {
        store.enabled = {
          search: !!raw.search,
          bookmarks: !!raw.bookmarks,
          weather: !!raw.weather,
          currency: !!raw.currency,
          browserBookmarks: !!raw.browserBookmarks,
          privacy: raw.privacy !== false,
          rss: !!raw.rss,
          calendar: !!raw.calendar,
          notes: !!raw.notes,
          todo: !!raw.todo,
        };
        store.order = [...DEFAULT_ORDER];
      }

      // Ensure new widget keys exist in persisted enabled map.
      if (!Object.prototype.hasOwnProperty.call(store.enabled, 'weather')) {
        store.enabled.weather = false;
      }
      if (!Object.prototype.hasOwnProperty.call(store.enabled, 'currency')) {
        store.enabled.currency = false;
      }
      if (!Object.prototype.hasOwnProperty.call(store.enabled, 'browserBookmarks')) {
        store.enabled.browserBookmarks = false;
      }

      // Ensure order array contains all widget keys
      for (const key of DEFAULT_ORDER) {
        if (!store.order.includes(key)) {
          store.order.push(key);
        }
      }

      if (!store.installedMarketplaceWidgets || typeof store.installedMarketplaceWidgets !== 'object') {
        store.installedMarketplaceWidgets = {};
      }
    },
  },
});

export default useWidgetsStore;
