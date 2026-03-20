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
      @input="save"
    ></textarea>
  </div>
</template>

<script>
const STORAGE_KEY = 'midori_notes';

/**
 * Simple persistent notepad widget.
 * Content is auto-saved to localStorage on every keystroke.
 */
export default {
  name: 'NotesWidget',

  data() {
    return {
      content: localStorage.getItem(STORAGE_KEY) || '',
    };
  },

  computed: {
    charCount() {
      return `${this.content.length} chars`;
    },
    placeholder() {
      return 'Escribe tus notas aqui...';
    },
  },

  methods: {
    /** Persists note content to localStorage. */
    save() {
      localStorage.setItem(STORAGE_KEY, this.content);
    },
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
