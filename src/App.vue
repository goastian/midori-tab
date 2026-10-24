<template>
  <div class="viewport" :class="{ 'bg-cl' : tabStore.effectiveTheme !== 'light' }">
    <Minimalist />
    <aside v-if="storageError" class="storage-error" role="alert">
      <span>{{ i18n.locale === 'es' ? 'No se pudieron guardar los cambios. Libera espacio y vuelve a intentarlo.' : 'Changes could not be saved. Free storage space and try again.' }}</span>
      <button type="button" :aria-label="i18n.locale === 'es' ? 'Cerrar aviso' : 'Dismiss notice'" @click="storageError = false">×</button>
    </aside>
    <WallpaperLayer v-if="featuresReady && showImageBackground" />
    <SettingsModal v-if="tabStore.state" />
    <SmartSuggestions v-if="renderSmartSuggestions" ref="smartSuggestions" />
    <OmniLauncher
      v-if="renderOmniLauncher"
      :enable-global-triggers="false"
    />

    <MidoriUpdateNotice v-if="featuresReady" />
  </div>
</template>

<script>
import { defineAsyncComponent, nextTick, provide, shallowRef } from 'vue';
import useI18nStore from './stores/useI18nStore.js';
import useTabStore from './stores/useTabStore.js';
import Minimalist from './pages/Min.vue';
import { WALLPAPER_ELEMENT } from './composables/useLogoContrast.js';

function hasSavedSuggestions() {
  try {
    const raw = localStorage.getItem('suggestionsStore');
    if (!raw) return false;
    if (raw.length > 65536) return true;
    const state = JSON.parse(raw);
    if (!state || !Array.isArray(state.habits)) return true;
    return state.enabled !== false && state.habits.length > 0;
  } catch { return true; }
}

