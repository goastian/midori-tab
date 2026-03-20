import { defineStore } from 'pinia';

/** Default widget order */
const DEFAULT_ORDER = ['search', 'bookmarks', 'privacy', 'rss', 'calendar', 'notes', 'todo'];

/**
 * Store that manages which widgets are enabled and their display order.
 * Supports drag & drop reordering via the `order` array.
 */
const useWidgetsStore = defineStore('widgetsStore', {
  state: () => ({
    enabled: {
      search: true,
      bookmarks: true,
      privacy: true,
      rss: false,
      calendar: false,
      notes: false,
      todo: false,
    },
    /** Ordered list of widget keys — determines render order on the page */
    order: [...DEFAULT_ORDER],
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
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['enabled', 'order'],
    afterRestore(ctx) {
      const store = ctx.store;
      // Migrate from old flat format { search: true } to new { enabled: { search: true } }
      const raw = JSON.parse(localStorage.getItem('widgetsStore') || '{}');
      if ('search' in raw && !('enabled' in raw)) {
        store.enabled = {
          search: !!raw.search,
          bookmarks: !!raw.bookmarks,
          privacy: raw.privacy !== false,
          rss: !!raw.rss,
          calendar: !!raw.calendar,
          notes: !!raw.notes,
          todo: !!raw.todo,
        };
        store.order = [...DEFAULT_ORDER];
      }
      // Ensure order array contains all widget keys
      for (const key of DEFAULT_ORDER) {
        if (!store.order.includes(key)) {
          store.order.push(key);
        }
      }
    },
  },
});

export default useWidgetsStore;
