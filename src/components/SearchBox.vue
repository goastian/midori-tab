<template>
  <div class="search-box">
    <div class="search-inner">
      <button class="engine-btn" @click.stop="toggleEngineMenu" ref="engineBtn">
        <img :src="currentEngine.logo" :alt="currentEngine.label" class="engine-logo" />
        <span class="engine-arrow" :class="{ open: engineMenuOpen }">▾</span>
      </button>

      <Transition name="fade">
        <ul v-if="engineMenuOpen" class="engine-menu" ref="engineMenu">
          <li
            v-for="eng in engines"
            :key="eng.id"
            :class="{ active: eng.id === currentEngine.id }"
            @click.stop="selectEngine(eng)"
          >
            <img :src="eng.logo" :alt="eng.label" class="engine-menu-logo" />
            <span>{{ eng.label }}</span>
          </li>
        </ul>
      </Transition>

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

const ENGINES = [
  {
    id: 'astiango',
    logo: 'https://astian.org/wp-content/uploads/2025/06/favicon-1.png',
    label: 'AstianGO',
    url: 'https://astiango.com/?q=',
  },
  {
    id: 'qwant',
    logo: 'https://www.qwant.com/favicon.ico',
    label: 'Qwant',
    url: 'https://www.qwant.com/?l=es&q=',
  },
];

const ENGINE_STORAGE_KEY = 'midori_search_engine';

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
    const savedId = localStorage.getItem(ENGINE_STORAGE_KEY);
    const saved = ENGINES.find(e => e.id === savedId);
    return {
      query: '',
      engines: ENGINES,
      currentEngine: saved || ENGINES[0],
      engineMenuOpen: false,
      i18n: useI18nStore(),
    };
  },

  computed: {
    placeholder() {
      return this.i18n.t.search?.placeholder || `Buscar con ${this.currentEngine.label}...`;
    },
    searchLabel() {
      return this.i18n.t.search?.button || 'Buscar';
    },
  },

  methods: {
    /** Performs browser search using the selected engine. */
    search() {
      const q = this.query.trim();
      if (!q) return;
      const url = `${this.currentEngine.url}${encodeURIComponent(q)}`;
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

    toggleEngineMenu() {
      this.engineMenuOpen = !this.engineMenuOpen;
    },

    selectEngine(eng) {
      this.currentEngine = eng;
      this.engineMenuOpen = false;
      localStorage.setItem(ENGINE_STORAGE_KEY, eng.id);
      this.$refs.input?.focus();
    },

    handleClickOutside(event) {
      if (
        this.$refs.engineBtn &&
        !this.$refs.engineBtn.contains(event.target) &&
        this.$refs.engineMenu &&
        !this.$refs.engineMenu.contains(event.target)
      ) {
        this.engineMenuOpen = false;
      }
    },
  },

  mounted() {
    document.addEventListener('click', this.handleClickOutside);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside);
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

/* Engine selector button */
.engine-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.35rem 0.5rem;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease);
  flex-shrink: 0;
}

.engine-btn:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
}

.engine-logo {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  object-fit: contain;
}

.engine-arrow {
  font-size: 0.65rem;
  color: var(--color-text-muted, #5A9A82);
  transition: transform 0.15s ease;
}

.engine-arrow.open {
  transform: rotate(180deg);
}

/* Engine dropdown menu */
.engine-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  box-shadow: var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.14));
  list-style: none;
  padding: 4px;
  min-width: 160px;
}

.engine-menu li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
  transition: background var(--transition-fast, 0.1s ease);
}

.engine-menu li:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
}

.engine-menu li.active {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  font-weight: 600;
}

.engine-menu-logo {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: contain;
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

/* Transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.1s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
