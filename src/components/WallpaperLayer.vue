<template>
    <div class="background-skeleton" v-if="showImageBackground && !backgroundImage"></div>
    <Transition name="bg-fade">
      <img
        ref="wallpaperElement"
        :key="backgroundCrossOrigin || 'default'"
        :crossorigin="backgroundCrossOrigin"
        :src="backgroundImage"
        :srcset="backgroundSrcSet || undefined"
        sizes="100vw"
        class="background"
        v-if="showImageBackground && backgroundImage"
        v-show="imageReady"
        decoding="async"
        fetchpriority="high"
        @load="imageReady = true"
        @error="retryBackgroundWithoutCors"
      />
    </Transition>
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

export default {
  setup() { return { wallpaperElement: inject(WALLPAPER_ELEMENT) }; },
  data() {
    return {
      tabStore: useTabStore(),
      backgroundImage: '', backgroundSrcSet: '', backgroundCorsFallback: false, imageReady: false,
      imageAuthor: '', imageAuthorLink: '', imageLink: '', marketplaceBlobUrl: '', localBlobUrl: '',
      backgroundRequestId: 0, backgroundController: null,
      refreshWallpaperListener: null, backgroundChangedListener: null, wallpaperVisibilityListener: null,
    };
  },
  computed: {
    backgroundCrossOrigin() {
        return !this.backgroundCorsFallback && this.isUnsplashImage(this.backgroundImage) ? 'anonymous' : undefined;
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
    this.scheduleInitialBackground();
    this.setupWallpaperRefresh();
  },
  beforeUnmount() {
    cancelRemoteTask('wallpaper');
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
    scheduleInitialBackground() {
        const kind = this.tabStore.background?.type;
        if (kind === 'Unsplash' || kind === 'MarketplaceWallpaper') {
          void scheduleRemoteTask('wallpaper', signal => this.load({ signal }), { priority: 0 });
          this.wallpaperVisibilityListener = () => {
            if (document.visibilityState === 'visible' && !this.backgroundImage) {
              void scheduleRemoteTask('wallpaper', signal => this.load({ signal }), { priority: 0 });
            }
          };
          document.addEventListener('visibilitychange', this.wallpaperVisibilityListener);
        } else void this.load();
      },
    async load({ signal } = {}) {
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
        }
      },
    async loadBackground({ signal } = {}) {
        const requestId = ++this.backgroundRequestId;
        if (this.tabStore.background?.type === 'MarketplaceWallpaper') {
          const background = this.tabStore.background;
          this.releaseLocalBlobUrl();
          await this.loadMarketplaceWallpaper(background, signal, requestId);
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
          await uns.setImagen({ signal });
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          await this.preloadImage(uns.getUrl(), signal);
          if (signal?.aborted || requestId !== this.backgroundRequestId) return false;
          this.applyBackgroundImage(uns.getUrl(), uns.getSrcSet?.() || '');
          this.imageAuthor = uns.getAuthor();
          this.imageAuthorLink = uns.getAuthorLink();
          this.imageLink = uns.getImageLink();
        } catch (e) {
          if (e?.name !== 'AbortError') console.error("Error al cargar la imagen de fondo:", e);
        }
      },
    applyBackgroundImage(url, srcSet = '', options = {}) {
        const nextUrl = url || '';
        const nextSrcSet = srcSet || '';
        const immediate = Boolean(options.immediate);
        if (this.backgroundImage === nextUrl && this.backgroundSrcSet === nextSrcSet) {
          if (immediate && !this.imageReady) {
            this.imageReady = true;
          }
          return;
        }
        this.imageReady = immediate;
        this.backgroundCorsFallback = false;
        this.backgroundImage = nextUrl;
        this.backgroundSrcSet = nextSrcSet;
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
            this.localBlobUrl = url;
            await this.preloadImage(url, signal);
            if (signal?.aborted || requestId !== this.backgroundRequestId) {
              URL.revokeObjectURL(url);
              if (this.localBlobUrl === url) this.localBlobUrl = previousBlobUrl;
              return;
            }
            this.applyBackgroundImage(url, '');
          } else {
            this.localBlobUrl = '';
            this.applyBackgroundImage('', '');
          }
        } catch (error) {
          console.warn('Local wallpaper load failed', error);
          if (!signal?.aborted && requestId === this.backgroundRequestId) {
            this.localBlobUrl = '';
            this.applyBackgroundImage('', '');
          }
        } finally {
          if (previousBlobUrl && previousBlobUrl !== this.localBlobUrl && previousBlobUrl.startsWith('blob:')) {
            URL.revokeObjectURL(previousBlobUrl);
          }
        }
      },
    isMarketplaceDownloadUrl(url) {
        return typeof url === 'string' && /\/api\/v1\/assets\/[^/]+\/download(?:$|\?)/.test(url);
      },
    isUnsplashImage(url) {
        try { return new URL(url).hostname === 'images.unsplash.com'; } catch { return false; }
      },
    retryBackgroundWithoutCors() {
        if (this.backgroundCrossOrigin) this.backgroundCorsFallback = true;
      },
    async preloadImage(url, signal) {
        if (!url) return;

        await new Promise((resolve) => {
          const img = new Image();
          if (this.isUnsplashImage(url)) img.crossOrigin = 'anonymous';
          img.decoding = 'async';
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener('abort', onAbort);
            img.onload = null;
            img.onerror = null;
            resolve();
          };
          const onAbort = () => { img.src = ''; finish(); };
          if (signal?.aborted) { resolve(); return; }
          const timeout = setTimeout(onAbort, 8000);
          signal?.addEventListener('abort', onAbort, { once: true });
          img.onload = finish;
          img.onerror = finish;
          img.src = url;
        });
      },
    async resolveMarketplaceDownloadImage(downloadUrl, assetSlug, signal) {
        try {
          const { fetchBlobWithTimeout } = await import('../services/fetchJsonWithTimeout.js');
          if (typeof caches !== 'undefined') {
            const cache = await caches.open('midori-marketplace-wallpapers-v1');
            const request = new Request(downloadUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
            let response = await cache.match(request);
            const cached = Boolean(response);
            let blob;

            if (!response) {
              ({ response, payload: blob } = await fetchBlobWithTimeout(request, { signal, timeoutMs: 8000 }));
            }

            if (!response?.ok) {
              return '';
            }

            const responseContentType = response.headers?.get('content-type') || '';
            if (!responseContentType.includes('image/')) {
              return '';
            }

            blob ||= await response.blob();
            if (!blob || !blob.type?.startsWith('image/') || blob.size > 8 * 1024 * 1024 || signal?.aborted) {
              await cache.delete(request);
              return '';
            }
            try {
              if (cached) await cache.delete(request);
              await cache.put(request, new Response(blob, { headers: { 'content-type': blob.type } }));
              const keys = await cache.keys();
              for (const old of keys.slice(0, Math.max(0, keys.length - 8))) await cache.delete(old);
            } catch (error) {
              console.warn('Marketplace wallpaper cache unavailable', error);
            }
            return URL.createObjectURL(blob);
          }

          const { response, payload: blob } = await fetchBlobWithTimeout(downloadUrl, {
            mode: 'cors', credentials: 'omit', signal, timeoutMs: 8000,
          });
          if (!response.ok) {
            return '';
          }

          if (!blob || !blob.type?.startsWith('image/') || blob.size > 8 * 1024 * 1024 || signal?.aborted) {
            return '';
          }

          return URL.createObjectURL(blob);
        } catch (error) {
          if (error?.name !== 'AbortError' && !signal?.aborted) console.warn('Marketplace wallpaper fallback failed', { assetSlug, error });
          return '';
        }
      },
    async loadMarketplaceWallpaper(background, signal, requestId) {
        const previewUrl = background?.previewUrl || '';
        const sourceUrl = background?.imageUrl || background?.downloadUrl || '';
        const srcSet = background?.imageSrcSet || '';

        if (previewUrl && !signal?.aborted && requestId === this.backgroundRequestId) {
          this.applyBackgroundImage(previewUrl, '', { immediate: true });
          this.releaseMarketplaceBlobUrl();
        }

        if (!sourceUrl) {
          if (!previewUrl) {
            this.applyBackgroundImage('', '');
            this.releaseMarketplaceBlobUrl();
          }
          return;
        }

        let resolvedUrl = sourceUrl;
        if (this.isMarketplaceDownloadUrl(sourceUrl)) {
          resolvedUrl = await this.resolveMarketplaceDownloadImage(sourceUrl, background?.assetSlug || '', signal);
        }

        if (signal?.aborted || requestId !== this.backgroundRequestId) {
          if (resolvedUrl?.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
          return;
        }

        if (!resolvedUrl) {
          if (!previewUrl) {
            this.applyBackgroundImage('', '');
            this.releaseMarketplaceBlobUrl();
          }
          return;
        }

        await this.preloadImage(resolvedUrl, signal);
        if (signal?.aborted || requestId !== this.backgroundRequestId) {
          if (resolvedUrl.startsWith('blob:')) URL.revokeObjectURL(resolvedUrl);
          return;
        }
        this.applyBackgroundImage(resolvedUrl, resolvedUrl.startsWith('blob:') ? '' : srcSet);
        if (resolvedUrl.startsWith('blob:')) {
          const previous = this.marketplaceBlobUrl;
          this.marketplaceBlobUrl = resolvedUrl;
          if (previous && previous !== resolvedUrl) URL.revokeObjectURL(previous);
        }
      },
    setupWallpaperRefresh() {
        const listener = () => {
          if (['Unsplash', 'LocalFolder'].includes(this.tabStore.background?.type)) {
            this.load();
          }
        };
        this.refreshWallpaperListener = listener;
        window.addEventListener('midori:refresh-wallpaper', listener);

        this.backgroundChangedListener = () => this.load();
        window.addEventListener('midori:background-changed', this.backgroundChangedListener);
      }
  },
};
</script>

<style scoped>
.background-skeleton {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -3;
  pointer-events: none;
  background: var(--color-bg);
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
