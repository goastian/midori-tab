import { defineStore } from 'pinia';
import {
  DEFAULT_LOCALE,
  availableLanguages,
  isLocaleSupported,
  loadLocaleMessages,
  locales,
  normalizeLocale,
} from '../i18n/index.js';

const loadedLocaleMessages = { ...locales };
const pendingLocaleLoads = new Map();

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

function syncLocaleToExtensionStorage(locale) {
  try {
    if (typeof chrome === 'undefined') return;
    if (!chrome.storage?.local?.set) return;
    chrome.storage.local.set({ 'midori-locale': locale });
  } catch (e) {
  }
}

const useI18nStore = defineStore('i18nStore', {
  state: () => ({
    locale: isLocaleSupported(getBrowserLocale()) ? getBrowserLocale() : DEFAULT_LOCALE,
    messages: { ...loadedLocaleMessages },
  }),

  getters: {
    t(state) {
      return state.messages[state.locale] || state.messages[DEFAULT_LOCALE];
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
      this.locale = isLocaleSupported(normalized) ? normalized : DEFAULT_LOCALE;
      try {
        document.documentElement.lang = this.locale;
      } catch (e) {
      }
      syncLocaleToExtensionStorage(this.locale);
      this.loadLocale(this.locale);
    },

    ensureLocale() {
      const normalized = normalizeLocale(this.locale);
      this.locale = isLocaleSupported(normalized) ? normalized : DEFAULT_LOCALE;
      try {
        document.documentElement.lang = this.locale;
      } catch (e) {
      }
      syncLocaleToExtensionStorage(this.locale);
      this.loadLocale(this.locale);
    },

    async loadLocale(code) {
      const normalized = isLocaleSupported(code) ? normalizeLocale(code) : DEFAULT_LOCALE;
      if (this.messages[normalized]) return this.messages[normalized];
      if (pendingLocaleLoads.has(normalized)) return pendingLocaleLoads.get(normalized);

      const request = loadLocaleMessages(normalized)
        .then(({ code: loadedCode, messages }) => {
          this.messages = {
            ...this.messages,
            [loadedCode]: messages,
          };
          return messages;
        })
        .finally(() => {
          pendingLocaleLoads.delete(normalized);
        });

      pendingLocaleLoads.set(normalized, request);
      return request;
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

      const current = resolveFrom(this.messages[this.locale] || this.messages[DEFAULT_LOCALE]);
      if (typeof current === 'string' || typeof current === 'number') return current;
      const fallback = resolveFrom(this.messages[DEFAULT_LOCALE]);
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
