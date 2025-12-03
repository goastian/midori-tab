import axios from 'axios';

const CACHE_NAME = 'unsplash-image-cache-v1';
const CACHE_KEY_LIST = 'unsplash_cache_images';
const CACHE_EXPIRY = 'unsplash_cache_expiry';
const CACHE_INDEX = 'unsplash_cache_index';

// Limitar ancho máximo para optimizar carga (1920px es suficiente para la mayoría de pantallas)
const screenWidth = Math.min(window.innerWidth, 1920);

class UnsplashService {
  #url = '';
  #author = '';
  #authorLink = '';
  #imageLink = '';
  #total = 10;

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
   * Usa la imagen cacheada pero en miniatura para ahorrar procesamiento
   */
  getThumbnailUrl() {
    // Extraer la URL base y añadir parámetros de thumbnail
    if (this.#url && this.#url.startsWith('blob:')) {
      // Si es blob, no podemos generar thumbnail, devolver null
      return null;
    }
    return this.#url;
  }

  async setImagen() {
    try {
      const now = Date.now();
      const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;
      const index = Number(localStorage.getItem(CACHE_INDEX)) || 0;
      const cachedList = JSON.parse(localStorage.getItem(CACHE_KEY_LIST) || '[]');

      const cache = await caches.open(CACHE_NAME);

      /**
       * Check if cache is still valid
       */
      if (now < expiry && cachedList.length > 0) {
        const current = cachedList[index % cachedList.length];
        const response = await cache.match(current.url);
        if (response) {
          await this.#loadFromCache(response, current);
          localStorage.setItem(CACHE_INDEX, String((index + 1) % cachedList.length));
          return;
        }
      }

      /**
       * 🚀 first loading image
       */
      const singleImage = await this.#fetchSingleImage();
      if (singleImage) {
        const blob = await this.#fetchAndCacheImage(singleImage.url);
        if (blob) {
          this.#url = URL.createObjectURL(blob);
          this.#author = singleImage.author;
          this.#authorLink = singleImage.authorLink;
          this.#imageLink = singleImage.imagePage;
        }
      }

      /**
       * 🧠 In the background: preload the rest of the images.
       */
      this.#precacheImages();

    } catch (error) {
      console.error('Error al establecer la imagen:', error);
    }
  }

  /**
   * Get images from cache if valid
   */
  async #loadFromCache(response, meta) {
    const blob = await response.blob();
    this.#url = URL.createObjectURL(blob);
    this.#author = meta.author;
    this.#authorLink = meta.authorLink;
    this.#imageLink = meta.imagePage;
  }

  async #fetchSingleImage() {
    try {
      const { data } = await axios.get('https://api.unsplash.com/photos/random', {
        params: {
          client_id: import.meta.env.VITE_UNSPLASH_API,
          orientation: 'landscape',
          query: 'landscape',
        }
      });

      // Optimizado: webp, calidad 75, ancho limitado
      const imageUrl = `${data.urls.regular}?w=${screenWidth}&fit=crop&fm=webp&q=75`;

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

  async #fetchAndCacheImage(url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const cache = await caches.open(CACHE_NAME);
        await cache.put(url, new Response(blob));
        return blob;
      }
    } catch (error) {
      console.warn(`Error al cachear la imagen: ${url}`, error);
    }
    return null;
  }

  async #precacheImages() {
    try {
      const { data } = await axios.get('https://api.unsplash.com/photos', {
        params: {
          client_id: import.meta.env.VITE_UNSPLASH_API,
          per_page: this.#total,
          page: 1,
          orientation: 'landscape',
          query: 'landscape',
        }
      });

      const now = Date.now();
      const newList = [];
      const newUrls = [];
      const cache = await caches.open(CACHE_NAME);

      for (const photo of data) {
        // Optimizado: webp, calidad 75, ancho limitado
        const imageUrl = `${photo.urls.regular}?w=${screenWidth}&fit=crop&fm=webp&q=75`;

        newList.push({
          url: imageUrl,
          author: photo.user.name,
          authorLink: photo.user.links.html,
          imagePage: photo.links.html,
        });

        newUrls.push(imageUrl);

        try {
          const response = await fetch(imageUrl);
          if (response.ok) {
            const blob = await response.blob();
            await cache.put(imageUrl, new Response(blob));
          }
        } catch (error) {
          console.warn(`Error cacheando imagen: ${imageUrl}`, error);
        }
      }

      /**
       * Clear old cache.
       */
      await this.#cleanOldUnsplashImages(cache, newUrls);

      /**
       * save info in localStorage
       */
      localStorage.setItem(CACHE_KEY_LIST, JSON.stringify(newList));
      localStorage.setItem(CACHE_INDEX, '1');
      localStorage.setItem(CACHE_EXPIRY, String(now + 24 * 60 * 60 * 1000)); // 24h
    } catch (error) {
      console.error('Error en la precarga de imágenes:', error);
    }
  }

  async #cleanOldUnsplashImages(cache, validUrls) {
    const keys = await cache.keys();
    for (const request of keys) {
      if (!validUrls.includes(request.url)) {
        await cache.delete(request);
      }
    }
  }

  /**
   * Clear cache manually.
   */
  async clearCache() {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(CACHE_KEY_LIST);
    localStorage.removeItem(CACHE_INDEX);
    localStorage.removeItem(CACHE_EXPIRY);
  }
}

export default UnsplashService;