import { defineStore } from 'pinia';
import useThemeStore from './useThemeStore.js';

// Cache system-level prefers-color-scheme to avoid calling matchMedia on every getter access
let _systemDarkMode = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(prefers-color-scheme: dark)').matches
  : false;

if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)')
    .addEventListener('change', (e) => { _systemDarkMode = e.matches; });
}

const useTabStore = defineStore('tabStore', {
  state: () => ({
    tabName: 'New Tab',
    theme: 'light',
    density: 'comfortable',
    background: {
      type: 'Unsplash',
      default: true,
      class: 'bg-orange',
    },
    state: false,
    openLink: 'Self Tab',
    autoTheme: true,
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

    setTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', this.theme);
      const themeStore = useThemeStore();
      themeStore.applyTheme(this.theme);
    },

    setDensity(density) {
      this.density = density;
      document.documentElement.setAttribute('data-density', this.density);
    },

    setTitle(title) {
        this.tabName = title;
        document.title = this.tabName;
    },

    changeBackground(background){
      if(background) {
        this.background = background;
      }

      const body = document.getElementsByTagName('body')[0];
      switch(this.background.type) {
        case 'Solid':
          if (!this.background.default) {
            body.style.backgroundColor = this.background.color;
          }
          body.className = '';
          break;
        case 'Gradient':
          body.style.backgroundColor = '';
          if(this.background.default) {
            body.className = '';
            body.classList.add(this.background.class);
          } else {
            console.log('soon');
          }
          break;
        case 'Unsplash':
        case 'MarketplaceWallpaper':
          body.style.backgroundColor = '';
          body.className = '';
          break;
        default:
          body.style.backgroundColor = '';
          body.className = '';
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
    paths: ['tabName', 'theme', 'density', 'background', 'openLink', 'autoTheme'],
  }
})

export default useTabStore;
