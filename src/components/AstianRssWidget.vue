<template>
  <div class="astian-rss-widget">
    <div class="widget-header">
      <h3>🚀 Astian News</h3>
      <button @click="refreshFeed" class="refresh-btn" :disabled="loading">
        <span v-if="loading">⟳</span>
        <span v-else>↻</span>
      </button>
    </div>

    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>Cargando noticias de Astian...</p>
    </div>

    <div v-else-if="error" class="error">
      <p>{{ error }}</p>
      <button @click="loadFeed" class="retry-btn">Reintentar</button>
    </div>

    <div v-else class="feed-content">
      <div v-for="item in feedItems" :key="item.id" class="news-item astian-item">
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
          <span class="news-category">Astian</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'AstianRssWidget',
  data() {
    return {
      feedUrl: 'https://astian.org/rss',
      feedTitle: 'Astian News',
      feedItems: [],
      loading: false,
      error: null
    }
  },

  mounted() {
    this.loadFeed();
  },

  methods: {
    async loadFeed() {
      this.loading = true;
      this.error = null;

      try {
        const feedData = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${this.feedUrl}`)
          .then(res => res.json())
        this.feedTitle = feedData.feed.title;
        this.feedItems = feedData.items;
      } catch (error) {
        this.error = error.message;
        console.error('Error loading Astian RSS feed:', error);
      } finally {
        this.loading = false;
      }
    },

    refreshFeed() {
      this.loadFeed();
    },

    openLink(url) {
      if (window.chrome && chrome.tabs) {
        chrome.tabs.create({ url: url });
      } else {
        window.open(url, '_blank');
      }
    },

    truncateText(text, maxLength) {
      if (!text) return '';
      if (text.length <= maxLength) return text;
      return text.substring(0, maxLength) + '...';
    }
  }
}
</script>

<style scoped>
.astian-rss-widget {
  background: var(--bg-glass);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: var(--text-color);
  border-radius: 12px;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.widget-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.2);
  padding: 1rem;
}

.widget-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: inherit;
  background: linear-gradient(45deg, #4ecdc4, #44a08d);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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
  border-top: 2px solid #4ecdc4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
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

.astian-item {
  min-height: 120px;
  padding: 12px;
  background: var(--bg-color);
  border-radius: 8px;
  border-left: 3px solid #4ecdc4;
  transition: all 0.3s ease;
  position: relative;
}

.astian-item::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, #4ecdc4, #44a08d);
  transform: scaleX(0);
  transition: transform 0.3s ease;
}

.astian-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.astian-item:hover::before {
  transform: scaleX(.95);
}

.news-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
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
}

.news-title a:hover {
  color: #4ecdc4;
  text-decoration: underline;
}

.news-date {
  font-size: 11px;
  opacity: 0.6;
  color: inherit;
  white-space: nowrap;
  margin-left: 8px;
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

.news-category {
  font-size: 10px;
  background: linear-gradient(45deg, #4ecdc4, #44a08d);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
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
  background: linear-gradient(180deg, #4ecdc4, #44a08d);
  border-radius: 2px;
}

.feed-content::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #44a08d, #4ecdc4);
}
</style>