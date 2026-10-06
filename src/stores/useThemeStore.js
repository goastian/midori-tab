import { defineStore } from 'pinia';
import { reconcileHydration, snapshotHydration } from '../bootstrap/reconcileHydration.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';
import { readBootSnapshot, writeThemeBootVars } from '../bootstrap/bootSnapshot.js';

/**
 * Each theme has a `light` and `dark` variant.
 * Variables override the tokens.css defaults when applied.
 * `autoAdapt` = whether this theme should switch light/dark by time of day.
 */
const PREDEFINED_THEMES = {
  midori: {
    id: 'midori',
    name: 'Midori',
    icon: '🌿',
    preview: { light: '#0eae5b', dark: '#07150d' },
    autoAdapt: true,
    light: {
      '--color-primary': '#0eae5b',
      '--color-primary-hover': '#0a914c',
      '--color-primary-subtle': '#e6fbf4',
      '--color-bg': '#eff8f3',
      '--color-bg-secondary': '#dff4e9',
      '--color-bg-elevated': '#ffffff',
      '--surface-base': '#eff8f3',
      '--surface-raised': '#ffffff',
      '--surface-overlay': '#f7fbf8',
      '--surface-sunken': '#e7f3ec',
      '--color-text': '#142a24',
      '--color-text-secondary': '#31554b',
      '--color-text-muted': '#617a72',
      '--color-border': 'rgba(20, 42, 36, 0.14)',
      '--color-border-hover': 'rgba(20, 42, 36, 0.24)',
      '--theme-accent': '#0eae5b',
    },
    dark: {
      '--color-primary': '#29c58b',
      '--color-primary-hover': '#48d4a1',
      '--color-primary-subtle': 'rgba(41, 197, 139, 0.1)',
      '--color-bg': '#07150d',
      '--color-bg-secondary': '#101924',
      '--color-bg-elevated': '#151d1a',
      '--surface-base': '#07150d',
      '--surface-raised': '#151d1a',
      '--surface-overlay': '#16211d',
      '--surface-sunken': '#0e1714',
      '--color-text': '#eaf3f2',
      '--color-text-secondary': '#a8c6bd',
      '--color-text-muted': '#86a69c',
      '--color-border': 'rgba(234, 243, 242, 0.11)',
      '--color-border-hover': 'rgba(234, 243, 242, 0.2)',
      '--theme-accent': '#29c58b',
    },
  },
};
const THEME_ASYNC_STATE_KEY = 'midori_theme_async_state_v1';

