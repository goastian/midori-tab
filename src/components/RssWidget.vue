<template>
  <div class="rss-widget">
    <div class="widget-header">
      <div class="feed-selector">
        <button @click="previousFeed" class="feed-nav-btn" :disabled="loading" title="Fuente anterior">
          ‹
        </button>
        <div class="feed-info" @click="toggleFeedSelector">
          <h3 :style="{ color: currentFeedColor }">
            {{ availableFeeds[currentFeedIndex].icon }} {{ feedTitle }}
          </h3>
          <span class="feed-description">{{ availableFeeds[currentFeedIndex].description }}</span>
        </div>
        <button @click="nextFeed" class="feed-nav-btn" :disabled="loading" title="Siguiente fuente">
          ›
        </button>
      </div>
      <div class="header-actions">
        <button @click="toggleAutoRefresh" class="auto-refresh-btn" :class="{ active: autoRefreshInterval }" title="Auto-refresh">
          ⏰
        </button>
        <button @click="refreshFeed" class="refresh-btn" :disabled="loading" title="Actualizar">
          <span v-if="loading">⟳</span>
          <span v-else>↻</span>
        </button>
      </div>
    </div>
    
    <!-- Selector de fuentes desplegable -->
    <div v-if="showFeedSelector" class="feed-selector-dropdown">
      <div v-for="(feed, index) in availableFeeds" :key="index" 
           class="feed-option" 
           :class="{ active: index === currentFeedIndex }"
           @click="selectFeed(index)">
        <span class="feed-icon" :style="{ color: feed.color }">{{ feed.icon }}</span>
        <div class="feed-details">
          <span class="feed-name">{{ feed.name }}</span>
          <span class="feed-desc">{{ feed.description }}</span>
        </div>
        <span v-if="index === currentFeedIndex" class="current-indicator">✓</span>
      </div>
    </div>
    
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Cargando noticias...</p>
    </div>
    
    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadFeed" class="retry-btn">Reintentar</button>
    </div>
    
    <div v-else class="feed-content">
      <div v-for="item in feedItems" :key="item.id" class="news-item" :style="{ borderLeftColor: currentFeedColor }">
        <div class="news-header">
          <h4 class="news-title">
            <a :href="item.link" target="_blank" @click="openLink(item.link)">
              {{ item.title }}
            </a>
          </h4>
          <span class="news-date">{{ item.pubDate }}</span>
        </div>
        <p class="news-description">{{ truncateText(item.description, 120) }}</p>
        <div class="news-footer">
          <span class="news-source" :style="{ backgroundColor: currentFeedColor }">
            {{ availableFeeds[currentFeedIndex].icon }} {{ availableFeeds[currentFeedIndex].name }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {
  fetchFeedPayload,
  getAvailableFeeds,
  getFeedColor,
  parseFeedPayload,
  truncateFeedText,
} from '../services/RssWidgetService.js';

export default {
  name: 'RssWidget',
  data() {
    return {
      feedUrl: 'https://feeds.bbci.co.uk/news/rss.xml',
      feedTitle: 'BBC News',
      feedItems: [],
      loading: false,
      error: null,
      availableFeeds: getAvailableFeeds(),
      currentFeedIndex: 0,
      showFeedSelector: false,
      autoRefreshInterval: null,
      requestController: null,
      visibilityListener: null,
      observer: null,
      isInViewport: true,
      autoRefreshEnabled: false,
    }
  },
  
  mounted() {
    // Cerrar selector al hacer clic fuera
    document.addEventListener('click', this.handleClickOutside);
    this.visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        this.stopAutoRefreshTimer();
        this.abortRequest();
        return;
      }
      if (this.isInViewport) {
        this.loadFeed();
        this.syncAutoRefreshTimer();
      }
    };
    document.addEventListener('visibilitychange', this.visibilityListener);
    this.updateFeedColor();
    this.$nextTick(() => this.setupVisibilityObserver());
  },
  
  beforeUnmount() {
    this.stopAutoRefreshTimer();
    this.abortRequest();
    if (this.observer) this.observer.disconnect();
    document.removeEventListener('click', this.handleClickOutside);
    if (this.visibilityListener) {
      document.removeEventListener('visibilitychange', this.visibilityListener);
    }
  },
  
  computed: {
    currentFeedColor() {
      return getFeedColor(this.availableFeeds, this.currentFeedIndex);
    }
  },
  
  watch: {
    currentFeedIndex() {
      this.loadFeed();
      this.updateFeedColor();
    }
  },
  
  methods: {
    async loadFeed(forceRefresh = false) {
      if (document.visibilityState === 'hidden') return;
      this.loading = true;
      this.error = null;
      
      const currentFeed = this.availableFeeds[this.currentFeedIndex];
      this.feedUrl = currentFeed.url;
      this.abortRequest();
      this.requestController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      
      try {
        const feedData = await fetchFeedPayload(this.feedUrl, forceRefresh, {
          signal: this.requestController?.signal,
        });
        const parsedData = parseFeedPayload(feedData);

        this.feedTitle = parsedData.feedTitle;
        this.feedItems = parsedData.feedItems;
        
        // Log si viene de caché (solo en desarrollo)
        if (feedData.fromCache) {
          console.log(`✅ RSS loaded from cache (${Math.round(feedData.cacheAge / 1000)}s old)`);
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        this.error = error.message;
        console.error('Error loading RSS feed:', error);
      } finally {
        this.requestController = null;
        this.loading = false;
      }
    },
    
    nextFeed() {
      this.currentFeedIndex = (this.currentFeedIndex + 1) % this.availableFeeds.length;
      this.showFeedSelector = false;
    },
    
    previousFeed() {
      this.currentFeedIndex = this.currentFeedIndex === 0 
        ? this.availableFeeds.length - 1 
        : this.currentFeedIndex - 1;
      this.showFeedSelector = false;
    },
    
    selectFeed(index) {
      this.currentFeedIndex = index;
      this.showFeedSelector = false;
    },
    
    toggleFeedSelector() {
      this.showFeedSelector = !this.showFeedSelector;
    },
    
    toggleAutoRefresh() {
      this.autoRefreshEnabled = !this.autoRefreshEnabled;
      this.syncAutoRefreshTimer();
    },

    syncAutoRefreshTimer() {
      this.stopAutoRefreshTimer();
      if (!this.autoRefreshEnabled || !this.isInViewport || document.visibilityState === 'hidden') return;
      this.autoRefreshInterval = setInterval(() => {
        this.loadFeed();
      }, 300000); // 5 minutos
    },

    stopAutoRefreshTimer() {
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    },

    abortRequest() {
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
    },

    setupVisibilityObserver() {
      const root = this.$el;
      if (!root || typeof IntersectionObserver === 'undefined') {
        this.isInViewport = true;
        this.loadFeed();
        this.syncAutoRefreshTimer();
        return;
      }
      this.observer = new IntersectionObserver((entries) => {
        const entry = entries[0];
        this.isInViewport = Boolean(entry?.isIntersecting);
        if (this.isInViewport && document.visibilityState !== 'hidden') {
          this.loadFeed();
          this.syncAutoRefreshTimer();
          return;
        }
        this.stopAutoRefreshTimer();
        this.abortRequest();
      }, { threshold: 0.1 });
      this.observer.observe(root);
    },
    
    handleClickOutside(event) {
      if (!this.$el.contains(event.target)) {
        this.showFeedSelector = false;
      }
    },
    
    updateFeedColor() {
      this.$el.style.setProperty('--feed-color', this.currentFeedColor);
    },
    
    refreshFeed() {
      // Forzar actualización ignorando caché
      this.loadFeed(true);
    },
    
    openLink(url) {
      // Usar el método del store para abrir enlaces
      if (window.chrome && chrome.tabs) {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank');
      }
    },
    
    truncateText(text, maxLength) {
      return truncateFeedText(text, maxLength);
    }
  }
}
</script>

