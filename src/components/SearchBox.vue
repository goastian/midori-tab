<template>
  <div class="search-box">
    <div class="search-inner">
      <input
        ref="input"
        v-model="query"
        :placeholder="placeholder"
        class="search-input"
        @keydown.enter="search"
        @input="onInput"
        autocomplete="off"
        spellcheck="false"
      />

      <button class="search-btn" @click="search" :aria-label="searchLabel">
        <Search :size="18" :stroke-width="2" />
      </button>
    </div>
  </div>
</template>

<script>
import { Search } from 'lucide-vue-next';
import useI18nStore from '../stores/useI18nStore.js';

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
      i18n: useI18nStore(),
    };
  },

  computed: {
    placeholder() {
      return this.i18n.t.search?.placeholder || `Buscar con ${DEFAULT_ENGINE.label}...`;
    },
    searchLabel() {
      return this.i18n.t.search?.button || 'Buscar';
    },
  },

  methods: {
    /** Performs browser search using the default engine. */
    search() {
      const q = this.query.trim();
      if (!q) return;
      const url = `${DEFAULT_ENGINE.url}${encodeURIComponent(q)}`;
      const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
      if (this.searchTarget === 'New Tab') {
        browserAPI.tabs.create({ url });
      } else {
        browserAPI.tabs.update({ url });
      }
      this.query = '';
    },

    onInput() {
      // placeholder for future suggestions
    },
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
</style>
