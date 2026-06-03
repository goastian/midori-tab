<template>
  <div class="notes-widget">
    <div class="notes-header">
      <span class="notes-title">📝 Notas</span>
      <span class="notes-count">{{ charCount }}</span>
    </div>
    <textarea
      v-model="content"
      class="notes-area"
      :placeholder="placeholder"
      @input="saveDebounced"
    ></textarea>
  </div>
</template>

<script>
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';
import useI18nStore from '../stores/useI18nStore.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';

const STORAGE_KEY = 'midori_notes';

export default {
  name: 'NotesWidget',

  data() {
    return {
      content: '',
      visibilityListener: null,
      pagehideListener: null,
      i18n: useI18nStore(),
    };
  },

  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).notesWidget;
    },
    charCount() {
      return this.copy.chars.replace('{n}', String(this.content.length));
    },
    placeholder() {
      return this.copy.placeholder;
    },
  },

  methods: {
    async load() {
      this.content = await getJson(STORAGE_KEY, '');
    },

    saveDebounced() {
      setJsonDebounced(STORAGE_KEY, this.content, { delayMs: 800, maxBytes: 200_000 });
    },

    flush() {
      return flushDebounced(STORAGE_KEY, this.content, { maxBytes: 200_000 }).catch(() => undefined);
    },
  },

  mounted() {
    this.load();
    this.visibilityListener = () => {
      if (document.visibilityState === 'hidden') {
        this.flush();
      }
    };
    this.pagehideListener = () => this.flush();
    document.addEventListener('visibilitychange', this.visibilityListener);
    window.addEventListener('pagehide', this.pagehideListener);
  },

  beforeUnmount() {
    if (this.visibilityListener) document.removeEventListener('visibilitychange', this.visibilityListener);
    if (this.pagehideListener) window.removeEventListener('pagehide', this.pagehideListener);
    this.flush();
  },
};
</script>

<style scoped>
.notes-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.75rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.notes-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notes-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
}

.notes-count {
  font-size: 0.7rem;
  color: var(--color-text-dim, #3A5B4D);
}

.notes-area {
  width: 100%;
  min-height: 120px;
  max-height: 200px;
  resize: vertical;
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  font-size: 0.8rem;
  font-family: inherit;
  padding: 0.5rem;
  outline: none;
  transition: border-color var(--transition-fast, 0.1s ease);
}

.notes-area::placeholder {
  color: var(--color-text-muted, #5A9A82);
}

.notes-area:focus {
  border-color: var(--color-primary, #04A469);
}
</style>
