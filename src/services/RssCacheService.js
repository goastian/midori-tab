/**
 * Servicio de caché para RSS feeds
 * Optimiza las peticiones HTTP y reduce el consumo de ancho de banda
 */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const CACHE_STORAGE_KEY = 'rss_feeds_cache';

class RssCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.loadFromLocalStorage();
  }

  /**
   * Cargar caché desde localStorage al iniciar
   */
  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(CACHE_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        // Restaurar solo entradas válidas (no expiradas)
        const now = Date.now();
        Object.entries(data).forEach(([key, value]) => {
          if (value.timestamp && (now - value.timestamp < CACHE_DURATION)) {
            this.memoryCache.set(key, value);
          }
        });
      }
    } catch (error) {
      console.warn('Error loading RSS cache from localStorage:', error);
    }
  }

  /**
   * Guardar caché en localStorage
   */
  saveToLocalStorage() {
    try {
      const data = {};
      this.memoryCache.forEach((value, key) => {
        data[key] = value;
      });
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.warn('Error saving RSS cache to localStorage:', error);
    }
  }

  /**
   * Obtener feed desde caché o hacer fetch
   * @param {string} feedUrl - URL del feed RSS
   * @param {boolean} forceRefresh - Forzar actualización ignorando caché
   * @returns {Promise<Object>} - Datos del feed
   */
  async getFeed(feedUrl, forceRefresh = false) {
    const cacheKey = this.getCacheKey(feedUrl);
    const now = Date.now();

    // Verificar si existe en caché y no ha expirado
    if (!forceRefresh && this.memoryCache.has(cacheKey)) {
      const cached = this.memoryCache.get(cacheKey);
      const age = now - cached.timestamp;

      if (age < CACHE_DURATION) {
        console.log(`📦 RSS Cache HIT: ${feedUrl} (age: ${Math.round(age / 1000)}s)`);
        return {
          ...cached.data,
          fromCache: true,
          cacheAge: age
        };
      } else {
        console.log(`⏰ RSS Cache EXPIRED: ${feedUrl}`);
      }
    }

    // No está en caché o expiró - hacer fetch
    console.log(`🌐 RSS Cache MISS: ${feedUrl} - Fetching...`);
    try {
      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Guardar en caché
      this.memoryCache.set(cacheKey, {
        data: data,
        timestamp: now,
        url: feedUrl
      });

      // Persistir en localStorage (async, no bloquea)
      setTimeout(() => this.saveToLocalStorage(), 0);

      return {
        ...data,
        fromCache: false,
        cacheAge: 0
      };
    } catch (error) {
      console.error('Error fetching RSS feed:', error);
      
      // Si hay error pero existe caché expirado, devolverlo como fallback
      if (this.memoryCache.has(cacheKey)) {
        console.log(`⚠️ Using expired cache as fallback for: ${feedUrl}`);
        const cached = this.memoryCache.get(cacheKey);
        return {
          ...cached.data,
          fromCache: true,
          cacheAge: now - cached.timestamp,
          isExpired: true
        };
      }

      throw error;
    }
  }

  /**
   * Invalidar caché de un feed específico
   * @param {string} feedUrl - URL del feed a invalidar
   */
  invalidateFeed(feedUrl) {
    const cacheKey = this.getCacheKey(feedUrl);
    this.memoryCache.delete(cacheKey);
    this.saveToLocalStorage();
    console.log(`🗑️ RSS Cache invalidated: ${feedUrl}`);
  }

  /**
   * Limpiar toda la caché
   */
  clearAll() {
    this.memoryCache.clear();
    localStorage.removeItem(CACHE_STORAGE_KEY);
    console.log('🗑️ RSS Cache cleared completely');
  }

  /**
   * Obtener estadísticas de caché
   */
  getStats() {
    const now = Date.now();
    const entries = Array.from(this.memoryCache.entries());
    
    return {
      totalEntries: entries.length,
      validEntries: entries.filter(([_, v]) => (now - v.timestamp) < CACHE_DURATION).length,
      expiredEntries: entries.filter(([_, v]) => (now - v.timestamp) >= CACHE_DURATION).length,
      oldestEntry: entries.length > 0 
        ? Math.max(...entries.map(([_, v]) => now - v.timestamp)) 
        : 0,
      totalSize: new Blob([JSON.stringify(Object.fromEntries(this.memoryCache))]).size
    };
  }

  /**
   * Generar clave de caché única para una URL
   * @private
   */
  getCacheKey(feedUrl) {
    return `rss_${btoa(feedUrl).substring(0, 32)}`;
  }

  /**
   * Limpiar entradas expiradas (mantenimiento)
   */
  cleanExpired() {
    const now = Date.now();
    let cleaned = 0;

    this.memoryCache.forEach((value, key) => {
      if (now - value.timestamp >= CACHE_DURATION) {
        this.memoryCache.delete(key);
        cleaned++;
      }
    });

    if (cleaned > 0) {
      this.saveToLocalStorage();
      console.log(`🧹 Cleaned ${cleaned} expired RSS cache entries`);
    }

    return cleaned;
  }
}

// Singleton instance
const rssCacheService = new RssCacheService();

// Limpiar caché expirado cada 10 minutos
setInterval(() => {
  rssCacheService.cleanExpired();
}, 10 * 60 * 1000);

export default rssCacheService;
