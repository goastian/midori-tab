import { defineStore } from 'pinia';

/**
 * Each theme has a `light` and `dark` variant.
 * Variables override the tokens.css defaults when applied.
 * `autoAdapt` = whether this theme should switch light/dark by time of day.
 */
const PREDEFINED_THEMES = {
  midori: {
    id: 'midori',
    name: 'Midori Default',
    icon: '🌿',
    preview: { light: '#00b894', dark: '#1a1a1a' },
    autoAdapt: true,
    light: {
      '--color-primary': '#009975',
      '--color-primary-hover': '#007a5e',
      '--color-primary-subtle': '#e6fbf4',
      '--color-bg': '#ffffff',
      '--color-bg-secondary': '#f5f5f5',
      '--color-bg-elevated': '#ffffff',
      '--color-surface': 'rgba(255, 255, 255, 0.85)',
      '--color-text': '#262626',
      '--color-text-secondary': '#737373',
      '--color-text-muted': '#a3a3a3',
      '--color-border': 'rgba(0, 0, 0, 0.1)',
      '--color-border-hover': 'rgba(0, 0, 0, 0.2)',
      '--glass-bg': 'rgba(255, 255, 255, 0.6)',
      '--glass-bg-hover': 'rgba(255, 255, 255, 0.75)',
      '--glass-border': 'rgba(0, 184, 148, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(0, 0, 0, 0.06)',
      '--shadow-glow': '0 0 20px rgba(0, 184, 148, 0.15)',
      '--theme-accent': '#00b894',
    },
    dark: {
      '--color-primary': '#26d99f',
      '--color-primary-hover': '#4de0b2',
      '--color-primary-subtle': 'rgba(0, 184, 148, 0.1)',
      '--color-bg': '#1a1a1a',
      '--color-bg-secondary': '#262626',
      '--color-bg-elevated': '#2a2a2a',
      '--color-surface': 'rgba(26, 26, 26, 0.85)',
      '--color-text': '#f5f5f5',
      '--color-text-secondary': '#a3a3a3',
      '--color-text-muted': '#737373',
      '--color-border': 'rgba(255, 255, 255, 0.08)',
      '--color-border-hover': 'rgba(255, 255, 255, 0.15)',
      '--glass-bg': 'rgba(0, 184, 148, 0.03)',
      '--glass-bg-hover': 'rgba(0, 184, 148, 0.06)',
      '--glass-border': 'rgba(0, 184, 148, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(0, 184, 148, 0.08)',
      '--shadow-glow': '0 0 20px rgba(0, 184, 148, 0.15)',
      '--theme-accent': '#00b894',
    },
  },

  forest: {
    id: 'forest',
    name: 'Midori Forest',
    icon: '🌲',
    preview: { light: '#2d6a4f', dark: '#1b2e1b' },
    autoAdapt: true,
    light: {
      '--color-primary': '#2d6a4f',
      '--color-primary-hover': '#1b4332',
      '--color-primary-subtle': '#d8f3dc',
      '--color-bg': '#f0f7f0',
      '--color-bg-secondary': '#e2efe2',
      '--color-bg-elevated': '#f5faf5',
      '--color-surface': 'rgba(240, 247, 240, 0.88)',
      '--color-text': '#1b2e1b',
      '--color-text-secondary': '#52796f',
      '--color-text-muted': '#74a892',
      '--color-border': 'rgba(45, 106, 79, 0.15)',
      '--color-border-hover': 'rgba(45, 106, 79, 0.3)',
      '--glass-bg': 'rgba(216, 243, 220, 0.55)',
      '--glass-bg-hover': 'rgba(216, 243, 220, 0.7)',
      '--glass-border': 'rgba(45, 106, 79, 0.15)',
      '--glass-shadow': '0 8px 32px rgba(27, 67, 50, 0.08)',
      '--shadow-glow': '0 0 20px rgba(45, 106, 79, 0.12)',
      '--theme-accent': '#40916c',
    },
    dark: {
      '--color-primary': '#52b788',
      '--color-primary-hover': '#74c69d',
      '--color-primary-subtle': 'rgba(82, 183, 136, 0.1)',
      '--color-bg': '#1b2e1b',
      '--color-bg-secondary': '#243524',
      '--color-bg-elevated': '#2d3e2d',
      '--color-surface': 'rgba(27, 46, 27, 0.88)',
      '--color-text': '#d8f3dc',
      '--color-text-secondary': '#95d5b2',
      '--color-text-muted': '#52796f',
      '--color-border': 'rgba(82, 183, 136, 0.12)',
      '--color-border-hover': 'rgba(82, 183, 136, 0.25)',
      '--glass-bg': 'rgba(82, 183, 136, 0.05)',
      '--glass-bg-hover': 'rgba(82, 183, 136, 0.1)',
      '--glass-border': 'rgba(82, 183, 136, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(27, 46, 27, 0.12)',
      '--shadow-glow': '0 0 20px rgba(82, 183, 136, 0.12)',
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
      '--color-bg': '#f0f8ff',
      '--color-bg-secondary': '#e0f0fb',
      '--color-bg-elevated': '#f5fbff',
      '--color-surface': 'rgba(240, 248, 255, 0.88)',
      '--color-text': '#0a1628',
      '--color-text-secondary': '#456b8a',
      '--color-text-muted': '#7ba3c4',
      '--color-border': 'rgba(0, 119, 182, 0.12)',
      '--color-border-hover': 'rgba(0, 119, 182, 0.25)',
      '--glass-bg': 'rgba(202, 240, 248, 0.5)',
      '--glass-bg-hover': 'rgba(202, 240, 248, 0.65)',
      '--glass-border': 'rgba(0, 119, 182, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(0, 119, 182, 0.06)',
      '--shadow-glow': '0 0 20px rgba(0, 180, 216, 0.12)',
      '--theme-accent': '#00b4d8',
    },
    dark: {
      '--color-primary': '#00b4d8',
      '--color-primary-hover': '#48cae4',
      '--color-primary-subtle': 'rgba(0, 180, 216, 0.1)',
      '--color-bg': '#0a1628',
      '--color-bg-secondary': '#122240',
      '--color-bg-elevated': '#1a2d50',
      '--color-surface': 'rgba(10, 22, 40, 0.88)',
      '--color-text': '#caf0f8',
      '--color-text-secondary': '#90e0ef',
      '--color-text-muted': '#456b8a',
      '--color-border': 'rgba(0, 180, 216, 0.12)',
      '--color-border-hover': 'rgba(0, 180, 216, 0.25)',
      '--glass-bg': 'rgba(0, 180, 216, 0.04)',
      '--glass-bg-hover': 'rgba(0, 180, 216, 0.08)',
      '--glass-border': 'rgba(0, 180, 216, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(0, 22, 40, 0.15)',
      '--shadow-glow': '0 0 20px rgba(0, 180, 216, 0.12)',
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
      '--color-bg': '#fff8f0',
      '--color-bg-secondary': '#ffecd2',
      '--color-bg-elevated': '#fffaf5',
      '--color-surface': 'rgba(255, 248, 240, 0.88)',
      '--color-text': '#3d1c00',
      '--color-text-secondary': '#8a5a30',
      '--color-text-muted': '#c08a5a',
      '--color-border': 'rgba(232, 93, 4, 0.12)',
      '--color-border-hover': 'rgba(232, 93, 4, 0.25)',
      '--glass-bg': 'rgba(255, 236, 210, 0.5)',
      '--glass-bg-hover': 'rgba(255, 236, 210, 0.65)',
      '--glass-border': 'rgba(232, 93, 4, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(196, 73, 0, 0.06)',
      '--shadow-glow': '0 0 20px rgba(232, 93, 4, 0.12)',
      '--theme-accent': '#f48c06',
    },
    dark: {
      '--color-primary': '#f48c06',
      '--color-primary-hover': '#faa307',
      '--color-primary-subtle': 'rgba(244, 140, 6, 0.1)',
      '--color-bg': '#2a1008',
      '--color-bg-secondary': '#3d1c0e',
      '--color-bg-elevated': '#4a2514',
      '--color-surface': 'rgba(42, 16, 8, 0.88)',
      '--color-text': '#fff1e6',
      '--color-text-secondary': '#f4a261',
      '--color-text-muted': '#8a5a30',
      '--color-border': 'rgba(244, 140, 6, 0.12)',
      '--color-border-hover': 'rgba(244, 140, 6, 0.25)',
      '--glass-bg': 'rgba(244, 140, 6, 0.04)',
      '--glass-bg-hover': 'rgba(244, 140, 6, 0.08)',
      '--glass-border': 'rgba(244, 140, 6, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(42, 16, 8, 0.15)',
      '--shadow-glow': '0 0 20px rgba(244, 140, 6, 0.12)',
      '--theme-accent': '#f48c06',
    },
  },

  monochrome: {
    id: 'monochrome',
    name: 'Monochrome',
    icon: '⬛',
    preview: { light: '#525252', dark: '#171717' },
    autoAdapt: true,
    light: {
      '--color-primary': '#404040',
      '--color-primary-hover': '#262626',
      '--color-primary-subtle': '#f5f5f5',
      '--color-bg': '#fafafa',
      '--color-bg-secondary': '#f0f0f0',
      '--color-bg-elevated': '#ffffff',
      '--color-surface': 'rgba(250, 250, 250, 0.88)',
      '--color-text': '#171717',
      '--color-text-secondary': '#525252',
      '--color-text-muted': '#a3a3a3',
      '--color-border': 'rgba(0, 0, 0, 0.1)',
      '--color-border-hover': 'rgba(0, 0, 0, 0.2)',
      '--glass-bg': 'rgba(255, 255, 255, 0.6)',
      '--glass-bg-hover': 'rgba(255, 255, 255, 0.75)',
      '--glass-border': 'rgba(0, 0, 0, 0.08)',
      '--glass-shadow': '0 8px 32px rgba(0, 0, 0, 0.06)',
      '--shadow-glow': '0 0 20px rgba(64, 64, 64, 0.08)',
      '--theme-accent': '#525252',
    },
    dark: {
      '--color-primary': '#d4d4d4',
      '--color-primary-hover': '#e5e5e5',
      '--color-primary-subtle': 'rgba(212, 212, 212, 0.08)',
      '--color-bg': '#0a0a0a',
      '--color-bg-secondary': '#141414',
      '--color-bg-elevated': '#1c1c1c',
      '--color-surface': 'rgba(10, 10, 10, 0.88)',
      '--color-text': '#e5e5e5',
      '--color-text-secondary': '#a3a3a3',
      '--color-text-muted': '#525252',
      '--color-border': 'rgba(255, 255, 255, 0.08)',
      '--color-border-hover': 'rgba(255, 255, 255, 0.15)',
      '--glass-bg': 'rgba(255, 255, 255, 0.03)',
      '--glass-bg-hover': 'rgba(255, 255, 255, 0.06)',
      '--glass-border': 'rgba(255, 255, 255, 0.08)',
      '--glass-shadow': '0 8px 32px rgba(0, 0, 0, 0.15)',
      '--shadow-glow': '0 0 20px rgba(212, 212, 212, 0.05)',
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
      '--color-bg': '#eceff4',
      '--color-bg-secondary': '#e5e9f0',
      '--color-bg-elevated': '#f0f3f8',
      '--color-surface': 'rgba(236, 239, 244, 0.88)',
      '--color-text': '#2e3440',
      '--color-text-secondary': '#4c566a',
      '--color-text-muted': '#7b88a1',
      '--color-border': 'rgba(94, 129, 172, 0.15)',
      '--color-border-hover': 'rgba(94, 129, 172, 0.3)',
      '--glass-bg': 'rgba(229, 233, 240, 0.55)',
      '--glass-bg-hover': 'rgba(229, 233, 240, 0.7)',
      '--glass-border': 'rgba(94, 129, 172, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(46, 52, 64, 0.06)',
      '--shadow-glow': '0 0 20px rgba(94, 129, 172, 0.1)',
      '--theme-accent': '#88c0d0',
    },
    dark: {
      '--color-primary': '#88c0d0',
      '--color-primary-hover': '#8fbcbb',
      '--color-primary-subtle': 'rgba(136, 192, 208, 0.1)',
      '--color-bg': '#2e3440',
      '--color-bg-secondary': '#3b4252',
      '--color-bg-elevated': '#434c5e',
      '--color-surface': 'rgba(46, 52, 64, 0.88)',
      '--color-text': '#eceff4',
      '--color-text-secondary': '#d8dee9',
      '--color-text-muted': '#4c566a',
      '--color-border': 'rgba(136, 192, 208, 0.12)',
      '--color-border-hover': 'rgba(136, 192, 208, 0.25)',
      '--glass-bg': 'rgba(136, 192, 208, 0.04)',
      '--glass-bg-hover': 'rgba(136, 192, 208, 0.08)',
      '--glass-border': 'rgba(136, 192, 208, 0.12)',
      '--glass-shadow': '0 8px 32px rgba(46, 52, 64, 0.15)',
      '--shadow-glow': '0 0 20px rgba(136, 192, 208, 0.1)',
      '--theme-accent': '#88c0d0',
    },
  },
};

