<template>
  <div class="notes-widget">
    <div class="notes-header" :class="{ 'notes-header--managed': managed }">
      <span v-if="!managed" class="notes-title">📝 {{ copy.title }}</span>
      <SaveStatus :storage="storage" :copy="safety" @retry="retry" />
      <span class="notes-count">{{ charCount }}</span>
    </div>
    <textarea
      v-model="note.text"
      class="notes-area"
      :placeholder="placeholder"
      :disabled="!ready"
      @input="edited"
    ></textarea>
    <div v-if="conflict" class="notes-conflict" role="group" :aria-label="safety.conflictCopy">
      <p class="notes-conflict__text">{{ safety.noteConflict }}</p>
      <blockquote class="notes-conflict__copy">{{ conflict.text }}</blockquote>
      <div class="notes-conflict__actions">
        <button type="button" @click="useConflict">{{ safety.useVersion }}</button>
        <button type="button" @click="dismissConflict">{{ safety.dismiss }}</button>
      </div>
    </div>
  </div>
</template>

<script>
import { createSyncedRecord } from '../services/syncedRecord.js';
import { mergeNote } from '../services/listMerge.js';
import { emptyNote, normalizeNote } from '../services/widgetData.js';
import useI18nStore from '../stores/useI18nStore.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import SaveStatus from './SaveStatus.vue';

const STORAGE_KEY = 'midori_notes';

export default {
  name: 'NotesWidget',
  components: { SaveStatus },

  props: {
    managed: { type: Boolean, default: false },
  },

  data() {
    return {
      note: emptyNote(),
      storage: { load: 'idle', save: 'idle', error: null },
      i18n: useI18nStore(),
    };
  },

  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).notesWidget;
    },
    safety() {
      return getWidgetCopy(this.i18n.locale).dataSafety;
    },
    ready() {
      return this.storage.load === 'ready';
    },
    charCount() {
      return this.copy.chars.replace('{n}', String(this.note.text.length));
    },
    placeholder() {
      return this.copy.placeholder;
    },
    conflict() {
      return this.note.conflicts[0] || null;
    },
  },

  created() {
    this.record = createSyncedRecord({
      key: STORAGE_KEY,
      maxBytes: 200_000,
      delayMs: 800,
      coalesceMs: 150,
      empty: emptyNote,
      normalize: normalizeNote,
      merge: mergeNote,
      getValue: () => this.note,
      setValue: value => { this.note = value; },
      onState: state => { this.storage = state; },
    });
  },

  mounted() {
    void this.record.load();
    this.hideListener = () => {
      if (document.visibilityState === 'hidden') void this.record.flush();
    };
    this.pagehideListener = () => { void this.record.flush(); };
    document.addEventListener('visibilitychange', this.hideListener);
    window.addEventListener('pagehide', this.pagehideListener);
  },

  beforeUnmount() {
    document.removeEventListener('visibilitychange', this.hideListener);
    window.removeEventListener('pagehide', this.pagehideListener);
    void this.record.flush();
    this.record.dispose();
  },

  methods: {
    retry() {
      void this.record.retry();
    },

    edited() {
      if (!this.ready) return;
      this.note.rev += 1;
      this.note.updatedAt = Date.now();
      void this.record.touch();
    },

    /** Swaps the kept copy with the text being edited, so neither version is lost. */
    useConflict() {
      const copy = this.note.conflicts[0];
      if (!copy) return;
      const current = this.note.text;
      this.note.text = copy.text;
      this.note.conflicts.splice(0, 1, { text: current, at: Date.now() });
      this.edited();
    },

    dismissConflict() {
      this.note.conflicts.splice(0, 1);
      this.edited();
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

.notes-header--managed {
  justify-content: flex-end;
}

.notes-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
}

.notes-header {
  gap: 0.5rem;
}

.notes-conflict {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.5rem;
  border: 1px dashed var(--color-border-hover, rgba(126, 196, 168, 0.4));
  border-radius: var(--radius-sm, 6px);
  font-size: 0.72rem;
  color: var(--color-text-muted, #5A9A82);
}

.notes-conflict__text {
  margin: 0;
}

.notes-conflict__copy {
  max-height: 4.5rem;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--color-text, #C4F0E0);
}

.notes-conflict__actions {
  display: flex;
  gap: 0.4rem;
}

.notes-conflict__actions button {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--color-border-hover, rgba(126, 196, 168, 0.4));
  border-radius: 10rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.notes-count {
  margin-left: auto;
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
