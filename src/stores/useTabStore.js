import { defineStore } from 'pinia';
import useThemeStore from './useThemeStore.js';
import {
  normalizeStartPageSettings,
  START_PAGE_DEFAULTS,
} from '../utils/startPageSettings.js';

// Cache system-level prefers-color-scheme to avoid calling matchMedia on every getter access
let _systemDarkMode = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false;

if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => { _systemDarkMode = e.matches; });
}

function sanitizePersistedBackground(background) {
  if (!background || typeof background !== 'object') return background;
  const clean = { ...background };
  delete clean.imageSrcSet;

  for (const key of Object.keys(clean)) {
    if (typeof clean[key] === 'string' && clean[key].startsWith('blob:')) {
      delete clean[key];
    }
  }

  return clean;
}

const useTabStore = defineStore('tabStore', {
  state: () => ({
    tabName: 'Midori Tab',
    theme: 'light',
    density: 'comfortable',
    background: {
      type: 'Unsplash',
      default: true,
      class: 'bg-orange',
    },
    state: false,
    settingsSection: 'general',
    openLink: 'Self Tab',
    autoTheme: false,
    showAds: true,
    ...START_PAGE_DEFAULTS,
  }),

  getters: {
    effectiveTheme(state) {
      if (!state.autoTheme) return state.theme;
      return _systemDarkMode ? 'dark' : 'light';
    },
  },

  actions: {
    resolveTheme() {
      return this.effectiveTheme;
    },

    loadSettings () {
      const resolvedTheme = this.resolveTheme();
      document.documentElement.setAttribute('data-theme', resolvedTheme);
      document.documentElement.setAttribute('data-density', this.density);
      document.title = this.tabName;
      const themeStore = useThemeStore();
      themeStore.applyTheme(resolvedTheme);
      this.changeBackground();
    },

    updateState() {
      this.state = !this.state;
    },

    openSettings(section = 'general') {
      this.settingsSection = section;
      this.state = true;
    },

    closeSettings() {
      this.state = false;
    },

    setTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', this.theme);
      const themeStore = useThemeStore();
      themeStore.applyTheme(this.theme);
    },

    applyStartPageSettings(settings = {}) {
      Object.assign(this, normalizeStartPageSettings({
        ...this.$state,
        ...settings,
      }));
    },

    resetStartPageSettings() {
      Object.assign(this, START_PAGE_DEFAULTS);
    },

    changeBackground(background){
      if(background) {
        this.background = background;
      }

      const body = document.getElementsByTagName('body')[0];
      const root = document.documentElement;
      if (background) {
        root.style.removeProperty('--midori-start-background');
        root.style.removeProperty('--midori-start-color');
        window.__midoriEarlyWallpaper = null;
        window.__midoriWallpaperKey = null;
      }
      const { type } = this.background;
      for (const property of ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat']) body.style[property] = '';
      body.style.backgroundColor = type === 'Solid' && !this.background.default ? this.background.color : '';
      if (type === 'Gradient' && this.background.default) {
        body.className = '';
        body.classList.add(this.background.class);
      } else if (type === 'Gradient') {
        console.log('soon');
      } else {
        body.className = '';
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('midori:background-changed', {
          detail: { background: this.background },
        }));
      }
    },

    openLinkTab(url) {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      if(this.openLink == 'New Tab') {
        browserAPI.tabs.create({ url: url});
      } else if(this.openLink == 'Self Tab') {
        browserAPI.tabs.update({ url: url });
      }
    }
  },

  persist: {
    enable: true,
    storage: localStorage,
    pick: [
      'tabName',
      'theme',
      'density',
      'background',
      'openLink',
      'autoTheme',
      'showAds',
      'showSpeedDials',
      'speedDialSize',
      'speedDialColumns',
      'speedDialLimit',
      'speedDialTitleMode',
      'showSpeedDialDeleteButton',
      'showAddSpeedDialButton',
      'widgetsEnabled',
      'widgetColumns',
    ],
    afterHydrate(ctx) {
      ctx.store.applyStartPageSettings(ctx.store.$state);
    },
    serializer: {
      serialize(state) {
        return JSON.stringify({
          ...state,
          background: sanitizePersistedBackground(state.background),
        });
      },
      deserialize: JSON.parse,
    },
  }
})

export default useTabStore;