export default {
  setup() {
    const wallpaperElement = shallowRef(null);
    provide(WALLPAPER_ELEMENT, wallpaperElement);
    return { wallpaperElement };
  },
  components: {
    Minimalist,
    SettingsModal: defineAsyncComponent(() => import('./components/SettingsModal.vue')),
    SmartSuggestions: defineAsyncComponent(() => import('./components/SmartSuggestions.vue')),
    OmniLauncher: defineAsyncComponent(() => import('./omni/components/OmniLauncher.vue')),
    WallpaperLayer: defineAsyncComponent(() => import('./components/WallpaperLayer.vue')),
    MidoriUpdateNotice: defineAsyncComponent(() => import('./components/MidoriUpdateNotice.vue')),
  },
  data() {
    return {
      tabStore: useTabStore(), i18n: useI18nStore(),
      featuresReady: false, renderSmartSuggestions: false, renderOmniLauncher: false,
      omniKeydownListener: null, omniRuntimeMessageListener: null, autoTheme: null,
      storageError: Boolean(window.__midoriStorageError), storageErrorListener: null,
      suggestionsStorageListener: null,
      deferredMountHandle: null, deferredMountKind: '', interactionListener: null, disposed: false,
    };
  },
  computed: { showImageBackground() {
        return ['Unsplash', 'MarketplaceWallpaper', 'LocalFolder'].includes(this.tabStore.background?.type);
      } },
  async mounted() {
    this.storageErrorListener = () => { this.storageError = true; };
    window.addEventListener('midori:storage-error', this.storageErrorListener);
    this.suggestionsStorageListener = event => {
      if (event.storageArea === localStorage && (event.key === 'suggestionsStore' || event.key === null)) {
        void this.refreshSmartSuggestions();
      }
    };
    window.addEventListener('storage', this.suggestionsStorageListener);
    this.tabStore.loadSettings();
    this.setupDeferredMounts();
    this.setupOmniLazyTriggers();
    if (this.tabStore.autoTheme) {
      const { useAutoTheme } = await import('./composables/useAutoTheme.js');
      if (this.disposed) return;
      this.autoTheme = useAutoTheme();
      this.autoTheme.start();
    }
  },
  beforeUnmount() {
    this.disposed = true;
    if (this.deferredMountHandle !== null) {
      if (this.deferredMountKind === 'idle') window.cancelIdleCallback?.(this.deferredMountHandle);
      else clearTimeout(this.deferredMountHandle);
    }
    if (this.interactionListener) window.removeEventListener('midori:perf-mark', this.interactionListener);
    if (this.storageErrorListener) window.removeEventListener('midori:storage-error', this.storageErrorListener);
    if (this.suggestionsStorageListener) window.removeEventListener('storage', this.suggestionsStorageListener);
    this.autoTheme?.stop();
    if (this.omniKeydownListener) window.removeEventListener('keydown', this.omniKeydownListener);
    if (this.omniRuntimeMessageListener) {
      try { chrome.runtime.onMessage.removeListener(this.omniRuntimeMessageListener); } catch { /* Not an extension context. */ }
    }
  },
  methods: {
    async refreshSmartSuggestions() {
      if (!this.featuresReady || this.disposed) return;
      const store = this.$refs.smartSuggestions?.suggestionsStore;
      store?.$hydrate?.();
      this.renderSmartSuggestions = hasSavedSuggestions();
      if (!store) {
        await nextTick();
        this.$refs.smartSuggestions?.suggestionsStore?.$hydrate?.();
      }
    },
    setupDeferredMounts() {
      const schedule = () => {
        if (this.interactionListener) window.removeEventListener('midori:perf-mark', this.interactionListener);
        this.interactionListener = null;
        const enable = () => {
          this.deferredMountHandle = null;
          if (this.disposed) return;
          this.featuresReady = true;
          this.renderSmartSuggestions = hasSavedSuggestions();
        };
        if ('requestIdleCallback' in window) {
          this.deferredMountKind = 'idle';
          this.deferredMountHandle = window.requestIdleCallback(enable, { timeout: 1000 });
        } else {
          this.deferredMountKind = 'timeout';
          this.deferredMountHandle = setTimeout(enable, 0);
        }
      };
      if (Number.isFinite(window.__midoriPerf?.marks?.['interaction-ready'])) schedule();
      else {
        this.interactionListener = event => { if (event.detail?.name === 'interaction-ready') schedule(); };
        window.addEventListener('midori:perf-mark', this.interactionListener);
      }
    },
    setupOmniLazyTriggers() {
        const openOmni = async ({ toggle = false } = {}) => {
          if (this.disposed) return;
          this.renderOmniLauncher = true;
          const [{ useOmniStore }] = await Promise.all([
            import('./stores/useOmniStore.js'),
            nextTick(),
          ]);
          if (this.disposed) return;
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
          if (message?.request === 'open-omni' || message?.request === 'open-omni-page') {
            void openOmni({ toggle: true });
          }
        };

        this.omniKeydownListener = keydownListener;
        this.omniRuntimeMessageListener = runtimeMessageListener;
        window.addEventListener('keydown', keydownListener);
        try {
          chrome.runtime.onMessage.addListener(runtimeMessageListener);
        } catch (_) { /* not in extension context */ }
      }
  },
};
</script>

<style scoped>

.storage-error {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  z-index: 190;
  display: flex;
  align-items: center;
  gap: 1rem;
  width: min(36rem, calc(100vw - 2rem));
  padding: 0.85rem 1rem;
  transform: translateX(-50%);
  border: 1px solid var(--accent-danger);
  border-radius: var(--radius-md);
  color: var(--color-text);
  background: var(--surface-raised);
  box-shadow: var(--shadow-xl);
}
.storage-error button {
  margin-left: auto;
  border: 0;
  color: inherit;
  background: transparent;
  font-size: 1.4rem;
  cursor: pointer;
}
.viewport {
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  display: block;
  position: relative;
  isolation: isolate;
  overflow-x: clip;
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

</style>
