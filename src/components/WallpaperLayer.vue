<template>
      <img
        ref="wallpaperElement"
        :crossorigin="backgroundCrossOrigin"
        sizes="100vw"
        :srcset="backgroundSrcSet || undefined"
        :src="backgroundImage"
        class="background"
        v-if="showImageBackground && backgroundImage"
        decoding="async"
        fetchpriority="high"
        @error="handleImageError"
      />
    <div class="credits" v-if="showCredits">
      <span class="credits__label">Photo</span> by
      <a :href="imageAuthorLink" target="_blank" rel="noopener noreferrer">{{ imageAuthor }}</a>
      on <a :href="imageLink" target="_blank" rel="noopener noreferrer">{{ imageLabel }}</a>
    </div>
</template>

<script>
import { inject } from 'vue';
import useTabStore from '../stores/useTabStore.js';
import { cancelRemoteTask, scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';
import { WALLPAPER_ELEMENT } from '../composables/useLogoContrast.js';
import { cacheWallpaperPreview, prewarmWallpaperPreview, removeWallpaperPreview } from '../services/wallpaperPreviewCache.js';

export default {
  setup() { return { wallpaperElement: inject(WALLPAPER_ELEMENT) }; },
  data() {
    const tabStore = useTabStore();
    const early = window.__midoriEarlyWallpaper;
    const initialWallpaper = early?.type === tabStore.background?.type ? early : null;
    return {
      tabStore, initialWallpaper,
      backgroundImage: '', backgroundSrcSet: '', backgroundCorsFallback: false,
      fullImageReady: false, resumeWhenVisible: false, resumeTimer: null, disposed: false,
      imageAuthor: '', imageAuthorLink: '', imageLink: '', marketplaceBlobUrl: '', localBlobUrl: '',
      backgroundRequestId: 0, backgroundController: null,
      refreshWallpaperListener: null, backgroundChangedListener: null, wallpaperVisibilityListener: null,
    };
  },
  computed: {
    backgroundCrossOrigin() {
        return !this.backgroundCorsFallback && /^https?:/.test(this.backgroundImage) ? 'anonymous' : undefined;
      },
    showImageBackground() {
        return ['Unsplash', 'MarketplaceWallpaper', 'LocalFolder'].includes(this.tabStore.background?.type);
      },
    showCredits() {
        return Boolean(this.showImageBackground && this.imageAuthor && this.imageAuthorLink && this.imageLink);
      },
    imageLabel() {
        return this.tabStore.background?.type === 'MarketplaceWallpaper' ? 'Marketplace' : 'Unsplash';
      }
  },
  mounted() {
    void this.restoreInitialPreview();
    this.scheduleInitialBackground();
    this.setupWallpaperRefresh();
  },
  beforeUnmount() {
    this.disposed = true;
    clearTimeout(this.resumeTimer);
    cancelRemoteTask('wallpaper');
    cancelRemoteTask('wallpaper-prewarm');
    cancelRemoteTask('unsplash-metadata');
    this.backgroundRequestId += 1;
    this.backgroundController?.abort();
    if (this.wallpaperVisibilityListener) document.removeEventListener('visibilitychange', this.wallpaperVisibilityListener);
    if (this.refreshWallpaperListener) window.removeEventListener('midori:refresh-wallpaper', this.refreshWallpaperListener);
    if (this.backgroundChangedListener) window.removeEventListener('midori:background-changed', this.backgroundChangedListener);
    this.releaseMarketplaceBlobUrl();
    this.releaseLocalBlobUrl();
  },
  methods: {
    async restoreInitialPreview() {
        const initial = this.initialWallpaper;
        if (!initial?.dataUrl) return;
        const decoded = await this.preloadImage(initial.dataUrl);
        if (this.disposed || this.initialWallpaper !== initial || this.backgroundImage
          || this.tabStore.background?.type !== initial.type) return;
        if (decoded) this.applyBackgroundImage(initial.dataUrl, '', { decoded, complete: false });
        else this.handleImageError();
      },
    scheduleInitialBackground() {
        const kind = this.tabStore.background?.type;
        if (kind === 'Unsplash' || kind === 'MarketplaceWallpaper') {
          void scheduleRemoteTask('wallpaper', signal => this.load({ signal }), { priority: 0 });
          this.wallpaperVisibilityListener = () => {
            if (document.visibilityState === 'visible' && !this.fullImageReady) {
              if (this.backgroundController?.signal.aborted) this.resumeWhenVisible = true;
              else void scheduleRemoteTask('wallpaper', signal => this.load({ signal }), { priority: 0 });
            }
          };
          document.addEventListener('visibilitychange', this.wallpaperVisibilityListener);
        } else void this.load();
      },
    async load({ signal } = {}) {
        // A preview prepared for the previous background must not keep downloading after it was replaced.
        cancelRemoteTask('wallpaper-prewarm');
        this.fullImageReady = false;
        this.resumeWhenVisible = false;
        clearTimeout(this.resumeTimer);
        this.resumeTimer = null;
        this.backgroundController?.abort();
        const controller = new AbortController();
        this.backgroundController = controller;
        const abort = () => controller.abort();
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) controller.abort();
        try {
          return await this.loadBackground({ signal: controller.signal });
        } finally {
          signal?.removeEventListener('abort', abort);
          if (this.backgroundController === controller) this.backgroundController = null;
          if (this.resumeWhenVisible && !this.disposed) {
            this.resumeWhenVisible = false;
            this.resumeTimer = setTimeout(() => {
              this.resumeTimer = null;
              if (!this.disposed && document.visibilityState === 'visible' && !this.fullImageReady) {
                void scheduleRemoteTask('wallpaper', signal => this.load({ signal }), { priority: 0 });
              }
            }, 0);
          }
        }
      },
    async loadBackground({ signal } = {}) {
        const requestId = ++this.backgroundRequestId;
        if (this.tabStore.background?.type === 'MarketplaceWallpaper') {
          const background = this.tabStore.background;
          this.releaseLocalBlobUrl();
          const { loadMarketplaceWallpaper } = await import('../services/MarketplaceWallpaperService.js');
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          await loadMarketplaceWallpaper(this, background, signal, requestId);
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          this.imageAuthor = background.authorName || '';
          this.imageAuthorLink = background.authorUrl || '';
          this.imageLink = background.sourceUrl || background.imageUrl || '';
          return;
        }

        this.releaseMarketplaceBlobUrl();

        if (this.tabStore.background?.type === 'LocalFolder') {
          await this.loadLocalWallpaper(requestId, signal);
          return;
        }

        this.releaseLocalBlobUrl();

        if (this.tabStore.background?.type !== 'Unsplash') {
          this.applyBackgroundImage('', '');
          this.imageAuthor = '';
          this.imageAuthorLink = '';
          this.imageLink = '';
          return;
        }

        try {
          const { default: UnsService } = await import('../services/UnsService.js');
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          const uns = new UnsService();
          const initial = this.initialWallpaper?.type === 'Unsplash' ? this.initialWallpaper : null;
          await uns.setImagen({ signal, preferredUrl: initial?.key || '', preferredImage: initial?.meta });
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          const decoded = await this.preloadImage(uns.getUrl(), signal, uns.getSrcSet?.() || '');
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          if (!decoded) return false;
          this.applyBackgroundImage(uns.getUrl(), uns.getSrcSet?.() || '', { decoded, cacheKey: uns.getUrl() });
          this.initialWallpaper = null;
          this.imageAuthor = uns.getAuthor();
          this.imageAuthorLink = uns.getAuthorLink();
          this.imageLink = uns.getImageLink();
          this.scheduleNextPreview(uns);
        } catch (e) {
          if (e?.name !== 'AbortError') console.error("Error al cargar la imagen de fondo:", e);
        }
      },
    scheduleNextPreview(uns) {
        void scheduleRemoteTask('wallpaper-prewarm', async signal => {
          const next = await uns.peekNext();
          if (!next || this.disposed || signal.aborted) return false;
          return prewarmWallpaperPreview(next.url, signal);
        }, { priority: -1, notBeforeMs: performance.now() + 2500 });
      },
    applyBackgroundImage(url, srcSet = '', options = {}) {
        const nextUrl = url || '';
        const nextSrcSet = srcSet || '';
        this.fullImageReady = Boolean(nextUrl && options.decoded && options.complete !== false);
        if (this.backgroundImage === nextUrl && this.backgroundSrcSet === nextSrcSet) {
          return;
        }
        this.backgroundCorsFallback = options.decoded?.crossOrigin !== 'anonymous';
        this.backgroundImage = nextUrl;
        this.backgroundSrcSet = nextSrcSet;
        if (options.decoded && options.cacheKey) {
          window.__midoriWallpaperKey = options.cacheKey;
          void cacheWallpaperPreview(options.cacheKey, options.decoded);
        }
      },
    handleImageError() {
        if ((this.backgroundImage && !this.backgroundImage.startsWith('data:image/')) || !this.initialWallpaper?.dataUrl) return;
        const { key, dataUrl } = this.initialWallpaper;
        removeWallpaperPreview(key);
        this.backgroundImage = '';
        this.initialWallpaper.dataUrl = '';
        const root = document.documentElement;
        if (root.style.getPropertyValue('--midori-start-background').includes(dataUrl)) {
          root.style.removeProperty('--midori-start-background');
        }
      },
    releaseMarketplaceBlobUrl() {
        if (this.marketplaceBlobUrl && this.marketplaceBlobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.marketplaceBlobUrl);
        }
        this.marketplaceBlobUrl = '';
      },
    releaseLocalBlobUrl() {
        if (this.localBlobUrl && this.localBlobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(this.localBlobUrl);
        }
        this.localBlobUrl = '';
      },
    async loadLocalWallpaper(requestId, signal) {
        this.imageAuthor = '';
        this.imageAuthorLink = '';
        this.imageLink = '';

        const previousBlobUrl = this.localBlobUrl;
        try {
          const { default: LocalWallpaperService } = await import('../services/LocalWallpaperService.js');
          const service = new LocalWallpaperService();
          await service.setImagen();
          const url = service.getUrl();
          if (signal?.aborted || requestId !== this.backgroundRequestId) {
            if (url.startsWith('blob:')) URL.revokeObjectURL(url);
            return;
          }
          if (url) {
            const decoded = await this.preloadImage(url, signal);
            if (signal?.aborted || requestId !== this.backgroundRequestId) {
              URL.revokeObjectURL(url);
              return;
            }
            if (!decoded) { URL.revokeObjectURL(url); return; }
            this.localBlobUrl = url;
            this.applyBackgroundImage(url, '', { decoded });
          } else {
            this.localBlobUrl = '';
            this.applyBackgroundImage('', '');
          }
        } catch (error) {
          console.warn('Local wallpaper load failed', error);
        } finally {
          if (previousBlobUrl && previousBlobUrl !== this.localBlobUrl && previousBlobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(previousBlobUrl);
          }
        }
      },
    async preloadImage(url, signal, srcSet = '', allowCorsFallback = true) {
        if (!url || signal?.aborted) return null;
        const anonymous = /^https?:/.test(url) && allowCorsFallback;
        let timedOut = false;
        const image = await new Promise((resolve) => {
          const img = new Image();
          if (anonymous) img.crossOrigin = 'anonymous';
          img.decoding = 'async';
          img.fetchPriority = 'high';
          let settled = false;
          const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
            img.onload = null;
            img.onerror = null;
            resolve(value);
          };
          const onAbort = () => { img.removeAttribute('srcset'); img.src = ''; finish(null); };
          const timeout = setTimeout(() => { timedOut = true; onAbort(); }, 8000);
          signal?.addEventListener('abort', onAbort, { once: true });
          img.onload = async () => {
            try {
              await img.decode();
              finish(signal?.aborted ? null : img);
            } catch { finish(null); }
          };
          img.onerror = () => finish(null);
          img.sizes = '100vw';
          if (srcSet) img.srcset = srcSet;
          img.src = url;
        });
        if (!image && anonymous && !timedOut && !signal?.aborted) return this.preloadImage(url, signal, srcSet, false);
        return image;
      },
    setupWallpaperRefresh() {
        const listener = () => {
          if (['Unsplash', 'LocalFolder'].includes(this.tabStore.background?.type)) {
            this.initialWallpaper = null;
            this.load();
          }
        };
        this.refreshWallpaperListener = listener;
        window.addEventListener('midori:refresh-wallpaper', listener);

        this.backgroundChangedListener = () => { this.initialWallpaper = null; this.load(); };
        window.addEventListener('midori:background-changed', this.backgroundChangedListener);
      }
  },
};
</script>

<style scoped>
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

@media (max-width: 1200px) {
  .credits {
    position: relative;
    bottom: auto;
    left: auto;
    display: table;
    max-width: calc(100% - 1.5rem);
    margin: 0 0.75rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
