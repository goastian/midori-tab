<template>
  <div class="search-box" ref="root" :class="{ 'has-suggestions': dropdownVisible }">
    <div class="search-inner">
      <input
        ref="input"
        v-model="query"
        :placeholder="placeholder"
        class="search-input"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="dropdownVisible"
        :aria-controls="suggestionsListId"
        :aria-activedescendant="activeSuggestionId"
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
        <DashboardIcon name="search" :size="18" aria-hidden="true" />
      </button>
    </div>

    <!-- AstianGO Bang guide — fetched only while composing a !shortcut. -->
    <div
      v-if="showBangSuggestions"
      id="midori-bang-suggestions"
      class="suggestions-dropdown bang-guide"
      role="listbox"
      :aria-label="bangGuideCopy.title"
    >
      <header class="bang-guide-header">
        <div>
          <strong>{{ bangGuideCopy.title }}</strong>
          <span>{{ bangGuideCopy.hint }}</span>
        </div>
        <code>!{{ activeBangFragment }}</code>
      </header>

      <div v-if="bangSuggestionsLoading" class="bang-guide-state">
        {{ bangGuideCopy.loading }}
      </div>

      <ul v-else-if="bangSuggestions.length" class="bang-suggestions-grid">
        <li
          v-for="(bang, i) in bangSuggestions"
          :id="`midori-bang-suggestion-${i}`"
          :key="`${bang.domain}-${bang.trigger}`"
          class="bang-suggestion-item"
          :class="{ active: i === bangActiveIndex }"
          role="option"
          :aria-selected="i === bangActiveIndex"
          @mousedown.prevent="selectBangSuggestion(bang)"
          @mouseenter="bangActiveIndex = i"
        >
          <span class="bang-site-initial" aria-hidden="true">{{ bangInitial(bang.name) }}</span>
          <span class="bang-site-identity">
            <strong>{{ bang.name }}</strong>
            <small>{{ bang.domain }}</small>
          </span>
          <code>!{{ bang.trigger }}</code>
        </li>
      </ul>

      <div v-else class="bang-guide-state">
        {{ bangSuggestionsError ? bangGuideCopy.unavailable : bangGuideCopy.empty }}
      </div>

      <footer class="bang-guide-footer">
        <span>{{ bangGuideCopy.footer }}</span>
        <button type="button" @click="openBangsDirectory">
          {{ bangGuideCopy.explore }}
        </button>
      </footer>
    </div>

    <!-- Regular search autocomplete. -->
    <div
      v-else-if="showSuggestions"
      id="midori-search-suggestions"
      class="suggestions-dropdown"
      role="listbox"
      :aria-label="searchLabel"
    >
      <ul class="suggestions-list" role="presentation">
        <li
          v-for="(s, i) in suggestions"
          :id="`midori-search-suggestion-${i}`"
          :key="i"
          class="suggestion-item"
          :class="{ active: i === activeIndex }"
          role="option"
          :aria-selected="i === activeIndex"
          @mousedown.prevent="selectSuggestion(s)"
          @mouseenter="activeIndex = i"
        >
          <DashboardIcon name="search" class="suggestion-icon" :size="14" :stroke-width="1.5" aria-hidden="true" />
          <span class="suggestion-text" v-html="highlightMatch(s)"></span>
          <span class="suggestion-arrow">↗</span>
        </li>
      </ul>
    </div>

    <span class="sr-only" role="status" aria-live="polite">{{ bangStatus }}</span>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import { fetchSuggestions } from '../services/DuckDuckGoSuggestService.js';
import { buildMidoriSearchUrl } from '../utils/searchUrl.js';
import DashboardIcon from './icons/DashboardIcon.vue';

const ASTIANGO_BANGS_DIRECTORY_URL = 'https://astiango.com/bangs';
const ASTIANGO_BANG_SUGGESTIONS_URL = 'https://astiango.com/api/bangs/suggestions';
const MAX_BANG_SUGGESTIONS = 12;
const BANG_CACHE_LIMIT = 16;
const bangSuggestionCache = new Map();

function normalizeBangSuggestion(item) {
  const trigger = String(item?.trigger || '').trim().replace(/^!+/, '');
  if (!trigger) return null;

  const domain = String(item?.domain || '').trim();
  const name = String(item?.name || domain || trigger).trim();
  return { trigger, name, domain };
}

function cacheBangSuggestions(fragment, suggestions) {
  if (bangSuggestionCache.size >= BANG_CACHE_LIMIT && !bangSuggestionCache.has(fragment)) {
    bangSuggestionCache.delete(bangSuggestionCache.keys().next().value);
  }
  bangSuggestionCache.set(fragment, suggestions);
}

