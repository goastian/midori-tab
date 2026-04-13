import { defineStore } from 'pinia';
import useI18nStore from './useI18nStore.js';

// Debounced localStorage wrapper to avoid heavy JSON.stringify on every mutation
const debouncedStorage = (() => {
  let timer = null;
  let pending = null;
  return {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => {
      pending = { key, value };
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (pending) localStorage.setItem(pending.key, pending.value);
        pending = null;
      }, 1000);
    },
  };
})();

const useSuggestionsStore = defineStore('suggestionsStore', {
  state: () => ({
    // Historial de navegación por hora: { url, title, hour, dayOfWeek, count }
    habits: [],
    enabled: true,
    maxHabits: 200,
    // Sugerencias descartadas temporalmente (por sesión, no persistidas)
    dismissed: [],
  }),

  getters: {
    currentSuggestions(state) {
      if (!state.enabled) return [];
      const now = new Date();
      const hour = now.getHours();
      const day = now.getDay();
      const dismissedSet = new Set(state.dismissed);

      // Buscar hábitos que coincidan con la hora actual (+/- 1 hora)
      // Agrupar por URL y sumar conteos en una sola pasada
      const grouped = {};
      for (let i = 0; i < state.habits.length; i++) {
        const h = state.habits[i];
        if (dismissedSet.has(h.url)) continue;
        const hourDiff = Math.abs(h.hour - hour);
        const hourMatch = hourDiff <= 1 ||
                          (h.hour === 23 && hour === 0) ||
                          (h.hour === 0 && hour === 23);
        if (!hourMatch) continue;

        let entry = grouped[h.url];
        if (!entry) {
          entry = { url: h.url, title: h.title, hour: h.hour, dayOfWeek: h.dayOfWeek, count: h.count, totalCount: 0 };
          grouped[h.url] = entry;
        }
        entry.totalCount += h.count;
        // Bonus si coincide día de semana
        if (h.dayOfWeek === day) {
          entry.totalCount += h.count * 0.5;
        }
      }

      return Object.values(grouped)
        .sort((a, b) => b.totalCount - a.totalCount)
        .slice(0, 4);
    },
  },

  actions: {
    recordVisit(url, title) {
      if (!url || url === 'about:blank' || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return;

      const now = new Date();
      const hour = now.getHours();
      const dayOfWeek = now.getDay();

      // Buscar hábito existente para esta URL + hora + día
      const existing = this.habits.find(
        h => h.url === url && h.hour === hour && h.dayOfWeek === dayOfWeek
      );

      if (existing) {
        existing.count++;
        existing.title = title || existing.title;
        existing.lastVisit = Date.now();
      } else {
        this.habits.push({
          url,
          title: title || this.extractDomain(url),
          hour,
          dayOfWeek,
          count: 1,
          lastVisit: Date.now(),
        });
      }

      // Limitar tamaño
      if (this.habits.length > this.maxHabits) {
        this.habits.sort((a, b) => b.count - a.count);
        this.habits = this.habits.slice(0, this.maxHabits);
      }
    },

    dismissSuggestion(url) {
      if (!this.dismissed.includes(url)) {
        this.dismissed.push(url);
      }
    },

    clearDismissed() {
      this.dismissed = [];
    },

    extractDomain(url) {
      try {
        return new URL(url).hostname.replace('www.', '');
      } catch {
        return url;
      }
    },

    getTimeGreeting() {
      const i18n = useI18nStore();
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 12) return i18n.t.suggestions.goodMorning;
      if (hour >= 12 && hour < 18) return i18n.t.suggestions.goodAfternoon;
      return i18n.t.suggestions.goodEvening;
    },

    clearHabits() {
      this.habits = [];
      this.dismissed = [];
    },
  },

  persist: {
    enable: true,
    storage: debouncedStorage,
    paths: ['habits', 'enabled'],
  },
});

export default useSuggestionsStore;
