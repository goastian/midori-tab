/**
 * Servicio de caché para RSS feeds
 * Optimiza las peticiones HTTP y reduce el consumo de ancho de banda
 */

import { getJson, quotaSafeSet, remove, setJsonDebounced } from './StorageService.js';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos
const CACHE_STORAGE_KEY = 'rss_feeds_cache';
const CACHE_MAX_ENTRIES = 12;
const CACHE_MAX_BYTES = 300_000;
const FETCH_TIMEOUT_MS = 8000;

class RssCacheService {
  constructor() {
    this.memoryCache = new Map();
    this.ready = this.loadFromStorage();
  }

  async loadFromStorage() {
    try {
      const data = await getJson(CACHE_STORAGE_KEY, {});
      const now = Date.now();
      Object.entries(data || {}).forEach(([key, value]) => {
        if (value.timestamp && (now - value.timestamp < CACHE_DURATION)) {
          this.memoryCache.set(key, value);
        }
      });
      this.pruneCache();
    } catch (error) {
      console.warn('Error loading RSS cache:', error);
    }
  }

  saveToStorage() {
    try {
      this.pruneCache();
      setJsonDebounced(CACHE_STORAGE_KEY, Object.fromEntries(this.memoryCache), {
        delayMs: 800,
        maxBytes: CACHE_MAX_BYTES,
      });
    } catch (error) {
      console.warn('Error saving RSS cache:', error);
    }
  }

  pruneCache() {
    const now = Date.now();
    for (const [key, value] of this.memoryCache) {
      if (!value?.timestamp || now - value.timestamp >= CACHE_DURATION) {
        this.memoryCache.delete(key);
      }
    }

    while (this.memoryCache.size > CACHE_MAX_ENTRIES) {
      let oldestKey = null;
      let oldestTs = Infinity;
      for (const [key, value] of this.memoryCache) {
        if (value.timestamp < oldestTs) {
          oldestTs = value.timestamp;
          oldestKey = key;
        }
      }
      if (!oldestKey) break;
      this.memoryCache.delete(oldestKey);
    }
  }

  /**
   * Obtener feed desde caché o hacer fetch
   * @param {string} feedUrl - URL del feed RSS
   * @param {boolean} forceRefresh - Forzar actualización ignorando caché
   * @returns {Promise<Object>} - Datos del feed
   */
  async getFeed(feedUrl, forceRefresh = false, options = {}) {
    await this.ready;
    this.pruneCache();
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
    let timeoutId = null;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      timeoutId = controller
        ? globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
        : null;

      if (options.signal && controller) {
        if (options.signal.aborted) controller.abort();
        else options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`, {
        signal: controller?.signal,
        cache: forceRefresh ? 'reload' : 'default',
      });
      
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

      this.saveToStorage();

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
    } finally {
      if (timeoutId) globalThis.clearTimeout(timeoutId);
    }
  }

  /**
   * Invalidar caché de un feed específico
   * @param {string} feedUrl - URL del feed a invalidar
   */
  invalidateFeed(feedUrl) {
    const cacheKey = this.getCacheKey(feedUrl);
    this.memoryCache.delete(cacheKey);
    this.saveToStorage();
    console.log(`🗑️ RSS Cache invalidated: ${feedUrl}`);
  }

  /**
   * Limpiar toda la caché
   */
  clearAll() {
    this.memoryCache.clear();
    remove(CACHE_STORAGE_KEY);
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
      this.saveToStorage();
      console.log(`🧹 Cleaned ${cleaned} expired RSS cache entries`);
    }

    return cleaned;
  }
}

// Singleton instance
const rssCacheService = new RssCacheService();

export default rssCacheService;
