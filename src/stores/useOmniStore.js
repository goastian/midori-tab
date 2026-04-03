import { defineStore } from 'pinia';

const DATA_TTL = 30_000; // 30 s before re-fetching from background

export const useOmniStore = defineStore('omni', {
  state: () => ({
    isOpen: false,
    query: '',
    results: [],
    selectedIndex: 0,
    dataCache: /** @type {{tabs: any[], bookmarks: any[], actions: any[]}|null} */ (null),
    dataCacheTime: 0,
  }),

  actions: {
    open() {
      this.isOpen = true;
    },

    close() {
      this.isOpen = false;
      this.query = '';
      this.results = [];
      this.selectedIndex = 0;
    },

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    },

    setResults(results, selectedIndex = 0) {
      this.results = results;
      this.selectedIndex = selectedIndex;
    },

    moveSelection(delta) {
      const next = this.selectedIndex + delta;
      if (next >= 0 && next < this.results.length) {
        this.selectedIndex = next;
      }
    },

    /** Fetch data from background, respecting TTL. Returns resolved data object. */
    fetchData(force = false) {
      if (!force && this.dataCache && Date.now() - this.dataCacheTime < DATA_TTL) {
        return Promise.resolve(this.dataCache);
      }
      return new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ request: 'get-data' }, (data) => {
            if (chrome.runtime.lastError) {
              console.warn('[OmniStore] background not ready:', chrome.runtime.lastError.message);
              resolve(this.dataCache || { tabs: [], bookmarks: [], actions: [] });
              return;
            }
            this.dataCache = data || { tabs: [], bookmarks: [], actions: [] };
            this.dataCacheTime = Date.now();
            resolve(this.dataCache);
          });
        } catch (e) {
          resolve(this.dataCache || { tabs: [], bookmarks: [], actions: [] });
        }
      });
    },
  },

  // Omni state is ephemeral — do not persist
});
