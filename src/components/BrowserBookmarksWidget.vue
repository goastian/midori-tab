<template>
  <div class="browser-bookmarks-widget">
    <div class="widget-header">
      <h3 class="widget-title">🔖 {{ copy.title }}</h3>
      <button class="widget-refresh" type="button" @click="loadBookmarks" :disabled="loading">↻</button>
    </div>

    <div class="widget-tools">
      <input
        v-model.trim="query"
        class="widget-search"
        type="text"
        :placeholder="copy.searchPlaceholder"
        @input="onSearchInput"
      />
    </div>

    <p v-if="error" class="widget-error">{{ error }}</p>
    <p v-else-if="loading" class="widget-empty">{{ copy.loading }}</p>
    <p v-else-if="!items.length" class="widget-empty">{{ copy.empty }}</p>

    <ul v-else class="bookmarks-list">
      <li v-for="item in items" :key="item.id" class="bookmark-item">
        <button class="bookmark-link" type="button" @click="openBookmark(item.url)">
          <span class="bookmark-icon">{{ faviconChar(item.title) }}</span>
          <span class="bookmark-meta">
            <span class="bookmark-title">{{ item.title || item.url }}</span>
            <span class="bookmark-url">{{ item.url }}</span>
          </span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

const DEFAULT_LIMIT = 12;

function extensionApi() {
  if (typeof browser !== 'undefined') return browser;
  if (typeof chrome !== 'undefined') return chrome;
  return null;
}

function bookmarksApi() {
  return extensionApi()?.bookmarks || null;
}

function tabsApi() {
  return extensionApi()?.tabs || null;
}

function isPromise(value) {
  return Boolean(value && typeof value.then === 'function');
}

async function callBookmarkMethod(method, ...args) {
  if (!method) return [];
  const maybePromise = method(...args);
  if (isPromise(maybePromise)) {
    return await maybePromise;
  }

  return await new Promise((resolve, reject) => {
    try {
      method(...args, result => {
        const runtimeError = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
          ? chrome.runtime.lastError
          : null;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(result || []);
      });
    } catch (error) {
      reject(error);
    }
  });
}

function onlyUrlNodes(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(node => node && typeof node.url === 'string' && node.url.length > 0);
}

export default {
  name: 'BrowserBookmarksWidget',

  props: {
    openTarget: { type: String, default: 'Self Tab' },
  },

  data() {
    return {
      i18n: useI18nStore(),
      loading: false,
      error: '',
      query: '',
      items: [],
      _searchTimer: null,
    };
  },

  computed: {
    copy() {
      const section = this.i18n.t.browserBookmarks || {};
      return {
        title: section.title || 'Browser bookmarks',
        searchPlaceholder: section.searchPlaceholder || 'Search browser bookmarks...',
        loading: section.loading || 'Loading bookmarks...',
        empty: section.empty || 'No bookmarks available.',
        unavailable: section.unavailable || 'Bookmarks API unavailable.',
      };
    },
  },

  mounted() {
    this.loadBookmarks();
  },

  beforeUnmount() {
    clearTimeout(this._searchTimer);
  },

  methods: {
    faviconChar(title) {
      const safe = String(title || '?').trim();
      return safe ? safe.charAt(0).toUpperCase() : '?';
    },

    onSearchInput() {
      clearTimeout(this._searchTimer);
      this._searchTimer = setTimeout(() => {
        this.loadBookmarks();
      }, 220);
    },

    async loadBookmarks() {
      const api = bookmarksApi();
      if (!api) {
        this.error = this.copy.unavailable;
        this.items = [];
        return;
      }

      this.loading = true;
      this.error = '';

      try {
        if (this.query) {
          const found = await callBookmarkMethod(api.search.bind(api), this.query);
          this.items = onlyUrlNodes(found).slice(0, DEFAULT_LIMIT);
        } else {
          const recent = await callBookmarkMethod(api.getRecent.bind(api), DEFAULT_LIMIT);
          this.items = onlyUrlNodes(recent);
        }
      } catch (error) {
        this.error = error?.message || this.copy.unavailable;
        this.items = [];
      } finally {
        this.loading = false;
      }
    },

    async addBookmarkExternal(title, url) {
      const api = bookmarksApi();
      if (!api?.create) return false;

      const payload = { title, url };
      try {
        const created = api.create(payload);
        if (isPromise(created)) {
          await created;
        } else {
          await new Promise((resolve, reject) => {
            api.create(payload, () => {
              const runtimeError = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.lastError)
                ? chrome.runtime.lastError
                : null;
              if (runtimeError) {
                reject(new Error(runtimeError.message));
                return;
              }
              resolve();
            });
          });
        }

        await this.loadBookmarks();
        return true;
      } catch {
        return false;
      }
    },

    async openBookmark(url) {
      const tabs = tabsApi();
      if (!tabs?.create) {
        window.open(url, this.openTarget === 'Self Tab' ? '_self' : '_blank', 'noopener,noreferrer');
        return;
      }

      if (this.openTarget === 'Self Tab') {
        window.location.href = url;
        return;
      }

      try {
        const created = tabs.create({ url });
        if (isPromise(created)) {
          await created;
        }
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    },
  },
};
</script>

<style scoped>
.browser-bookmarks-widget {
  width: 100%;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.45rem;
}

.widget-title {
  margin: 0;
  font-size: 0.86rem;
  color: var(--color-text, #C4F0E0);
}

.widget-refresh {
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  background: var(--surface-sunken, #060A10);
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
}

.widget-search {
  width: 100%;
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  font-size: 0.78rem;
  padding: 0.38rem 0.52rem;
}

.bookmarks-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 270px;
  overflow-y: auto;
}

.bookmark-link {
  width: 100%;
  border: 1px solid transparent;
  border-radius: var(--radius-sm, 6px);
  background: transparent;
  text-align: left;
  color: var(--color-text, #C4F0E0);
  padding: 0.4rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.bookmark-link:hover {
  background: var(--surface-sunken, #060A10);
  border-color: var(--color-border, rgba(126,196,168,0.1));
}

.bookmark-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--color-accent-bg, rgba(4,164,105,0.12));
  color: var(--color-text, #C4F0E0);
  font-size: 0.73rem;
  font-weight: 700;
}

.bookmark-meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.bookmark-title,
.bookmark-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bookmark-title {
  font-size: 0.78rem;
}

.bookmark-url {
  font-size: 0.68rem;
  color: var(--color-text-muted, #5A9A82);
}

.widget-empty,
.widget-error {
  margin: 0;
  font-size: 0.75rem;
}

.widget-empty {
  color: var(--color-text-muted, #5A9A82);
}

.widget-error {
  color: #ef8f8f;
}
</style>
