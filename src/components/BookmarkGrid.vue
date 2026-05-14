<template>
  <div class="bookmark-grid">
    <!-- Category tabs -->
    <div class="tabs-bar">
      <div
        v-for="cat in categories"
        :key="cat"
        class="tab-item"
        :class="{ active: cat === activeTab }"
      >
        <button class="tab-btn" @click="activeTab = cat">{{ cat }}</button>
        <button
          v-if="categories.length > 1"
          class="tab-delete"
          @click.stop="deleteCategory(cat)"
          :title="t.deleteCategory"
        >×</button>
      </div>
      <button class="tab-add" @click="addCategory" :title="t.addCategory">+</button>
    </div>

    <!-- Bookmarks grid -->
    <div class="grid">
      <div
        v-for="(bm, idx) in currentBookmarks"
        :key="idx"
        class="card"
      >
        <div class="card-actions">
          <button class="card-action-btn" @click.prevent="editBookmark(idx)" :title="t.edit">✏️</button>
          <button class="card-action-btn" @click.prevent="deleteBookmark(idx)" :title="t.delete">🗑️</button>
        </div>
        <a
          :href="bm.url"
          class="card-link"
          :target="openTarget === 'Self Tab' ? '_self' : '_blank'"
        >
          <div class="card-icon">
            <img
              :src="getFaviconUrl(bm)"
              :alt="bm.title"
              @error="onImgError($event, bm)"
            />
          </div>
          <span class="card-title">{{ bm.title }}</span>
        </a>
      </div>

      <!-- Add bookmark button -->
      <div v-if="currentBookmarks.length < 8" class="card card-add">
        <button class="card-link add-link" @click.prevent="addBookmark">
          <div class="card-icon add-icon">+</div>
          <span class="card-title">{{ t.add }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';

const STORAGE_KEY = 'midori_bookmarks';
const CATS_KEY = 'midori_bookmark_categories';

const DEFAULT_CATEGORIES = ['Personal', 'Work', 'Travel'];

const DEFAULT_BOOKMARKS = {
  Personal: [
    { title: 'Astian', url: 'https://astian.org/', domain: 'astian.org' },
    { title: 'Amazon', url: 'https://amzn.to/47IiNIO', domain: 'amazon.com' },
    { title: 'Kayak', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fflights', domain: 'kayak.com' },
    { title: 'Aliexpress', url: 'https://s.click.aliexpress.com/e/_c2xYL4uP', domain: 'aliexpress.us' },
    { title: 'Ebay', url: 'https://ebay.us/Tg0rAn', domain: 'ebay.us' },
  ],
  Work: [
    { title: 'GitHub', url: 'https://github.com', domain: 'github.com' },
    { title: 'Notion', url: 'https://notion.so', domain: 'notion.so' },
  ],
  Travel: [
    { title: 'Kayak Hotels', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fhotels', domain: 'kayak.com' },
    { title: 'Kayak Cars', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fcars', domain: 'kayak.com' },
  ],
  Web3: [
    { title: 'MiWallet', url: 'https://wallet.astian.org', domain: 'wallet.astian.org' },
    { title: 'Kayak Cars', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fcars', domain: 'kayak.com' },
  ],
};

export default {
  name: 'BookmarkGrid',

  props: {
    /** How links open: 'Self Tab' | 'New Tab' */
    openTarget: { type: String, default: 'Self Tab' },
  },

  data() {
    const i18n = useI18nStore();

    return {
      bookmarks: JSON.parse(JSON.stringify(DEFAULT_BOOKMARKS)),
      categories: [...DEFAULT_CATEGORIES],
      activeTab: DEFAULT_CATEGORIES[0],
      faviconAttempts: {},
      i18n,
      isLoaded: false,
    };
  },

  computed: {
    /** Returns i18n translations for bookmarks UI. */
    t() {
      const bk = this.i18n.t.bookmarks || {};
      return {
        add: bk.add || 'Añadir',
        edit: bk.edit || 'Editar',
        delete: bk.delete || 'Eliminar',
        addCategory: bk.addCategory || 'Añadir categoría',
        deleteCategory: bk.deleteCategory || 'Eliminar categoría',
        newCategory: bk.newCategory || 'Nombre de la nueva categoría:',
        bookmarkName: bk.bookmarkName || 'Nombre del marcador:',
        bookmarkUrl: bk.bookmarkUrl || 'URL del marcador:',
        confirmDelete: bk.confirmDelete || '¿Eliminar',
      };
    },
    currentBookmarks() {
      return this.bookmarks[this.activeTab] || [];
    },
  },

  methods: {
    async loadBookmarks() {
      const [savedBm, savedCats] = await Promise.all([
        getJson(STORAGE_KEY, null),
        getJson(CATS_KEY, null),
      ]);
      if (savedBm && typeof savedBm === 'object') {
        this.bookmarks = savedBm;
      }
      if (Array.isArray(savedCats) && savedCats.length) {
        this.categories = savedCats;
      }
      this.activeTab = this.categories[0] || 'Personal';
      this.isLoaded = true;
    },

    saveBookmarksDebounced() {
      setJsonDebounced(STORAGE_KEY, this.bookmarks, { delayMs: 700, maxBytes: 350_000 });
      setJsonDebounced(CATS_KEY, this.categories, { delayMs: 700, maxBytes: 32_000 });
    },

    async flushBookmarks() {
      await Promise.all([
        flushDebounced(STORAGE_KEY, this.bookmarks, { maxBytes: 350_000 }),
        flushDebounced(CATS_KEY, this.categories, { maxBytes: 32_000 }),
      ]);
    },

    addCategory() {
      const name = prompt(this.t.newCategory);
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (this.categories.includes(trimmed)) return;
      this.categories.push(trimmed);
      this.bookmarks[trimmed] = [];
      this.activeTab = trimmed;
      this.saveBookmarksDebounced();
    },

    deleteCategory(cat) {
      if (this.categories.length <= 1) return;
      const count = (this.bookmarks[cat] || []).length;
      const msg = `${this.t.confirmDelete} "${cat}"? (${count} marcadores)`;
      if (!confirm(msg)) return;
      const idx = this.categories.indexOf(cat);
      if (idx > -1) this.categories.splice(idx, 1);
      delete this.bookmarks[cat];
      if (this.activeTab === cat) this.activeTab = this.categories[0];
      this.saveBookmarksDebounced();
    },

    addBookmark() {
      const title = prompt(this.t.bookmarkName);
      if (!title) return;
      const url = prompt(this.t.bookmarkUrl, 'https://');
      if (!url) return;
      try {
        const domain = new URL(url).hostname;
        this.bookmarks[this.activeTab].push({ title, url, domain });
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    /**
     * Adds a bookmark programmatically from an external caller (e.g. parent via ref).
     * @param {string} title - Bookmark display name.
     * @param {string} url - Bookmark URL.
     */
    addBookmarkExternal(title, url) {
      try {
        const domain = new URL(url).hostname;
        if (!this.bookmarks[this.activeTab]) {
          this.bookmarks[this.activeTab] = [];
        }
        this.bookmarks[this.activeTab].push({ title, url, domain });
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    editBookmark(idx) {
      const bm = this.bookmarks[this.activeTab][idx];
      const title = prompt(this.t.bookmarkName, bm.title);
      if (!title) return;
      const url = prompt(this.t.bookmarkUrl, bm.url);
      if (!url) return;
      try {
        bm.title = title;
        bm.url = url;
        bm.domain = new URL(url).hostname;
        delete bm.logo;
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    deleteBookmark(idx) {
      const bm = this.bookmarks[this.activeTab][idx];
      if (!confirm(`${this.t.confirmDelete} "${bm.title}"?`)) return;
      this.bookmarks[this.activeTab].splice(idx, 1);
      this.saveBookmarksDebounced();
    },

    /** Returns the best favicon URL for a bookmark, cycling through services on error. */
    getFaviconUrl(item) {
      if (item.logo) return item.logo;
      const domain = item.domain || this.extractDomain(item.url);
      const attempt = this.faviconAttempts[domain] || 0;
      const services = [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://${domain}/favicon.ico`,
      ];
      return services[Math.min(attempt, services.length - 1)];
    },

    extractDomain(url) {
      try { return new URL(url).hostname; } catch { return url; }
    },

    onImgError(event, item) {
      const img = event.target;
      const domain = item.domain || this.extractDomain(item.url);
      const cur = this.faviconAttempts[domain] || 0;
      if (cur < 2) {
        this.faviconAttempts[domain] = cur + 1;
        img.src = this.getFaviconUrl(item);
      } else {
        // Fallback: show initial letter
        img.style.display = 'none';
        const container = img.parentNode;
        const colors = ['#04A469', '#0984e3', '#7c3aed', '#e17055', '#fdcb6e', '#00cec9'];
        container.style.backgroundColor = colors[item.title.charCodeAt(0) % colors.length];
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.fontSize = '1.3rem';
        container.style.fontWeight = '700';
        container.style.color = 'white';
        container.textContent = item.title.charAt(0).toUpperCase();
      }
    },
  },

  mounted() {
    this.loadBookmarks();
  },

  beforeUnmount() {
    this.flushBookmarks();
  },
};
</script>

<style scoped>
.bookmark-grid {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Tabs ── */
.tabs-bar {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  align-items: center;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: 4px;
  border-radius: var(--radius-sm, 6px);
  align-self: flex-start;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
}

.tab-btn {
  padding: 6px 1rem;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.8rem;
  background: transparent;
  color: var(--color-text-muted, #5A9A82);
  border-radius: var(--radius-sm, 6px);
  transition: all var(--transition-fast, 0.1s ease);
}

.tab-item.active .tab-btn {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  color: var(--color-text, #C4F0E0);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
}

.tab-btn:hover {
  color: var(--color-text, #C4F0E0);
}

.tab-delete {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: var(--accent-danger, #e17055);
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-fast, 0.1s ease);
  z-index: 5;
}

.tab-item:hover .tab-delete {
  opacity: 1;
}

.tab-add {
  padding: 6px 0.8rem;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  background: var(--color-primary, #04A469);
  color: white;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease);
}

.tab-add:hover {
  background: var(--color-primary-hover, #4de0b2);
}

/* ── Grid ── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 0.5rem;
}

.card {
  position: relative;
  border-radius: var(--radius-md, 10px);
  overflow: visible;
}

.card-actions {
  display: none;
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  gap: 0.25rem;
}

.card:hover .card-actions {
  display: flex;
}

.card-action-btn {
  cursor: pointer;
  border-radius: 4px;
  width: 22px;
  height: 22px;
  border: none;
  font-size: 0.7rem;
  background: var(--surface-overlay, #1E2D3D);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 1rem 0.5rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  text-decoration: none;
  color: var(--color-text, #C4F0E0);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  min-height: 90px;
  justify-content: center;
}

.card-link:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.card-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm, 6px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm, 6px);
}

.card-title {
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Add card */
.add-link {
  border: none;
  width: 100%;
}

.add-icon {
  background: var(--color-text-muted, #5A9A82);
  color: white;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 40px;
  user-select: none;
}
</style>
