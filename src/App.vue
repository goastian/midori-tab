<template>
  <div class="viewport" :class="{ 'bg-cl' : tabStore.effectiveTheme !== 'light' }">
    <img :src="backgroundImage" class="background" v-if="tabStore.background.type == 'Unsplash'" />
    <div class="credits" v-if="tabStore.background.type == 'Unsplash'">
      📷 Photo by 
      <a :href="imageAuthorLink" target="_blank" rel="noopener noreferrer">{{ imageAuthor }}</a> 
      on <a :href="imageLink" target="_blank" rel="noopener noreferrer">Unsplash</a>
    </div>
    <SpaceSwitcher />
    <Minimalist />
    <SettingsModal v-if="tabStore.state" />
    <SmartSuggestions v-if="renderSmartSuggestions" />
    <OnboardingModal v-if="showOnboarding" @close="completeOnboarding" />
  </div>
</template>

<script>
  import { defineAsyncComponent } from 'vue';
  import useTabStore from './stores/useTabStore.js';
  import UnsService from './services/UnsService.js';
  import SpaceSwitcher from './components/SpaceSwitcher.vue';
  import { useAutoTheme } from './composables/useAutoTheme.js';
  import useThemeStore from './stores/useThemeStore.js';

  export default {
    data() {
      return {
        loaded: true,
        backgroundImage: "",
        tabStore: useTabStore(),
        refreshWallpaperListener: null,
        showOnboarding: false,
        renderSmartSuggestions: false,
        imageAuthor: "",
        imageAuthorLink: "",
        imageLink: "",
        autoTheme: null,
      }
    },

    components: {
      Minimalist: defineAsyncComponent(() => import('./pages/Min.vue')),
      SettingsModal: defineAsyncComponent(() => import('./components/SettingsModal.vue')),
      SpaceSwitcher,
      SmartSuggestions: defineAsyncComponent(() => import('./components/SmartSuggestions.vue')),
      OnboardingModal: defineAsyncComponent(() => import('./components/OnboardingModal.vue')),
    },

    mounted() {
      this.load();
      this.loadSettings();
      this.setupWallpaperRefresh();
      this.setupOnboarding();
      this.setupDeferredMounts();

      // Apply active theme colors
      const themeStore = useThemeStore();
      themeStore.applyTheme(this.tabStore.theme);

      // Auto Theme
      if (this.tabStore.autoTheme) {
        this.autoTheme = useAutoTheme();
        this.autoTheme.start();
      }
    },

    beforeUnmount() {
      // Limpiar event listeners
      if (this.refreshWallpaperListener) {
        window.removeEventListener('midori:refresh-wallpaper', this.refreshWallpaperListener);
      }
      // Detener auto theme
      if (this.autoTheme) {
        this.autoTheme.stop();
      }
    },

    methods: {
      loadSettings() {
        this.tabStore.loadSettings();
      },

      async load() {
        try {
          const uns = new UnsService();
          await uns.setImagen();
          this.backgroundImage = uns.getUrl();
          this.imageAuthor = uns.getAuthor();
          this.imageAuthorLink = uns.getAuthorLink();
          this.imageLink = uns.getImageLink();
        } catch (e) {
          console.error("Error al cargar la imagen de fondo:", e);
        }
      },

      setupDeferredMounts() {
        const enable = () => {
          this.renderSmartSuggestions = true;
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(enable, { timeout: 1000 });
        } else {
          setTimeout(enable, 400);
        }
      },

      setupWallpaperRefresh() {
        const listener = () => this.load();
        this.refreshWallpaperListener = listener;
        window.addEventListener('midori:refresh-wallpaper', listener);
      },

      setupOnboarding() {
        try {
          const done = localStorage.getItem('midori_onboarding_done') === '1';
          this.showOnboarding = !done;
        } catch (e) {
          this.showOnboarding = false;
        }
      },

      completeOnboarding() {
        this.showOnboarding = false;
        try {
          localStorage.setItem('midori_onboarding_done', '1');
        } catch (e) {
        }
      },

    }
  }
</script>

<style scoped>
.viewport {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  display: flex;
  position: relative;
}

.container {
  width: 100%;
  min-height: 100vh;
  padding: 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header {
  width: 100%;
  height: 10%;
  display: flex;
  justify-content: end;
  align-items: center;
}

.main {
  height: 80%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -3;
  object-fit: cover;
  pointer-events: none;
}

.credits {
  position: fixed;
  bottom: 0;
  left: 0;
  font-size: .75rem;
  color: var(--color-text-muted, #7A9B8D);
  background-color: var(--surface-raised, #0F1520);
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-right: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: .35rem .6rem;
  border-radius: 0 var(--radius-sm, 6px) 0 0;
  z-index: 3;
}

.credits a {
  color: var(--color-text-secondary, #7EC4A8);
  text-decoration: underline;
}

.logo {
  width: 300px;
}
</style>
