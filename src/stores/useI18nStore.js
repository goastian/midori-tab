import { defineStore } from 'pinia';
import { locales, availableLanguages } from '../i18n/index.js';

function normalizeLocale(code) {
  if (!code) return '';
  return String(code).trim().toLowerCase().split('-')[0];
}

function getBrowserLocale() {
  try {
    const candidate =
      (Array.isArray(navigator.languages) && navigator.languages[0]) ||
      navigator.language ||
      '';
    return normalizeLocale(candidate);
  } catch (e) {
    return '';
  }
}

const useI18nStore = defineStore('i18nStore', {
  state: () => ({
    locale: locales[getBrowserLocale()] ? getBrowserLocale() : 'en',
  }),

  getters: {
    t(state) {
      return locales[state.locale] || locales.en;
    },

    languages() {
      return availableLanguages;
    },

    currentLanguage(state) {
      return availableLanguages.find(l => l.code === state.locale) || availableLanguages.find(l => l.code === 'en') || availableLanguages[0];
    },
  },

  actions: {
    setLocale(code) {
      const normalized = normalizeLocale(code);
      this.locale = locales[normalized] ? normalized : 'en';
      try {
        document.documentElement.lang = this.locale;
      } catch (e) {
      }
    },

    ensureLocale() {
      const normalized = normalizeLocale(this.locale);
      this.locale = locales[normalized] ? normalized : 'en';
      try {
        document.documentElement.lang = this.locale;
      } catch (e) {
      }
    },

    /**
     * Helper to resolve a dot-path key from the current locale.
     * E.g. $t('settings.title') => 'Configuración'
     */
    $t(key) {
      const parts = key.split('.');
      const resolveFrom = (root) => {
        let obj = root;
        for (const part of parts) {
          if (obj && typeof obj === 'object' && part in obj) {
            obj = obj[part];
          } else {
            return undefined;
          }
        }
        return obj;
      };

      const current = resolveFrom(locales[this.locale] || locales.en);
      if (typeof current === 'string' || typeof current === 'number') return current;
      const fallback = resolveFrom(locales.en);
      if (typeof fallback === 'string' || typeof fallback === 'number') return fallback;

      for (const part of parts) {
        if (!part) return key;
      }
      return key;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['locale'],
  },
});

export default useI18nStore;
