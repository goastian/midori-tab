<template>
  <div class="search-box" ref="root" :class="{ 'has-suggestions': showSuggestions }">
    <div class="search-inner">
      <input
        ref="input"
        v-model="query"
        :placeholder="placeholder"
        class="search-input"
        @keydown.enter.prevent="onEnter"
        @keydown.down.prevent="moveDown"
        @keydown.up.prevent="moveUp"
        @keydown.escape="closeSuggestions"
        @input="onInput"
        @focus="onFocus"
        autocomplete="off"
        spellcheck="false"
      />

      <button class="search-btn" @click="search" :aria-label="searchLabel">
        <Search :size="18" :stroke-width="2" />
      </button>
    </div>

    <!-- Autocomplete dropdown -->
    <div v-if="showSuggestions" class="suggestions-dropdown">
      <ul class="suggestions-list">
        <li
          v-for="(s, i) in suggestions"
          :key="i"
          class="suggestion-item"
          :class="{ active: i === activeIndex }"
          @mousedown.prevent="selectSuggestion(s)"
          @mouseenter="activeIndex = i"
        >
          <Search :size="14" :stroke-width="1.5" class="suggestion-icon" />
          <span class="suggestion-text" v-html="highlightMatch(s)"></span>
          <span class="suggestion-arrow">↗</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script>
import { Search } from 'lucide-vue-next';
import useI18nStore from '../stores/useI18nStore.js';
import { fetchSuggestions } from '../services/DuckDuckGoSuggestService.js';

const DEFAULT_ENGINE = {
  id: 'astiango',
  logo: 'https://astian.org/wp-content/uploads/2025/06/favicon-1.png',
  label: 'AstianGO',
  url: 'https://astiango.com/?q=',
};

