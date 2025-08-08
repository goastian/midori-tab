import axios from 'axios';

const CACHE_NAME = 'unsplash-image-cache-v1';
const CACHE_KEY_LIST = 'unsplash_cache_images';
const CACHE_EXPIRY = 'unsplash_cache_expiry';
const CACHE_INDEX = 'unsplash_cache_index';

const screenWidth = window.innerWidth;

class UnsplashService {
  __url = '';
  __autor = '';
  __autorLink = '';
  __imageLink = '';
  __total = 10;

  getUrl() {
    return this.__url;
  }

  getAuthor() {
    return this.__autor;
  }

  getAuthorLink() {
    return this.__autorLink;
  }

  getImageLink() {
    return this.__imageLink;
  }

  async setImagen() {
    const now = Date.now();
    const expiry = Number(localStorage.getItem(CACHE_EXPIRY)) || 0;
    const index = Number(localStorage.getItem(CACHE_INDEX)) || 0;
    const cachedList = JSON.parse(localStorage.getItem(CACHE_KEY_LIST) || '[]');

    const cache = await caches.open(CACHE_NAME);

    if (now < expiry && cachedList.length > 0) {
      const current = cachedList[index % cachedList.length];
      const response = await cache.match(current.url);
      if (response) {
        const blob = await response.blob();
        this.__url = URL.createObjectURL(blob);
        this.__autor = current.author;
        this.__autorLink = current.authorLink;
        this.__imageLink = current.imagePage;

        // Siguiente imagen para la próxima vez
        localStorage.setItem(CACHE_INDEX, String((index + 1) % cachedList.length));
        return;
      }
    }

    // 🚀 Caché expirado o vacío → traer nuevas imágenes
    const { data } = await axios.get(`https://api.unsplash.com/photos`, {
      params: {
        client_id: import.meta.env.VITE_UNSPLASH_API,
        per_page: this.__total,
        page: 1,
        orientation: 'landscape',
        query: 'landscape',
      }
    });

    const newList = [];

    for (const photo of data) {
      const imageUrl = `${photo.urls.regular}?w=${screenWidth}&fit=crop&auto=format&q=80`;

      newList.push({
        url: imageUrl,
        author: photo.user.name,
        authorLink: photo.user.links.html,
        imagePage: photo.links.html,
      });

      const response = await fetch(imageUrl);
      if (response.ok) {
        const blob = await response.blob();
        await cache.put(imageUrl, new Response(blob));
      }
    }

    // Guardar datos
    localStorage.setItem(CACHE_KEY_LIST, JSON.stringify(newList));
    localStorage.setItem(CACHE_INDEX, '1'); // siguiente
    localStorage.setItem(CACHE_EXPIRY, String(now + 24 * 60 * 60 * 1000)); // 24h

    // Usar el primero ahora
    const first = newList[0];
    const response = await cache.match(first.url);
    if (response) {
      const blob = await response.blob();
      this.__url = URL.createObjectURL(blob);
      this.__autor = first.author;
      this.__autorLink = first.authorLink;
      this.__imageLink = first.imagePage;
    }
  }

  async clearCache() {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(CACHE_KEY_LIST);
    localStorage.removeItem(CACHE_INDEX);
    localStorage.removeItem(CACHE_EXPIRY);
  }
}

export default UnsplashService;