function readLegacyThemeState() {
  try {
    const raw = JSON.parse(localStorage.getItem('themeStore') || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function clonePlain(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
}

const useThemeStore = defineStore('themeStore', {
  state: () => ({
    activeThemeId: 'midori',
    asyncHydrated: false,
    catalogReady: false,
    marketplaceThemes: {},
    customTheme: {
      id: 'custom',
      name: 'Custom',
      icon: '🎨',
      preview: { light: '#6366f1', dark: '#1e1b4b' },
      autoAdapt: true,
      light: {
        '--color-primary': '#6366f1',
        '--color-primary-hover': '#4f46e5',
        '--color-primary-subtle': '#eef2ff',
        '--color-bg': '#E8E8F0',
        '--color-bg-secondary': '#DDDDE8',
        '--color-bg-elevated': '#F0F0F8',
        '--surface-base': '#E8E8F0',
        '--surface-raised': '#F0F0F8',
        '--surface-overlay': '#F8F8FC',
        '--surface-sunken': '#DDDDE8',
        '--color-text': '#1e1b4b',
        '--color-text-secondary': '#3730A3',
        '--color-text-muted': '#4338ca',
        '--color-border': 'rgba(99, 102, 241, 0.18)',
        '--color-border-hover': 'rgba(99, 102, 241, 0.3)',
        '--theme-accent': '#6366f1',
      },
      dark: {
        '--color-primary': '#818cf8',
        '--color-primary-hover': '#a5b4fc',
        '--color-primary-subtle': 'rgba(129, 140, 248, 0.1)',
        '--color-bg': '#12102E',
        '--color-bg-secondary': '#1E1B4B',
        '--color-bg-elevated': '#272360',
        '--surface-base': '#12102E',
        '--surface-raised': '#1E1B4B',
        '--surface-overlay': '#272360',
        '--surface-sunken': '#0C0A22',
        '--color-text': '#eef2ff',
        '--color-text-secondary': '#a5b4fc',
        '--color-text-muted': '#4338ca',
        '--color-border': 'rgba(129, 140, 248, 0.12)',
        '--color-border-hover': 'rgba(129, 140, 248, 0.25)',
        '--theme-accent': '#818cf8',
      },
    },
  }),

  getters: {
    allThemes() {
      void this.catalogReady;
      return [...Object.values(PREDEFINED_THEMES), ...Object.values(this.marketplaceThemes), this.customTheme];
    },

    activeTheme(state) {
      void state.catalogReady;
      if (state.activeThemeId === 'custom') return state.customTheme;
      if (state.marketplaceThemes[state.activeThemeId]) return state.marketplaceThemes[state.activeThemeId];
      return PREDEFINED_THEMES[state.activeThemeId] || PREDEFINED_THEMES.midori;
    },
  },

  actions: {
    installPredefinedThemes(themes) {
      Object.assign(PREDEFINED_THEMES, themes);
      this.catalogReady = true;
    },
    setTheme(themeId) {
      this.activeThemeId = themeId;
      this.applyTheme();
    },

    async installMarketplaceTheme(asset) {
      const { buildMarketplaceThemeDefinition } = await import('../utils/marketplaceAssets.js');
      const theme = buildMarketplaceThemeDefinition(asset);
      if (!theme) return null;

      this.marketplaceThemes[theme.id] = theme;
      this.persistAsyncState();
      return theme.id;
    },

    applyTheme(mode) {
      const theme = this.activeTheme;
      const variant = mode || document.documentElement.getAttribute('data-theme') || 'dark';
      const needsSnapshot = !this.asyncHydrated
        || (!PREDEFINED_THEMES[this.activeThemeId] && this.activeThemeId !== 'custom'
          && !this.marketplaceThemes[this.activeThemeId]);
      const snapshot = needsSnapshot ? readBootSnapshot() : null;
      const savedVars = snapshot?.themeId === this.activeThemeId ? snapshot.themeVars?.[variant] : null;
      const vars = savedVars && Object.keys(savedVars).length ? savedVars : (theme[variant] || theme.dark);
      if (!vars) return;

      const root = document.documentElement;

      // Batch all CSS custom properties in a single style write to avoid
      // triggering a style recalculation for each individual setProperty().
      const legacyAliases = {
        '--bg-color': vars['--color-bg'] || '',
        '--bg-glass': vars['--surface-raised'] || '',
        '--bg-secondary': vars['--color-bg-secondary'] || '',
        '--text-color': vars['--color-text'] || '',
        '--border-color': vars['--color-border'] || '',
      };

      const allVars = { ...vars, ...legacyAliases };
      const cssText = Object.entries(allVars)
        .map(([key, value]) => `${key}: ${value}`)
        .join('; ');

      root.setAttribute('style', cssText);
      writeThemeBootVars(variant, vars, this.activeThemeId);
    },

    clearThemeVars() {
      document.documentElement.removeAttribute('style');
    },

    updateCustomTheme(variant, vars) {
      if (variant === 'light') {
        this.customTheme.light = { ...this.customTheme.light, ...vars };
      } else {
        this.customTheme.dark = { ...this.customTheme.dark, ...vars };
      }
      if (this.activeThemeId === 'custom') {
        this.applyTheme();
      }
      this.persistAsyncState();
    },

    getThemeAutoAdapt() {
      return this.activeTheme.autoAdapt;
    },

    setAutoAdapt(themeId, value) {
      if (themeId === 'custom') {
        this.customTheme.autoAdapt = value;
        this.persistAsyncState();
      }
      // Predefined themes always have autoAdapt; controlled per-theme via this flag
    },

    async hydrateAsyncState() {
      const initialThemes = snapshotHydration(this.marketplaceThemes);
      const initialCustom = snapshotHydration(this.customTheme);
      const legacy = readLegacyThemeState();
      const asyncState = await getJson(THEME_ASYNC_STATE_KEY, null);
      const marketplaceThemes = asyncState?.marketplaceThemes || legacy.marketplaceThemes || {};
      const customTheme = asyncState?.customTheme || legacy.customTheme || this.customTheme;

      this.marketplaceThemes = reconcileHydration(initialThemes, this.marketplaceThemes, clonePlain(marketplaceThemes, {}));
      this.customTheme = reconcileHydration(initialCustom, this.customTheme, clonePlain(customTheme, this.customTheme));
      this.asyncHydrated = true;
      this.applyTheme();
      this.persistAsyncState();
    },

    persistAsyncState() {
      setJsonDebounced(THEME_ASYNC_STATE_KEY, {
        marketplaceThemes: clonePlain(this.marketplaceThemes, {}),
        customTheme: clonePlain(this.customTheme, this.customTheme),
      }, { delayMs: 800, maxBytes: 250_000 });
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    pick: ['activeThemeId'],
  },
});

export { PREDEFINED_THEMES };
export default useThemeStore;