const DEFAULT_ENGINE = {
  id: 'astiango',
  logo: 'https://astian.org/wp-content/uploads/2025/06/favicon-1.png',
  label: 'AstianGO',
};

export default {
  name: 'SearchBox',
  components: {
    DashboardIcon,
  },

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
      bangSuggestions: [],
      bangActiveIndex: -1,
      showBangSuggestions: false,
      bangSuggestionsLoading: false,
      bangSuggestionsError: false,
      bangAnnouncement: '',
      originalQuery: '',
      i18n: useI18nStore(),
      _debounceTimer: null,
      _bangSuggestionController: null,
      _bangSuggestionRequestId: 0,
    };
  },

  computed: {
    activeBangMatch() {
      const value = String(this.query || '');
      const match = value.match(/(^|\s)!([^\s!]*)$/u);
      if (!match) return null;

      return {
        fragment: match[2].toLowerCase(),
        tokenStart: value.length - match[2].length - 1,
        tokenEnd: value.length,
      };
    },
    activeBangFragment() {
      return this.activeBangMatch?.fragment || '';
    },
    isBangQuery() {
      return /(^|\s)![^\s!]*/u.test(String(this.query || ''));
    },
    dropdownVisible() {
      return this.showBangSuggestions || this.showSuggestions;
    },
    suggestionsListId() {
      if (this.showBangSuggestions) return 'midori-bang-suggestions';
      if (this.showSuggestions) return 'midori-search-suggestions';
      return undefined;
    },
    activeSuggestionId() {
      if (this.showBangSuggestions && this.bangActiveIndex >= 0) {
        return `midori-bang-suggestion-${this.bangActiveIndex}`;
      }
      if (this.showSuggestions && this.activeIndex >= 0) {
        return `midori-search-suggestion-${this.activeIndex}`;
      }
      return undefined;
    },
    bangGuideCopy() {
      const keys = [
        'title', 'hint', 'footer', 'explore', 'loading',
        'empty', 'unavailable', 'available', 'selected',
      ];
      return Object.fromEntries(keys.map(name => [name, this.i18n.$t(`search.bangs.${name}`)]));
    },
    bangStatus() {
      if (this.bangAnnouncement) return this.bangAnnouncement;
      if (this.bangSuggestionsLoading) return this.bangGuideCopy.loading;
      if (this.showBangSuggestions && this.bangSuggestions.length) {
        return this.bangGuideCopy.available.replace('{count}', this.bangSuggestions.length);
      }
      return '';
    },
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
    /**
     * Sends every query to AstianGO. Bang resolution intentionally stays on
     * AstianGO so the New Tab does not ship or maintain the Bang catalog.
     */
    search(q) {
      const term = (typeof q === 'string' ? q : this.query).trim();
      if (!term) return;
      const url = buildMidoriSearchUrl(term);
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
      this.bangAnnouncement = '';

      if (this.activeBangMatch) {
        this.closeSearchSuggestions();
        this._bangSuggestionController?.abort();
        this._bangSuggestionController = null;
        this._bangSuggestionRequestId += 1;
        this.bangSuggestions = [];
        this.showBangSuggestions = true;
        this.bangActiveIndex = -1;
        this.bangSuggestionsError = false;
        this.bangSuggestionsLoading = true;
        const fragment = this.activeBangFragment;
        this._debounceTimer = setTimeout(() => this.loadBangSuggestions(fragment), 100);
        return;
      }

      this.closeBangSuggestions();

      // AstianGO resolves Bangs after navigation. Avoid an unrelated DDG
      // autocomplete round trip while the user is composing a Bang query.
      if (this.isBangQuery) {
        this.closeSuggestions();
        return;
      }

      const q = this.query.trim();
      if (q.length < 2) {
        this.closeSuggestions();
        return;
      }
      this._debounceTimer = setTimeout(() => this.loadSuggestions(q), 200);
    },

    async loadBangSuggestions(fragment) {
      const cacheKey = String(fragment || '').trim().toLowerCase();
      const cached = bangSuggestionCache.get(cacheKey);
      if (cached) {
        this.bangSuggestions = cached;
        this.bangSuggestionsLoading = false;
        return;
      }

      this._bangSuggestionController?.abort();
      const controller = new AbortController();
      const requestId = ++this._bangSuggestionRequestId;
      this._bangSuggestionController = controller;

      try {
        const url = new URL(ASTIANGO_BANG_SUGGESTIONS_URL);
        url.searchParams.set('q', cacheKey);
        url.searchParams.set('limit', String(MAX_BANG_SUGGESTIONS));
        const response = await fetch(url, {
          signal: controller.signal,
          credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();
        const suggestions = (Array.isArray(payload?.data) ? payload.data : [])
          .map(normalizeBangSuggestion)
          .filter(Boolean)
          .slice(0, MAX_BANG_SUGGESTIONS);

        if (requestId !== this._bangSuggestionRequestId || this.activeBangFragment !== cacheKey) return;
        cacheBangSuggestions(cacheKey, suggestions);
        this.bangSuggestions = suggestions;
        this.bangSuggestionsError = false;
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (requestId === this._bangSuggestionRequestId) {
          this.bangSuggestions = [];
          this.bangSuggestionsError = true;
        }
      } finally {
        if (requestId === this._bangSuggestionRequestId) {
          this.bangSuggestionsLoading = false;
          this._bangSuggestionController = null;
        }
      }
    },

    async loadSuggestions(q) {
      try {
        const results = await fetchSuggestions(q);
        if (this.query.trim() !== q || this.isBangQuery) return;
        this.suggestions = results.slice(0, 8);
        this.activeIndex = -1;
        this.showSuggestions = this.suggestions.length > 0;
      } catch (e) {
        if (e.name !== 'AbortError') this.closeSuggestions();
      }
    },

    onEnter() {
      if (this.showBangSuggestions && this.bangActiveIndex >= 0) {
        this.selectBangSuggestion(this.bangSuggestions[this.bangActiveIndex]);
        return;
      }
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

    selectBangSuggestion(bang) {
      const match = this.activeBangMatch;
      if (!match || !bang?.trigger) return;

      const before = this.query.slice(0, match.tokenStart);
      const after = this.query.slice(match.tokenEnd).replace(/^\s+/, '');
      const replacement = `!${bang.trigger} `;
      const cursorPosition = before.length + replacement.length;
      this.query = `${before}${replacement}${after}`;
      this.originalQuery = this.query;
      this.bangAnnouncement = this.bangGuideCopy.selected
        .replace('{bang}', `!${bang.trigger}`)
        .replace('{site}', bang.name);
      this.closeBangSuggestions({ preserveAnnouncement: true });

      this.$nextTick(() => {
        this.$refs.input?.focus();
        this.$refs.input?.setSelectionRange(cursorPosition, cursorPosition);
      });
    },

    openBangsDirectory() {
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      browserAPI.tabs.create({ url: ASTIANGO_BANGS_DIRECTORY_URL });
      this.closeSuggestions();
    },

    bangInitial(name) {
      return String(name || '?').trim().charAt(0).toUpperCase();
    },

    moveDown() {
      if (this.showBangSuggestions) {
        if (!this.bangSuggestions.length) return;
        this.bangActiveIndex = (this.bangActiveIndex + 1) % this.bangSuggestions.length;
        this.scrollActiveBangIntoView();
        return;
      }
      if (!this.showSuggestions) return;
      this.activeIndex = (this.activeIndex + 1) % this.suggestions.length;
      this.query = this.suggestions[this.activeIndex];
    },

    moveUp() {
      if (this.showBangSuggestions) {
        if (!this.bangSuggestions.length) return;
        this.bangActiveIndex = this.bangActiveIndex <= 0
          ? -1
          : this.bangActiveIndex - 1;
        this.scrollActiveBangIntoView();
        return;
      }
      if (!this.showSuggestions) return;
      if (this.activeIndex <= 0) {
        this.activeIndex = -1;
        this.query = this.originalQuery;
      } else {
        this.activeIndex--;
        this.query = this.suggestions[this.activeIndex];
      }
    },

    scrollActiveBangIntoView() {
      if (this.bangActiveIndex < 0) return;
      this.$nextTick(() => {
        document.getElementById(`midori-bang-suggestion-${this.bangActiveIndex}`)
          ?.scrollIntoView({ block: 'nearest' });
      });
    },

    closeSearchSuggestions() {
      this.suggestions = [];
      this.activeIndex = -1;
      this.showSuggestions = false;
    },

    closeBangSuggestions({ preserveAnnouncement = false } = {}) {
      this._bangSuggestionController?.abort();
      this._bangSuggestionController = null;
      this._bangSuggestionRequestId += 1;
      this.bangSuggestions = [];
      this.bangActiveIndex = -1;
      this.showBangSuggestions = false;
      this.bangSuggestionsLoading = false;
      this.bangSuggestionsError = false;
      if (!preserveAnnouncement) this.bangAnnouncement = '';
    },

    closeSuggestions() {
      this.closeSearchSuggestions();
      this.closeBangSuggestions();
    },

    onFocus() {
      if (this.activeBangMatch) {
        this.onInput();
        return;
      }
      if (!this.isBangQuery && this.suggestions.length > 0) this.showSuggestions = true;
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
    import('../bootstrap/perfMarks.js').then(({ default: perfMarks }) => {
      perfMarks.mark('search-ready');
    });
  },

  beforeUnmount() {
    document.removeEventListener('mousedown', this.onClickOutside);
    clearTimeout(this._debounceTimer);
    this._bangSuggestionController?.abort();
  },
};
</script>

<style scoped>
.search-box {
  width: 100%;
  background: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border-strong, rgba(126,196,168,0.22));
  border-radius: var(--nova-panel-radius, 14px);
  padding: var(--nova-segment-padding, 4px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
  transition: border-color var(--transition-fast, 0.1s ease), box-shadow var(--transition-fast, 0.1s ease);
  position: relative;
}

.search-box:focus-within {
  border-color: var(--color-primary, #04A469);
  box-shadow: 0 0 0 3px var(--color-accent-border, rgba(4,164,105,0.2));
}

.search-inner {
  display: flex;
  align-items: center;
  gap: 0;
  min-height: var(--nova-search-height, 48px);
  background: var(--surface-control, #060A10);
  border-radius: var(--nova-island-radius, 12px);
  padding: 0.25rem 0.35rem 0.25rem 0.75rem;
  position: relative;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text, #C4F0E0);
  font-size: 0.95rem;
  padding: 0.5rem;
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

.search-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  background: var(--color-primary, #04A469);
  border: none;
  border-radius: var(--nova-control-radius, 8px);
  color: white;
  cursor: pointer;
  transition: background var(--transition-fast, 0.1s ease);
}

.search-btn:hover {
  background: var(--color-primary-hover, #4de0b2);
}

.suggestions-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  overflow: hidden;
  background: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border-strong, rgba(126,196,168,0.15));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: var(--shadow-floating, 0 8px 24px rgba(0, 0, 0, 0.18));
}

.bang-guide {
  background: var(--surface-raised, #0F1520);
}

.bang-guide-header,
.bang-guide-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 16px;
}

.bang-guide-header {
  border-bottom: 1px solid var(--color-border, rgba(126, 196, 168, 0.12));
}

.bang-guide-header > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.bang-guide-header strong {
  color: var(--color-text, #C4F0E0);
  font-size: 0.86rem;
}

.bang-guide-header span,
.bang-guide-footer span,
.bang-site-identity small {
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.72rem;
}

.bang-guide-header code,
.bang-suggestion-item code {
  flex-shrink: 0;
  padding: 5px 7px;
  color: var(--color-primary, #04A469);
  background: var(--color-accent-soft, rgba(4, 164, 105, 0.12));
  border-radius: 7px;
  font: 700 0.72rem/1 ui-monospace, SFMono-Regular, Consolas, monospace;
}

.bang-suggestions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 2px 8px;
  max-height: 344px;
  margin: 0;
  padding: 8px;
  overflow-y: auto;
  list-style: none;
}

.bang-suggestion-item {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 9px 10px;
  border-radius: var(--nova-control-radius, 8px);
  cursor: pointer;
}

.bang-suggestion-item:hover,
.bang-suggestion-item.active {
  background: var(--surface-control-hover, #1E2D3D);
}

.bang-site-initial {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  color: var(--color-primary, #04A469);
  background: var(--surface-control, #060A10);
  border: 1px solid var(--color-border-strong, rgba(126, 196, 168, 0.2));
  border-radius: 8px;
  font-size: 0.76rem;
  font-weight: 750;
}

.bang-site-identity {
  display: grid;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.bang-site-identity strong,
.bang-site-identity small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bang-site-identity strong {
  color: var(--color-text, #C4F0E0);
  font-size: 0.8rem;
}

.bang-guide-state {
  padding: 22px 16px;
  color: var(--color-text-muted, #5A9A82);
  text-align: center;
  font-size: 0.8rem;
}

.bang-guide-footer {
  border-top: 1px solid var(--color-border, rgba(126, 196, 168, 0.12));
  background: var(--surface-control, rgba(6, 10, 16, 0.5));
}

.bang-guide-footer button {
  flex-shrink: 0;
  padding: 0;
  color: var(--color-primary, #04A469);
  background: none;
  border: 0;
  cursor: pointer;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
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
  border-radius: var(--nova-control-radius, 8px);
  cursor: pointer;
  color: var(--color-text, #C4F0E0);
  font-size: 0.9rem;
  transition: background 0.12s ease;
}

.suggestion-item:hover,
.suggestion-item.active {
  background: var(--surface-control-hover, #1E2D3D);
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

@media (max-width: 620px) {
  .bang-suggestions-grid {
    grid-template-columns: 1fr;
  }

  .bang-guide-footer span {
    display: none;
  }
}
</style>