<style scoped>
.rss-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  color: var(--color-text, white);
  border-radius: 1rem;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  position: relative;
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  padding: 1rem;
}

.feed-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.feed-info {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background-color 0.2s;
  min-width: 0;
}

.feed-info:hover {
  background: rgba(255, 255, 255, 0.1);
}

.feed-description {
  font-size: 11px;
  opacity: 0.7;
  display: block;
  margin-top: 2px;
}

.feed-nav-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 16px;
  font-weight: bold;
  transition: all 0.2s;
  min-width: 32px;
}

.feed-nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  transform: scale(1.05);
}

.feed-nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.header-actions {
  display: flex;
  gap: 4px;
}

.auto-refresh-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 14px;
  transition: all 0.2s;
}

.auto-refresh-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.auto-refresh-btn.active {
  background: rgba(78, 205, 196, 0.2);
  color: #4ecdc4;
}

.widget-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.feed-selector-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.95);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  /* Eliminado backdrop-filter - ya está dentro de widget con blur */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
}

.feed-option {
  display: flex;
  align-items: center;
  padding: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.feed-option:last-child {
  border-bottom: none;
}

.feed-option:hover {
  background: rgba(255, 255, 255, 0.1);
}

.feed-option.active {
  background: rgba(78, 205, 196, 0.2);
}

.feed-icon {
  font-size: 20px;
  margin-right: 12px;
  min-width: 24px;
}

.feed-details {
  flex: 1;
  min-width: 0;
}

.feed-name {
  display: block;
  font-weight: 500;
  font-size: 14px;
  color: inherit;
}

.feed-desc {
  display: block;
  font-size: 11px;
  opacity: 0.7;
  margin-top: 2px;
}

.current-indicator {
  color: #4ecdc4;
  font-weight: bold;
  font-size: 16px;
}

.refresh-btn {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 14px;
  transition: background-color 0.2s;
}

.refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.refresh-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 12px;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error {
  text-align: center;
  padding: 20px;
  color: #ff6b6b;
}

.retry-btn {
  background: #ff6b6b;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  margin-top: 8px;
}

.retry-btn:hover {
  background: #ff5252;
}

.feed-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 1rem;
}