export default {
  name: 'SearchBox',
  components: { Search },

  props: {
    /** How to open search results: 'Self Tab' | 'New Tab' */
    searchTarget: {
      type: String,
      default: 'Self Tab',
    },
  },

  data() {
    return {
      query: '',
      suggestions: [],
      activeIndex: -1,
      showSuggestions: false,
      originalQuery: '',
      i18n: useI18nStore(),
      _debounceTimer: null,
    };
  },

  computed: {
    placeholder() {
      const key = 'search.placeholderWithEngine';
      const translated = this.i18n.$t(key);
      if (translated !== key) {
        return String(translated).replace('{engine}', DEFAULT_ENGINE.label);
      }

      const fallbackByLocale = {
        es: 'Buscar con {engine}...',
        en: 'Search with {engine}...',
        pt: 'Pesquisar com {engine}...',
        fr: 'Rechercher avec {engine}...',
        de: 'Suchen mit {engine}...',
        ru: 'Искать с помощью {engine}...',
        zh: '使用 {engine} 搜索...',
        ja: '{engine} で検索...',
        it: 'Cerca con {engine}...',
      };

      const template = fallbackByLocale[this.i18n.locale] || fallbackByLocale.en;
      return template.replace('{engine}', DEFAULT_ENGINE.label);
    },
    searchLabel() {
      const key = 'search.button';
      const translated = this.i18n.$t(key);
      if (translated !== key) return translated;

      const quickSettingsSearch = this.i18n.$t('dashboard.quickSettings.search');
      return quickSettingsSearch !== 'dashboard.quickSettings.search' ? quickSettingsSearch : 'Search';
    },
  },

  methods: {
    /** Performs browser search using the default engine. */
    search(q) {
      const term = (typeof q === 'string' ? q : this.query).trim();
      if (!term) return;
      const url = `${DEFAULT_ENGINE.url}${encodeURIComponent(term)}`;
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      if (this.searchTarget === 'New Tab') {
        browserAPI.tabs.create({ url });
      } else {
        browserAPI.tabs.update({ url });
      }
      this.query = '';
      this.closeSuggestions();
    },

    onInput() {
      clearTimeout(this._debounceTimer);
      this.originalQuery = this.query;
      const q = this.query.trim();
      if (q.length < 2) {
        this.closeSuggestions();
        return;
      }
      this._debounceTimer = setTimeout(() => this.loadSuggestions(q), 200);
    },

    async loadSuggestions(q) {
      try {
        const results = await fetchSuggestions(q);
        this.suggestions = results.slice(0, 8);
        this.activeIndex = -1;
        this.showSuggestions = this.suggestions.length > 0;
      } catch (e) {
        if (e.name !== 'AbortError') this.closeSuggestions();
      }
    },

    onEnter() {
      if (this.activeIndex >= 0 && this.activeIndex < this.suggestions.length) {
        this.selectSuggestion(this.suggestions[this.activeIndex]);
      } else {
        this.search();
      }
    },

    selectSuggestion(s) {
      this.query = s;
      this.closeSuggestions();
      this.search(s);
    },

    moveDown() {
      if (!this.showSuggestions) return;
      this.activeIndex = (this.activeIndex + 1) % this.suggestions.length;
      this.query = this.suggestions[this.activeIndex];
    },

    moveUp() {
      if (!this.showSuggestions) return;
      if (this.activeIndex <= 0) {
        this.activeIndex = -1;
        this.query = this.originalQuery;
      } else {
        this.activeIndex--;
        this.query = this.suggestions[this.activeIndex];
      }
    },

    closeSuggestions() {
      this.suggestions = [];
      this.activeIndex = -1;
      this.showSuggestions = false;
    },

    onFocus() {
      if (this.suggestions.length > 0) this.showSuggestions = true;
    },

    highlightMatch(text) {
      const q = this.originalQuery.trim();
      if (!q) return this.escapeHtml(text);
      const idx = text.toLowerCase().indexOf(q.toLowerCase());
      if (idx === -1) return this.escapeHtml(text);
      const before = this.escapeHtml(text.slice(0, idx));
      const match = this.escapeHtml(text.slice(idx, idx + q.length));
      const after = this.escapeHtml(text.slice(idx + q.length));
      return `${before}<b>${match}</b>${after}`;
    },

    escapeHtml(str) {
      return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    onClickOutside(e) {
      if (this.$refs.root && !this.$refs.root.contains(e.target)) {
        this.closeSuggestions();
      }
    },
  },

  mounted() {
    document.addEventListener('mousedown', this.onClickOutside);
  },

  beforeUnmount() {
    document.removeEventListener('mousedown', this.onClickOutside);
    clearTimeout(this._debounceTimer);
  },
};
</script>

<style scoped>
.search-box {
  width: 100%;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 4px;
  transition: border-color var(--transition-fast, 0.1s ease);
  position: relative;
}

.search-box:focus-within {
  border-color: var(--color-primary, #04A469);
}

.search-inner {
  display: flex;
  align-items: center;
  gap: 0;
  background: var(--surface-sunken, #060A10);
  border-radius: var(--radius-sm, 6px);
  padding: 0.25rem 0.5rem;
  position: relative;
}

/* Search input */
.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text, #C4F0E0);
  font-size: 0.95rem;
  padding: 0.5rem 0.5rem;
  font-family: inherit;
  min-width: 0;
}

.search-input::placeholder {
  color: var(--color-text-muted, #5A9A82);
}

.search-input:focus,
.search-input:focus-visible {
  outline: none;
  box-shadow: none;
}

/* Search button */
.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary, #04A469);
  border: none;
  border-radius: var(--radius-sm, 6px);
  color: white;
  width: 34px;
  height: 34px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background var(--transition-fast, 0.1s ease);
}

.search-btn:hover {
  background: var(--color-primary-hover, #4de0b2);
}

/* Suggestions dropdown */
.suggestions-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.15));
  border-radius: var(--radius-md, 10px);
  z-index: 50;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.suggestions-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: 340px;
  overflow-y: auto;
}

.suggestion-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text, #C4F0E0);
  font-size: 0.9rem;
  transition: background 0.12s ease;
}

.suggestion-item:hover,
.suggestion-item.active {
  background: var(--surface-overlay, #1E2D3D);
}

.suggestion-icon {
  flex-shrink: 0;
  color: var(--color-text-muted, #5A9A82);
  opacity: 0.6;
}

.suggestion-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggestion-text :deep(b) {
  font-weight: 400;
  color: var(--color-text-muted, #5A9A82);
}

.suggestion-arrow {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
  opacity: 0;
  transition: opacity 0.12s ease;
}

.suggestion-item:hover .suggestion-arrow,
.suggestion-item.active .suggestion-arrow {
  opacity: 0.6;
}
</style>
