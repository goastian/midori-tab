import { defineStore } from 'pinia';
import { locales, availableLanguages } from '../i18n/index.js';

const useI18nStore = defineStore('i18nStore', {
  state: () => ({
    locale: 'es',
  }),

  getters: {
    t(state) {
      return locales[state.locale] || locales.es;
    },

    languages() {
      return availableLanguages;
    },

    currentLanguage(state) {
      return availableLanguages.find(l => l.code === state.locale) || availableLanguages[0];
    },
  },

  actions: {
    setLocale(code) {
      if (locales[code]) {
        this.locale = code;
      }
    },

    /**
     * Helper to resolve a dot-path key from the current locale.
     * E.g. $t('settings.title') => 'Configuración'
     */
    $t(key) {
      const parts = key.split('.');
      let obj = locales[this.locale] || locales.es;
      for (const part of parts) {
        if (obj && typeof obj === 'object' && part in obj) {
          obj = obj[part];
        } else {
          return key; // fallback: return the key itself
        }
      }
      return obj;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['locale'],
  },
});

export default useI18nStore;
