import { defineStore } from 'pinia';
import { getJson, setJsonDebounced } from '../services/StorageService.js';

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

  forest: {
    id: 'forest',
    name: 'Midori Forest',
    icon: '🌲',
    preview: { light: '#2d6a4f', dark: '#0E1A0E' },
    autoAdapt: true,
    light: {
      '--color-primary': '#2d6a4f',
      '--color-primary-hover': '#1b4332',
      '--color-primary-subtle': '#d8f3dc',
      '--color-bg': '#E2EFE2',
      '--color-bg-secondary': '#D5E8D5',
      '--color-bg-elevated': '#F0F7F0',
      '--surface-base': '#E2EFE2',
      '--surface-raised': '#F0F7F0',
      '--surface-overlay': '#F8FCF8',
      '--surface-sunken': '#D5E8D5',
      '--color-text': '#1b2e1b',
      '--color-text-secondary': '#3A5F4F',
      '--color-text-muted': '#52796f',
      '--color-border': 'rgba(45, 106, 79, 0.2)',
      '--color-border-hover': 'rgba(45, 106, 79, 0.35)',
      '--theme-accent': '#40916c',
    },
    dark: {
      '--color-primary': '#52b788',
      '--color-primary-hover': '#74c69d',
      '--color-primary-subtle': 'rgba(82, 183, 136, 0.1)',
      '--color-bg': '#0E1A0E',
      '--color-bg-secondary': '#162216',
      '--color-bg-elevated': '#1F2E1F',
      '--surface-base': '#0E1A0E',
      '--surface-raised': '#162216',
      '--surface-overlay': '#1F2E1F',
      '--surface-sunken': '#0A140A',
      '--color-text': '#d8f3dc',
      '--color-text-secondary': '#95d5b2',
      '--color-text-muted': '#52796f',
      '--color-border': 'rgba(82, 183, 136, 0.12)',
      '--color-border-hover': 'rgba(82, 183, 136, 0.25)',
      '--theme-accent': '#52b788',
    },
  },

  ocean: {
    id: 'ocean',
    name: 'Ocean',
    icon: '🌊',
    preview: { light: '#0077b6', dark: '#0a1628' },
    autoAdapt: true,
    light: {
      '--color-primary': '#0077b6',
      '--color-primary-hover': '#005f8a',
      '--color-primary-subtle': '#caf0f8',
      '--color-bg': '#E0F0FB',
      '--color-bg-secondary': '#D0E6F5',
      '--color-bg-elevated': '#F0F8FF',
      '--surface-base': '#E0F0FB',
      '--surface-raised': '#F0F8FF',
      '--surface-overlay': '#F8FCFF',
      '--surface-sunken': '#D0E6F5',
      '--color-text': '#0a1628',
      '--color-text-secondary': '#2A4F6A',
      '--color-text-muted': '#456b8a',
      '--color-border': 'rgba(0, 119, 182, 0.18)',
      '--color-border-hover': 'rgba(0, 119, 182, 0.3)',
      '--theme-accent': '#00b4d8',
    },
    dark: {
      '--color-primary': '#00b4d8',
      '--color-primary-hover': '#48cae4',
      '--color-primary-subtle': 'rgba(0, 180, 216, 0.1)',
      '--color-bg': '#0a1628',
      '--color-bg-secondary': '#122240',
      '--color-bg-elevated': '#1a2d50',
      '--surface-base': '#0a1628',
      '--surface-raised': '#122240',
      '--surface-overlay': '#1a2d50',
      '--surface-sunken': '#060F1C',
      '--color-text': '#caf0f8',
      '--color-text-secondary': '#90e0ef',
      '--color-text-muted': '#456b8a',
      '--color-border': 'rgba(0, 180, 216, 0.12)',
      '--color-border-hover': 'rgba(0, 180, 216, 0.25)',
      '--theme-accent': '#00b4d8',
    },
  },

  sunset: {
    id: 'sunset',
    name: 'Sunset',
    icon: '🌅',
    preview: { light: '#e85d04', dark: '#2a1008' },
    autoAdapt: true,
    light: {
      '--color-primary': '#e85d04',
      '--color-primary-hover': '#c44900',
      '--color-primary-subtle': '#fff1e6',
      '--color-bg': '#FFECD2',
      '--color-bg-secondary': '#FFE0B8',
      '--color-bg-elevated': '#FFF8F0',
      '--surface-base': '#FFECD2',
      '--surface-raised': '#FFF8F0',
      '--surface-overlay': '#FFFCF8',
      '--surface-sunken': '#FFE0B8',
      '--color-text': '#3d1c00',
      '--color-text-secondary': '#6A4020',
      '--color-text-muted': '#8a5a30',
      '--color-border': 'rgba(232, 93, 4, 0.18)',
      '--color-border-hover': 'rgba(232, 93, 4, 0.3)',
      '--theme-accent': '#f48c06',
    },
    dark: {
      '--color-primary': '#f48c06',
      '--color-primary-hover': '#faa307',
      '--color-primary-subtle': 'rgba(244, 140, 6, 0.1)',
      '--color-bg': '#1A0E06',
      '--color-bg-secondary': '#2A1A0E',
      '--color-bg-elevated': '#3A2514',
      '--surface-base': '#1A0E06',
      '--surface-raised': '#2A1A0E',
      '--surface-overlay': '#3A2514',
      '--surface-sunken': '#120A04',
      '--color-text': '#fff1e6',
      '--color-text-secondary': '#f4a261',
      '--color-text-muted': '#8a5a30',
      '--color-border': 'rgba(244, 140, 6, 0.12)',
      '--color-border-hover': 'rgba(244, 140, 6, 0.25)',
      '--theme-accent': '#f48c06',
    },
  },

  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    icon: '⬛',
    preview: { light: '#525252', dark: '#0a0a0a' },
    autoAdapt: true,
    light: {
      '--color-primary': '#404040',
      '--color-primary-hover': '#262626',
      '--color-primary-subtle': '#f5f5f5',
      '--color-bg': '#E8E8E8',
      '--color-bg-secondary': '#DEDEDE',
      '--color-bg-elevated': '#F5F5F5',
      '--surface-base': '#E8E8E8',
      '--surface-raised': '#F5F5F5',
      '--surface-overlay': '#FAFAFA',
      '--surface-sunken': '#DEDEDE',
      '--color-text': '#171717',
      '--color-text-secondary': '#404040',
      '--color-text-muted': '#737373',
      '--color-border': 'rgba(0, 0, 0, 0.15)',
      '--color-border-hover': 'rgba(0, 0, 0, 0.25)',
      '--theme-accent': '#525252',
    },
    dark: {
      '--color-primary': '#d4d4d4',
      '--color-primary-hover': '#e5e5e5',
      '--color-primary-subtle': 'rgba(212, 212, 212, 0.08)',
      '--color-bg': '#0a0a0a',
      '--color-bg-secondary': '#141414',
      '--color-bg-elevated': '#1c1c1c',
      '--surface-base': '#0a0a0a',
      '--surface-raised': '#141414',
      '--surface-overlay': '#1c1c1c',
      '--surface-sunken': '#050505',
      '--color-text': '#e5e5e5',
      '--color-text-secondary': '#a3a3a3',
      '--color-text-muted': '#525252',
      '--color-border': 'rgba(255, 255, 255, 0.08)',
      '--color-border-hover': 'rgba(255, 255, 255, 0.15)',
      '--theme-accent': '#a3a3a3',
    },
  },

  nord: {
    id: 'nord',
    name: 'Nord',
    icon: '❄️',
    preview: { light: '#5e81ac', dark: '#2e3440' },
    autoAdapt: true,
    light: {
      '--color-primary': '#5e81ac',
      '--color-primary-hover': '#4c6b8a',
      '--color-primary-subtle': '#eceff4',
      '--color-bg': '#D8DEE9',
      '--color-bg-secondary': '#CDD5E2',
      '--color-bg-elevated': '#ECEFF4',
      '--surface-base': '#D8DEE9',
      '--surface-raised': '#ECEFF4',
      '--surface-overlay': '#F5F7FA',
      '--surface-sunken': '#CDD5E2',
      '--color-text': '#2e3440',
      '--color-text-secondary': '#3B4252',
      '--color-text-muted': '#4c566a',
      '--color-border': 'rgba(94, 129, 172, 0.2)',
      '--color-border-hover': 'rgba(94, 129, 172, 0.35)',
      '--theme-accent': '#88c0d0',
    },
    dark: {
      '--color-primary': '#88c0d0',
      '--color-primary-hover': '#8fbcbb',
      '--color-primary-subtle': 'rgba(136, 192, 208, 0.1)',
      '--color-bg': '#2e3440',
      '--color-bg-secondary': '#3b4252',
      '--color-bg-elevated': '#434c5e',
      '--surface-base': '#2e3440',
      '--surface-raised': '#3b4252',
      '--surface-overlay': '#434c5e',
      '--surface-sunken': '#252B35',
      '--color-text': '#eceff4',
      '--color-text-secondary': '#d8dee9',
      '--color-text-muted': '#4c566a',
      '--color-border': 'rgba(136, 192, 208, 0.12)',
      '--color-border-hover': 'rgba(136, 192, 208, 0.25)',
      '--theme-accent': '#88c0d0',
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
      return [...Object.values(PREDEFINED_THEMES), ...Object.values(this.marketplaceThemes), this.customTheme];
    },

    activeTheme(state) {
      if (state.activeThemeId === 'custom') return state.customTheme;
      if (state.marketplaceThemes[state.activeThemeId]) return state.marketplaceThemes[state.activeThemeId];
      return PREDEFINED_THEMES[state.activeThemeId] || PREDEFINED_THEMES.midori;
    },
  },

  actions: {
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
      const vars = theme[variant] || theme.dark;
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
      const legacy = readLegacyThemeState();
      const asyncState = await getJson(THEME_ASYNC_STATE_KEY, null);
      const marketplaceThemes = asyncState?.marketplaceThemes || legacy.marketplaceThemes || {};
      const customTheme = asyncState?.customTheme || legacy.customTheme || this.customTheme;

      this.marketplaceThemes = clonePlain(marketplaceThemes, {});
      this.customTheme = clonePlain(customTheme, this.customTheme);
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
    paths: ['activeThemeId'],
  },
});

export { PREDEFINED_THEMES };
export default useThemeStore;
