import { defineStore } from 'pinia';

const useTabStore = defineStore('tabStore', {
  state: () => ({
    tabName: 'New Tab',
    theme: 'dark',
    background: {
      type: 'Unsplash',
      default: true,
      class: 'bg-orange',
    },
    shortcuts: true,
    state: true,
    openLink: 'Self Tab',
    mode: 'Minimalist',
  }),

  actions: {
    loadSettings () {
      document.documentElement.setAttribute('data-theme', this.theme);
      document.title = this.tabName;
      this.changeBackground();
    },

    updateState() {
      this.state = !this.state;
    },

    setTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', this.theme)
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
          this.background.default ? '' : body.style.backgroundColor = this.background.color;
          body.className = '';
          break;
        case 'Gradient':
          if(this.background.default) {
            body.className = '';
            body.classList.add(this.background.class);
          } else {
            console.log('soon');
          }
          break;
        case 'Unsplash':
          body.className = '';
      }
    },

    changeShortcuts() {
      this.shortcuts = !this.shortcuts;
    },

    openLinkTab(url) {
      if(this.openLink == 'New Tab') {
        chrome.tabs.create({ url: url});
      } else if(this.openLink == 'Self Tab') {
        chrome.tabs.update({ url: url });
      }
    }
  },

  persist: {
    enable: true,
    storage: localStorage,
  }
})

export default useTabStore;
