import { defineStore } from 'pinia';
import useI18nStore from './useI18nStore.js';

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

      // Buscar hábitos que coincidan con la hora actual (+/- 1 hora)
      const matched = state.habits.filter(h => {
        const hourMatch = Math.abs(h.hour - hour) <= 1 || 
                          (h.hour === 23 && hour === 0) || 
                          (h.hour === 0 && hour === 23);
        return hourMatch && !state.dismissed.includes(h.url);
      });

      // Agrupar por URL y sumar conteos
      const grouped = {};
      matched.forEach(h => {
        if (!grouped[h.url]) {
          grouped[h.url] = { ...h, totalCount: 0 };
        }
        grouped[h.url].totalCount += h.count;
        // Bonus si coincide día de semana
        if (h.dayOfWeek === day) {
          grouped[h.url].totalCount += h.count * 0.5;
        }
      });

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
    storage: localStorage,
    paths: ['habits', 'enabled'],
  },
});

export default useSuggestionsStore;