const useThemeStore = defineStore('themeStore', {
  state: () => ({
    activeThemeId: 'midori',
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
        '--color-bg': '#fafafe',
        '--color-bg-secondary': '#f0f0f8',
        '--color-bg-elevated': '#ffffff',
        '--color-surface': 'rgba(250, 250, 254, 0.88)',
        '--color-text': '#1e1b4b',
        '--color-text-secondary': '#4338ca',
        '--color-text-muted': '#818cf8',
        '--color-border': 'rgba(99, 102, 241, 0.12)',
        '--color-border-hover': 'rgba(99, 102, 241, 0.25)',
        '--glass-bg': 'rgba(238, 242, 255, 0.5)',
        '--glass-bg-hover': 'rgba(238, 242, 255, 0.65)',
        '--glass-border': 'rgba(99, 102, 241, 0.12)',
        '--glass-shadow': '0 8px 32px rgba(99, 102, 241, 0.06)',
        '--shadow-glow': '0 0 20px rgba(99, 102, 241, 0.1)',
        '--theme-accent': '#6366f1',
      },
      dark: {
        '--color-primary': '#818cf8',
        '--color-primary-hover': '#a5b4fc',
        '--color-primary-subtle': 'rgba(129, 140, 248, 0.1)',
        '--color-bg': '#1e1b4b',
        '--color-bg-secondary': '#272360',
        '--color-bg-elevated': '#312e73',
        '--color-surface': 'rgba(30, 27, 75, 0.88)',
        '--color-text': '#eef2ff',
        '--color-text-secondary': '#a5b4fc',
        '--color-text-muted': '#4338ca',
        '--color-border': 'rgba(129, 140, 248, 0.12)',
        '--color-border-hover': 'rgba(129, 140, 248, 0.25)',
        '--glass-bg': 'rgba(129, 140, 248, 0.04)',
        '--glass-bg-hover': 'rgba(129, 140, 248, 0.08)',
        '--glass-border': 'rgba(129, 140, 248, 0.12)',
        '--glass-shadow': '0 8px 32px rgba(30, 27, 75, 0.15)',
        '--shadow-glow': '0 0 20px rgba(129, 140, 248, 0.1)',
        '--theme-accent': '#818cf8',
      },
    },
  }),

  getters: {
    allThemes() {
      return [...Object.values(PREDEFINED_THEMES), this.customTheme];
    },

    activeTheme(state) {
      if (state.activeThemeId === 'custom') return state.customTheme;
      return PREDEFINED_THEMES[state.activeThemeId] || PREDEFINED_THEMES.midori;
    },
  },

  actions: {
    setTheme(themeId) {
      this.activeThemeId = themeId;
      this.applyTheme();
    },

    applyTheme(mode) {
      const theme = this.activeTheme;
      const variant = mode || document.documentElement.getAttribute('data-theme') || 'dark';
      const vars = theme[variant] || theme.dark;
      if (!vars) return;

      const root = document.documentElement;
      Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(key, value);
      });

      // Also update legacy aliases
      root.style.setProperty('--bg-color', vars['--color-bg'] || '');
      root.style.setProperty('--bg-glass', vars['--glass-bg'] || '');
      root.style.setProperty('--bg-secondary', vars['--color-bg-secondary'] || '');
      root.style.setProperty('--text-color', vars['--color-text'] || '');
      root.style.setProperty('--border-color', vars['--color-border'] || '');
    },

    clearThemeVars() {
      const root = document.documentElement;
      const sampleTheme = PREDEFINED_THEMES.midori.dark;
      Object.keys(sampleTheme).forEach(key => {
        root.style.removeProperty(key);
      });
      root.style.removeProperty('--bg-color');
      root.style.removeProperty('--bg-glass');
      root.style.removeProperty('--bg-secondary');
      root.style.removeProperty('--text-color');
      root.style.removeProperty('--border-color');
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
    },

    getThemeAutoAdapt() {
      return this.activeTheme.autoAdapt;
    },

    setAutoAdapt(themeId, value) {
      if (themeId === 'custom') {
        this.customTheme.autoAdapt = value;
      }
      // Predefined themes always have autoAdapt; controlled per-theme via this flag
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['activeThemeId', 'customTheme'],
  },
});

export { PREDEFINED_THEMES };
export default useThemeStore;
