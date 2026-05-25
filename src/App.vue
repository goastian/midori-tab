<template>
  <div class="viewport" :class="{ 'bg-cl' : tabStore.effectiveTheme !== 'light' }">
    <div class="background-skeleton" v-if="showImageBackground && !imageReady"></div>
    <Transition name="bg-fade">
      <img
        :src="backgroundImage"
        :srcset="backgroundSrcSet || undefined"
        sizes="100vw"
        class="background"
        v-if="showImageBackground && backgroundImage"
        v-show="imageReady"
        decoding="async"
        fetchpriority="low"
        @load="imageReady = true"
      />
    </Transition>
    <div class="credits" v-if="showCredits">
      <span class="credits__label">Photo</span> by 
      <a :href="imageAuthorLink" target="_blank" rel="noopener noreferrer">{{ imageAuthor }}</a> 
      on <a :href="imageLink" target="_blank" rel="noopener noreferrer">{{ imageLabel }}</a>
    </div>
    <SpaceSwitcher />
    <Minimalist />
    <SettingsModal v-if="tabStore.state" />
    <SmartSuggestions v-if="renderSmartSuggestions" />
    <OmniLauncher
      v-if="renderOmniLauncher"
      :enable-global-triggers="false"
    />

    <Teleport to="body">
      <Transition name="update-toast">
        <aside
            v-if="updateNotice.visible"
          class="update-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div class="update-toast__badge">Midori</div>
          <h3 class="update-toast__title">{{ updateTitle }}</h3>
          <p class="update-toast__message">{{ updateMessage }}</p>
          <div class="update-toast__actions">
            <button type="button" class="update-toast__button update-toast__button--primary" @click="handleDownloadUpdate">
              {{ i18n.$t('updateNotice.download') }}
            </button>
            <button type="button" class="update-toast__button update-toast__button--secondary" @click="deferUpdateForToday">
              {{ i18n.$t('updateNotice.defer') }}
            </button>
          </div>
        </aside>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
  import { defineAsyncComponent, markRaw, nextTick } from 'vue';
  import { APP_VERSION } from './utils/appVersion.js';
  import { getBrowserInfo } from './utils/browserInfo.js';
  import MidoriUpdateService from './services/MidoriUpdateService.js';
  import useI18nStore from './stores/useI18nStore.js';
  import useTabStore from './stores/useTabStore.js';
  import UnsService from './services/UnsService.js';
  import Minimalist from './pages/Min.vue';
  import SpaceSwitcher from './components/SpaceSwitcher.vue';
  import { useAutoTheme } from './composables/useAutoTheme.js';
  import useThemeStore from './stores/useThemeStore.js';

  const MIDORI_DOWNLOAD_URL = 'https://astian.org/midori-browser/download';
  const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000;
  const UPDATE_ERROR_RETRY_INTERVAL_MS = 2 * 60 * 1000;
  const UPDATE_FOREGROUND_DEBOUNCE_MS = 15 * 1000;

  export default {
    data() {
      return {
        loaded: true,
        backgroundImage: "",
        backgroundSrcSet: "",
        imageReady: false,
        tabStore: useTabStore(),
        i18n: useI18nStore(),
        refreshWallpaperListener: null,
        backgroundChangedListener: null,
        renderSmartSuggestions: false,
        renderOmniLauncher: false,
        omniKeydownListener: null,
        omniRuntimeMessageListener: null,
        imageAuthor: "",
        imageAuthorLink: "",
        imageLink: "",
        autoTheme: null,
        updateCheckIntervalId: null,
        updateForegroundListener: null,
        lastForegroundUpdateCheckAt: 0,
        updateService: markRaw(new MidoriUpdateService({
          checkIntervalMs: UPDATE_CHECK_INTERVAL_MS,
          errorRetryIntervalMs: UPDATE_ERROR_RETRY_INTERVAL_MS,
        })),
        updateNotice: {
          visible: false,
          latestVersion: '',
        },
      }
    },

    components: {
      Minimalist,
      SettingsModal: defineAsyncComponent(() => import('./components/SettingsModal.vue')),
      SpaceSwitcher,
      SmartSuggestions: defineAsyncComponent(() => import('./components/SmartSuggestions.vue')),
      OmniLauncher: defineAsyncComponent(() => import('./omni/components/OmniLauncher.vue')),
    },

    computed: {
      showImageBackground() {
        return ['Unsplash', 'MarketplaceWallpaper'].includes(this.tabStore.background?.type);
      },

      showCredits() {
        return Boolean(this.showImageBackground && this.imageAuthor && this.imageAuthorLink && this.imageLink);
      },

      imageLabel() {
        return this.tabStore.background?.type === 'MarketplaceWallpaper' ? 'Marketplace' : 'Unsplash';
      },

      updateTitle() {
        return this.i18n.$t('updateNotice.title');
      },

      updateMessage() {
        const template = this.i18n.$t('updateNotice.message');
        return String(template).replace('{version}', this.updateNotice.latestVersion || '');
      },
    },

    mounted() {
      this.load();
      this.loadSettings();
      this.setupWallpaperRefresh();
      this.setupDeferredMounts();
      this.setupOmniLazyTriggers();
      this.setupUpdateForegroundChecks();

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
      if (this.backgroundChangedListener) {
        window.removeEventListener('midori:background-changed', this.backgroundChangedListener);
      }
      // Detener auto theme
      if (this.autoTheme) {
        this.autoTheme.stop();
      }
      if (this.updateCheckIntervalId) {
        clearInterval(this.updateCheckIntervalId);
        this.updateCheckIntervalId = null;
      }
      if (this.updateForegroundListener) {
        window.removeEventListener('focus', this.updateForegroundListener);
        document.removeEventListener('visibilitychange', this.updateForegroundListener);
        this.updateForegroundListener = null;
      }
      if (this.omniKeydownListener) {
        window.removeEventListener('keydown', this.omniKeydownListener);
        this.omniKeydownListener = null;
      }
      if (this.omniRuntimeMessageListener) {
        try {
          chrome.runtime.onMessage.removeListener(this.omniRuntimeMessageListener);
        } catch (_) { /* noop */ }
        this.omniRuntimeMessageListener = null;
      }
    },

    methods: {
      loadSettings() {
        this.tabStore.loadSettings();
      },

      async load() {
        if (this.tabStore.background?.type === 'MarketplaceWallpaper') {
          const background = this.tabStore.background;
          this.applyBackgroundImage(background.imageUrl || '', background.imageSrcSet || '');
          this.imageAuthor = background.authorName || '';
          this.imageAuthorLink = background.authorUrl || '';
          this.imageLink = background.sourceUrl || background.imageUrl || '';
          return;
        }

        if (this.tabStore.background?.type !== 'Unsplash') {
          this.applyBackgroundImage('', '');
          this.imageAuthor = '';
          this.imageAuthorLink = '';
          this.imageLink = '';
          return;
        }

        try {
          const uns = new UnsService();
          await uns.setImagen();
          this.applyBackgroundImage(uns.getUrl(), uns.getSrcSet?.() || '');
          this.imageAuthor = uns.getAuthor();
          this.imageAuthorLink = uns.getAuthorLink();
          this.imageLink = uns.getImageLink();
        } catch (e) {
          console.error("Error al cargar la imagen de fondo:", e);
        }
      },

      applyBackgroundImage(url, srcSet = '') {
        const nextUrl = url || '';
        const nextSrcSet = srcSet || '';
        if (this.backgroundImage === nextUrl && this.backgroundSrcSet === nextSrcSet) {
          return;
        }
        this.imageReady = false;
        this.backgroundImage = nextUrl;
        this.backgroundSrcSet = nextSrcSet;
      },

      setupDeferredMounts() {
        const enable = async () => {
          this.renderSmartSuggestions = true;
          await this.checkMidoriUpdate();
          this.startMidoriUpdatePolling();
        };
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          window.requestIdleCallback(enable, { timeout: 1000 });
        } else {
          setTimeout(enable, 400);
        }
      },

      setupWallpaperRefresh() {
        const listener = () => {
          if (this.tabStore.background?.type === 'Unsplash') {
            this.load();
          }
        };
        this.refreshWallpaperListener = listener;
        window.addEventListener('midori:refresh-wallpaper', listener);

        this.backgroundChangedListener = () => this.load();
        window.addEventListener('midori:background-changed', this.backgroundChangedListener);
      },

      setupOmniLazyTriggers() {
        const openOmni = async ({ toggle = false } = {}) => {
          this.renderOmniLauncher = true;
          const [{ useOmniStore }] = await Promise.all([
            import('./stores/useOmniStore.js'),
            nextTick(),
          ]);
          const omniStore = useOmniStore();
          if (toggle) {
            omniStore.toggle();
          } else {
            omniStore.open();
          }
        };

        const keydownListener = (event) => {
          const isMac = navigator.platform.toUpperCase().includes('MAC');
          const mod = isMac ? event.metaKey : event.ctrlKey;
          if (mod && !event.shiftKey && event.key.toLowerCase() === 'k') {
            event.preventDefault();
            void openOmni({ toggle: true });
          }
        };

        const runtimeMessageListener = (message) => {
          if (message?.request === 'open-omni') {
            void openOmni({ toggle: true });
          }
        };

        this.omniKeydownListener = keydownListener;
        this.omniRuntimeMessageListener = runtimeMessageListener;
        window.addEventListener('keydown', keydownListener);
        try {
          chrome.runtime.onMessage.addListener(runtimeMessageListener);
        } catch (_) { /* not in extension context */ }
      },

      setupUpdateForegroundChecks() {
        const listener = () => {
          if (document.visibilityState === 'hidden') {
            return;
          }

          const now = Date.now();
          if (now - this.lastForegroundUpdateCheckAt < UPDATE_FOREGROUND_DEBOUNCE_MS) {
            return;
          }

          this.lastForegroundUpdateCheckAt = now;
          this.checkMidoriUpdate();
        };

        this.updateForegroundListener = listener;
        window.addEventListener('focus', listener);
        document.addEventListener('visibilitychange', listener);
      },

      startMidoriUpdatePolling() {
        if (this.updateCheckIntervalId) {
          clearInterval(this.updateCheckIntervalId);
        }

        this.updateCheckIntervalId = setInterval(() => {
          this.checkMidoriUpdate();
        }, UPDATE_CHECK_INTERVAL_MS);
      },

      async checkMidoriUpdate() {
        try {
          const browserInfo = getBrowserInfo();
          const result = await this.updateService.checkForUpdate({
            browserInfo,
            currentVersion: APP_VERSION,
          });

          if (result.eligible) {
            this.updateNotice = {
              visible: true,
              latestVersion: result.latestVersion || '',
            };
          } else if (!result.deferredToday) {
            this.updateNotice = {
              visible: false,
              latestVersion: result.latestVersion || '',
            };
          }
        } catch (error) {
          console.warn('Midori update check failed:', error);
        }
      },

      deferUpdateForToday() {
        this.updateNotice.visible = false;
        this.updateService.deferForToday();
      },

      async handleDownloadUpdate() {
        try {
          const extensionApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
          if (extensionApi?.tabs?.create) {
            await extensionApi.tabs.create({ url: MIDORI_DOWNLOAD_URL });
          } else {
            window.open(MIDORI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          window.open(MIDORI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
        } finally {
          this.deferUpdateForToday();
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
  overflow-x: hidden;
  background: transparent;
}

.viewport::after {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -2;
  pointer-events: none;
  background: rgba(8, 13, 20, 0.16);
}

:root[data-theme='light'] .viewport::after {
  background: rgba(232, 237, 235, 0.08);
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

.background-skeleton {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -3;
  pointer-events: none;
  background: linear-gradient(110deg, #0c1219 30%, #162028 50%, #0c1219 70%);
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
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

.bg-fade-enter-active {
  transition: opacity 0.4s ease;
}
.bg-fade-enter-from {
  opacity: 0;
}

.credits {
  position: fixed;
  bottom: 0.75rem;
  left: 0.75rem;
  font-size: .75rem;
  color: var(--color-text-muted, #7A9B8D);
  background-color: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: .35rem .55rem;
  border-radius: var(--nova-control-radius, 8px);
  z-index: 3;
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
}

.credits__label {
  color: var(--color-text, #C4F0E0);
  font-weight: 600;
}

.credits a {
  color: var(--color-text-secondary, #7EC4A8);
  text-decoration: underline;
}

.logo {
  width: 300px;
}

.update-toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: min(92vw, 360px);
  z-index: 50;
  background: var(--surface-island, rgba(0, 61, 47, 0.94));
  border: 1px solid var(--color-border-strong, rgba(126, 196, 168, 0.45));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: var(--shadow-floating, 0 8px 24px rgba(0, 0, 0, 0.18));
  padding: 0.9rem 0.95rem;
  color: #e6fff7;
}

.update-toast__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  background: rgba(0, 184, 148, 0.18);
  border: 1px solid rgba(0, 184, 148, 0.35);
  margin-bottom: 0.55rem;
}

.update-toast__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
}

.update-toast__message {
  margin: 0.5rem 0 0;
  font-size: 0.84rem;
  line-height: 1.35;
  color: rgba(230, 255, 247, 0.92);
}

.update-toast__actions {
  margin-top: 0.8rem;
  display: flex;
  gap: 0.55rem;
}

.update-toast__button {
  flex: 1;
  border-radius: var(--nova-control-radius, 8px);
  border: 1px solid transparent;
  padding: 0.5rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.update-toast__button:hover {
  transform: translateY(-1px);
}

.update-toast__button:focus-visible {
  outline: 2px solid var(--midori-300);
  outline-offset: 2px;
}

.update-toast__button--primary {
  background: #00b894;
  border-color: rgba(255, 255, 255, 0.15);
  color: #08261f;
}

.update-toast__button--secondary {
  background: rgba(2, 20, 15, 0.45);
  border-color: rgba(126, 196, 168, 0.45);
  color: #dafbf0;
}

.update-toast-enter-active,
.update-toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.update-toast-enter-from,
.update-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 600px) {
  .update-toast {
    top: auto;
    bottom: 0.8rem;
    left: 0.8rem;
    right: 0.8rem;
    width: auto;
  }
}
</style>
