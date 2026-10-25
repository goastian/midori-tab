import { getJson, quotaSafeSet } from './StorageService.js';
import { scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';
import { fetchJsonWithTimeout } from './fetchJsonWithTimeout.js';

const CACHE_KEY_LIST = 'unsplash_cache_images';
const CACHE_EXPIRY = 'unsplash_cache_expiry';
const CACHE_INDEX = 'unsplash_cache_index';
const CACHE_FETCH_LOCK = 'unsplash_cache_fetch_lock';
const CACHE_FETCH_LOCK_TTL_MS = 60 * 1000;

function getAdaptiveWidth() {
  const viewportWidth = Math.max(window.innerWidth || 1280, 1280);
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const estimated = Math.round(viewportWidth * dpr);
  const deviceMemory = Number(navigator.deviceMemory || 4);

  // En equipos con poca RAM usamos fondos más pequeños para evitar congelamientos.
  if (deviceMemory <= 2) return Math.min(estimated, 1280);
  if (deviceMemory <= 4) return Math.min(estimated, 1440);
  return Math.min(estimated, 1600);
}

const screenWidth = getAdaptiveWidth();

function getImageQuality() {
  const deviceMemory = Number(navigator.deviceMemory || 4);
  return deviceMemory <= 2 ? 50 : 60;
}

function buildOptimizedImageUrl(rawUrl, width = screenWidth) {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    url.searchParams.set('w', String(width));
    url.searchParams.set('fit', 'max');
    url.searchParams.set('fm', 'webp');
    url.searchParams.set('q', String(getImageQuality()));
    url.searchParams.set('dpr', '1');
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function buildSrcSet(rawUrl) {
  const widths = [960, 1280, 1440, 1600]
    .filter(width => width <= Math.max(screenWidth, 1280));
  return widths
    .map(width => `${buildOptimizedImageUrl(rawUrl, width)} ${width}w`)
    .join(', ');
}

class UnsplashService {
  #url = '';
  #author = '';
  #authorLink = '';
  #imageLink = '';
  #srcSet = '';
  #total = 5;

  getUrl() {
    return this.#url;
  }

  getAuthor() {
    return this.#author;
  }

  getAuthorLink() {
    return this.#authorLink;
  }

  getImageLink() {
    return this.#imageLink;
  }

  getSrcSet() {
    return this.#srcSet;
  }

  #setImage(meta) {
    this.#url = meta.url;
    this.#srcSet = meta.srcSet || '';
    this.#author = meta.author;
    this.#authorLink = meta.authorLink;
    this.#imageLink = meta.imagePage;
  }

  async setImagen({ signal, preferredUrl = '', preferredImage = null } = {}) {
    try {
      const now = Date.now();
      const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;
      const index = Number(localStorage.getItem(CACHE_INDEX)) || 0;
      const storedList = await getJson(CACHE_KEY_LIST, []);
      const cachedList = Array.isArray(storedList) ? storedList.filter(image => typeof image?.url === 'string') : [];
      const preferredIndex = cachedList.findIndex(image => image.url === preferredUrl);

      // Metadata may refresh in another tab after this document painted its preview.
      if (preferredUrl && preferredImage?.url === preferredUrl && preferredIndex < 0) {
        this.#setImage(preferredImage);
        this.#refreshMetadataIfNeeded(false);
        return;
      }

      /**
       * Check if cache is still valid
       */
      if ((now < expiry || preferredIndex >= 0) && cachedList.length > 0) {
        const selectedIndex = preferredIndex >= 0 ? preferredIndex : index % cachedList.length;
        const current = cachedList[selectedIndex];
        this.#setImage(current);
        // Keep the boot preview's selection, without rewinding another tab's rotation.
        if (preferredIndex < 0 || index % cachedList.length === selectedIndex) {
          localStorage.setItem(CACHE_INDEX, String((selectedIndex + 1) % cachedList.length));
        }

        // Evita expiraciones abruptas manteniendo metadata fresca en segundo plano.
        this.#refreshMetadataIfNeeded(false);
        return;
      }

      /**
       * 🚀 first loading image. Un solo request del batch provee la imagen
       * actual y el cache para la próxima apertura, evitando que una
       * primera pestaña en frío se quede sin fondo.
       */
      const batch = await this.#fetchMetadataBatch({ signal });
      if (signal?.aborted) return;
      if (batch && batch.length > 0) {
        this.#setImage(batch[0]);
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && !signal?.aborted) console.error('Error al establecer la imagen:', error);
    }
  }

  /** The image the next new tab will select, or null when there is nothing else to rotate to. */
  async peekNext() {
    const stored = await getJson(CACHE_KEY_LIST, []);
    const list = Array.isArray(stored) ? stored.filter(image => typeof image?.url === 'string') : [];
    if (list.length < 2) return null;
    const next = list[(Number(localStorage.getItem(CACHE_INDEX)) || 0) % list.length];
    return next.url === this.#url ? null : next;
  }

  async #refreshMetadataIfNeeded(force) {
    const now = Date.now();
      const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;

    if (!force && now < expiry - 6 * 60 * 60 * 1000) {
      return;
    }

    const doRefresh = async (signal) => {
      const startedAt = Date.now();
      if ((Number(localStorage.getItem(CACHE_FETCH_LOCK)) || 0) > startedAt) return false;
      localStorage.setItem(CACHE_FETCH_LOCK, String(startedAt + CACHE_FETCH_LOCK_TTL_MS));
      try {
        await this.#fetchMetadataBatch({ signal });
      } finally {
        localStorage.removeItem(CACHE_FETCH_LOCK);
      }
    };
    void scheduleRemoteTask('unsplash-metadata', doRefresh, { priority: 0 });
  }

  async #fetchMetadataBatch({ signal } = {}) {
    try {
      const params = new URLSearchParams({
        client_id: import.meta.env.VITE_UNSPLASH_API,
        per_page: this.#total,
        page: 1,
        orientation: 'landscape',
        query: 'landscape',
      });
      const { response: res, payload: data } = await fetchJsonWithTimeout(`https://api.unsplash.com/photos?${params}`, {
        signal, timeoutMs: 8000,
      });
      if (!res.ok) return null;
      if (signal?.aborted) return null;

      const now = Date.now();
      const newList = [];

      for (const photo of data.slice(0, this.#total)) {
        // Solo metadata/URLs: no descargamos blobs masivos en background.
        const baseUrl = photo.urls.raw || photo.urls.full || photo.urls.regular;
        const imageUrl = buildOptimizedImageUrl(baseUrl);

        newList.push({
          url: imageUrl,
          srcSet: buildSrcSet(baseUrl),
          author: photo.user.name,
          authorLink: photo.user.links.html,
          imagePage: photo.links.html,
        });
      }

      if (newList.length === 0) return null;

      await quotaSafeSet(CACHE_KEY_LIST, newList.slice(0, this.#total), { maxBytes: 75_000 });
      localStorage.setItem(CACHE_INDEX, '1');
      localStorage.setItem(CACHE_EXPIRY, String(now + 24 * 60 * 60 * 1000)); // 24h
      return newList;
    } catch (error) {
      if (error?.name !== 'AbortError' && !signal?.aborted) console.error('Error en la precarga de imágenes:', error);
      return null;
    }
  }
}

export default UnsplashService;