.news-item {
  height: 100%;
  min-height: 140px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 8px;
  border-left: 3px solid #4ecdc4;
  transition: all 0.3s ease;
  overflow: auto;
}

.news-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--feed-color, #4ecdc4), transparent);
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.news-item:hover {
  background: rgba(255, 255, 255, 0.1);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.news-item:hover::before {
  transform: scaleX(1);
}

.news-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.news-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  flex: 1;
}

.news-title a {
  color: inherit;
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.news-title a:hover {
  color: var(--feed-color, #4ecdc4);
  text-decoration: underline;
}

.news-date {
  font-size: 11px;
  opacity: 0.6;
  color: inherit;
  white-space: nowrap;
  margin-left: 8px;
}

.news-title {
  margin: 0 0 8px 0;
  font-size: 14px;
  line-height: 1.4;
}

.news-title a {
  color: inherit;
  text-decoration: none;
  font-weight: 500;
}

.news-title a:hover {
  text-decoration: underline;
}

.news-description {
  margin: 0 0 8px 0;
  font-size: 12px;
  line-height: 1.4;
  opacity: 0.8;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.news-footer {
  display: flex;
  justify-content: flex-end;
}

.news-source {
  font-size: 10px;
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
  opacity: 0.8;
}

/* Scrollbar personalizado */
.feed-content::-webkit-scrollbar {
  width: 4px;
}

.feed-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.feed-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 2px;
}

.feed-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}
</style> 
