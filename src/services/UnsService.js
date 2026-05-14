import { getJson, quotaSafeSet, remove } from './StorageService.js';

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

function buildOptimizedImageUrl(rawUrl) {
  if (!rawUrl) return '';

  try {
    const url = new URL(rawUrl);
    url.searchParams.set('w', String(screenWidth));
    url.searchParams.set('fit', 'max');
    url.searchParams.set('fm', 'webp');
    url.searchParams.set('q', '60');
    url.searchParams.set('dpr', '1');
    return url.toString();
  } catch {
    return rawUrl;
  }
}

class UnsplashService {
  #url = '';
  #author = '';
  #authorLink = '';
  #imageLink = '';
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

  /**
   * Obtener URL de thumbnail pequeño para cálculo de luminosidad
   * Devuelve la URL actual ya optimizada por tamaño y calidad.
   */
  getThumbnailUrl() {
    return this.#url;
  }

  #setImage(meta) {
    this.#url = meta.url;
    this.#author = meta.author;
    this.#authorLink = meta.authorLink;
    this.#imageLink = meta.imagePage;
  }

  async setImagen() {
    try {
      const now = Date.now();
      const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;
      const index = Number(localStorage.getItem(CACHE_INDEX)) || 0;
      const cachedList = await getJson(CACHE_KEY_LIST, []);

      /**
       * Check if cache is still valid
       */
      if (now < expiry && cachedList.length > 0) {
        const current = cachedList[index % cachedList.length];
        this.#setImage(current);
        localStorage.setItem(CACHE_INDEX, String((index + 1) % cachedList.length));

        // Evita expiraciones abruptas manteniendo metadata fresca en segundo plano.
        this.#refreshMetadataIfNeeded(false);
        return;
      }

      /**
       * 🚀 first loading image
       */
      const singleImage = await this.#fetchSingleImage();
      if (singleImage) {
        this.#setImage(singleImage);
      }

      /**
       * 🧠 In the background: preload the rest of the images.
       */
      this.#refreshMetadataIfNeeded(true);

    } catch (error) {
      console.error('Error al establecer la imagen:', error);
    }
  }

  async #fetchSingleImage() {
    try {
      const params = new URLSearchParams({
        client_id: import.meta.env.VITE_UNSPLASH_API,
        orientation: 'landscape',
        query: 'landscape',
      });
      const res = await fetch(`https://api.unsplash.com/photos/random?${params}`);
      if (!res.ok) return null;
      const data = await res.json();

      // Optimizado: webp, calidad moderada y resolución adaptativa.
      const baseUrl = data.urls.raw || data.urls.full || data.urls.regular;
      const imageUrl = buildOptimizedImageUrl(baseUrl);

      return {
        url: imageUrl,
        author: data.user.name,
        authorLink: data.user.links.html,
        imagePage: data.links.html,
      };
    } catch (error) {
      console.error('Error al obtener una imagen aleatoria de Unsplash:', error);
      return null;
    }
  }

  async #refreshMetadataIfNeeded(force) {
    const now = Date.now();
      const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;

    if (!force && now < expiry - 6 * 60 * 60 * 1000) {
      return;
    }

    const lockUntil = Number(localStorage.getItem(CACHE_FETCH_LOCK)) || 0;
    if (lockUntil > now) {
      return;
    }

    localStorage.setItem(CACHE_FETCH_LOCK, String(now + CACHE_FETCH_LOCK_TTL_MS));

    const doRefresh = async () => {
      try {
        await this.#fetchMetadataBatch();
      } finally {
        localStorage.removeItem(CACHE_FETCH_LOCK);
      }
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      window.requestIdleCallback(() => {
        doRefresh().catch((error) => {
          console.warn('Error al refrescar metadata de Unsplash:', error);
        });
      }, { timeout: 1500 });
      return;
    }

    setTimeout(() => {
      doRefresh().catch((error) => {
        console.warn('Error al refrescar metadata de Unsplash:', error);
      });
    }, 300);
  }

  async #fetchMetadataBatch() {
    try {
      const params = new URLSearchParams({
        client_id: import.meta.env.VITE_UNSPLASH_API,
        per_page: this.#total,
        page: 1,
        orientation: 'landscape',
        query: 'landscape',
      });
      const res = await fetch(`https://api.unsplash.com/photos?${params}`);
      if (!res.ok) return;
      const data = await res.json();

      const now = Date.now();
      const newList = [];

      for (const photo of data.slice(0, this.#total)) {
        // Solo metadata/URLs: no descargamos blobs masivos en background.
        const baseUrl = photo.urls.raw || photo.urls.full || photo.urls.regular;
        const imageUrl = buildOptimizedImageUrl(baseUrl);

        newList.push({
          url: imageUrl,
          author: photo.user.name,
          authorLink: photo.user.links.html,
          imagePage: photo.links.html,
        });
      }

      await quotaSafeSet(CACHE_KEY_LIST, newList.slice(0, this.#total), { maxBytes: 75_000 });
      localStorage.setItem(CACHE_INDEX, '1');
      localStorage.setItem(CACHE_EXPIRY, String(now + 24 * 60 * 60 * 1000)); // 24h
    } catch (error) {
      console.error('Error en la precarga de imágenes:', error);
    }
  }

  /**
   * Clear cache manually.
   */
  async clearCache() {
    await remove(CACHE_KEY_LIST);
    localStorage.removeItem(CACHE_INDEX);
    localStorage.removeItem(CACHE_EXPIRY);
    localStorage.removeItem(CACHE_FETCH_LOCK);
  }
}

export default UnsplashService;
