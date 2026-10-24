<template>
  <div class="todo-widget">
    <div class="todo-header" :class="{ 'todo-header--managed': managed }">
      <span v-if="!managed" class="todo-title">✅ {{ copy.title }}</span>
      <SaveStatus :storage="storage" :copy="safety" @retry="retry" />
      <span class="todo-count">{{ doneCount }}/{{ items.length }}</span>
    </div>

    <div class="todo-input-row">
      <input
        v-model="newTask"
        class="todo-input"
        :placeholder="copy.placeholder"
        :disabled="!ready"
        @keydown.enter="addTask"
      />
      <button class="todo-add-btn" :disabled="!ready" @click="addTask">+</button>
    </div>

    <ul class="todo-list" v-if="items.length">
      <li v-for="item in items" :key="item.id" class="todo-item" :class="{ done: item.done }" :data-id="item.id">
        <button class="todo-check" :disabled="!ready" @click="toggleItem(item.id)">
          <span v-if="item.done">✓</span>
        </button>
        <span class="todo-text">{{ item.text }}</span>
        <span v-if="item.conflictOf" class="todo-conflict">{{ safety.conflictCopy }}</span>
        <button class="todo-delete" :disabled="!ready" :aria-label="`${safety.remove}: ${item.text}`" @click="removeItem(item.id)">×</button>
      </li>
    </ul>
    <p v-else class="todo-empty">{{ copy.empty }}</p>
    <UndoToast :entry="undo" :copy="safety" @undo="undoLast" @dismiss="dismissUndo" />
  </div>
</template>

<script>
import { createSyncedRecord } from '../services/syncedRecord.js';
import { newId, touchItem } from '../services/itemIds.js';
import { mergeById } from '../services/listMerge.js';
import { createUndoBuffer } from '../services/undoBuffer.js';
import { normalizeTodos } from '../services/widgetData.js';
import useI18nStore from '../stores/useI18nStore.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import SaveStatus from './SaveStatus.vue';
import UndoToast from './UndoToast.vue';

const STORAGE_KEY = 'midori_todos';

export default {
  name: 'TodoWidget',
  components: { SaveStatus, UndoToast },

  props: {
    managed: { type: Boolean, default: false },
  },

  data() {
    return {
      items: [],
      storage: { load: 'idle', save: 'idle', error: null },
      undo: null,
      newTask: '',
      i18n: useI18nStore(),
    };
  },

  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).todoWidget;
    },
    safety() {
      return getWidgetCopy(this.i18n.locale).dataSafety;
    },
    ready() {
      return this.storage.load === 'ready';
    },
    doneCount() {
      return this.items.filter(i => i.done).length;
    },
  },

  created() {
    this.record = createSyncedRecord({
      key: STORAGE_KEY,
      maxBytes: 160_000,
      delayMs: 700,
      empty: () => [],
      normalize: normalizeTodos,
      merge: (base, local, remote) => mergeById(base, local, remote),
      getValue: () => this.items,
      setValue: value => { this.items = value; },
      onState: state => { this.storage = state; },
    });
    this.undoBuffer = createUndoBuffer(entry => { this.undo = entry; });
  },

  mounted() {
    void this.record.load();
  },

  beforeUnmount() {
    void this.record.flush();
    this.record.dispose();
    this.undoBuffer.clear();
  },

  methods: {
    retry() {
      void this.record.retry();
    },

    undoLast() {
      this.undoBuffer.undo();
    },

    dismissUndo() {
      this.undoBuffer.clear();
    },

    addTask() {
      if (!this.ready) return;
      const text = this.newTask.trim();
      if (!text) return;
      this.items.push({ id: newId(), text, done: false, rev: 1, updatedAt: Date.now() });
      this.newTask = '';
      void this.record.touch();
    },

    toggleItem(id) {
      const index = this.items.findIndex(item => item.id === id);
      if (!this.ready || index < 0) return;
      this.items.splice(index, 1, touchItem({ ...this.items[index], done: !this.items[index].done }));
      void this.record.touch();
    },

    removeItem(id) {
      const index = this.items.findIndex(item => item.id === id);
      if (!this.ready || index < 0) return;
      const [removed] = this.items.splice(index, 1);
      this.undoBuffer.push({ label: removed.text, restore: () => this.restoreItem(removed, index) });
      void this.record.touch();
    },

    restoreItem(item, index) {
      if (!this.ready || this.items.some(entry => entry.id === item.id)) return;
      this.items.splice(Math.min(index, this.items.length), 0, item);
      void this.record.touch();
    },
  },
};
</script>

<style scoped>
.todo-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.75rem;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.todo-header--managed {
  justify-content: flex-end;
}

.todo-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
}

.todo-conflict {
  flex-shrink: 0;
  padding: 0.05rem 0.4rem;
  border: 1px dashed var(--color-border-hover, rgba(126, 196, 168, 0.4));
  border-radius: 10rem;
  font-size: 0.62rem;
  color: var(--color-text-muted, #5A9A82);
}

.todo-header {
  gap: 0.5rem;
}

.todo-count {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--color-text-muted, #5A9A82);
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  padding: 0.15rem 0.5rem;
  border-radius: 10rem;
}

.todo-input-row {
  display: flex;
  gap: 0.35rem;
}

.todo-input {
  flex: 1;
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  font-size: 0.8rem;
  padding: 0.4rem 0.5rem;
  outline: none;
  font-family: inherit;
  transition: border-color var(--transition-fast, 0.1s ease);
}

.todo-input::placeholder {
  color: var(--color-text-muted, #5A9A82);
}

.todo-input:focus {
  border-color: var(--color-primary, #04A469);
}

.todo-add-btn {
  background: var(--color-primary, #04A469);
  border: none;
  color: white;
  width: 32px;
  border-radius: var(--radius-sm, 6px);
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  transition: background var(--transition-fast, 0.1s ease);
}

.todo-add-btn:hover {
  background: var(--color-primary-hover, #4de0b2);
}

.todo-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  max-height: 200px;
  overflow-y: auto;
}

.todo-item {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.4rem;
  border-radius: var(--radius-sm, 6px);
  transition: background var(--transition-fast, 0.1s ease);
}

.todo-item:hover {
  background: var(--surface-sunken, #060A10);
}

.todo-check {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 2px solid var(--color-border-hover, rgba(126,196,168,0.2));
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  color: var(--color-primary, #04A469);
  flex-shrink: 0;
  transition: all var(--transition-fast, 0.1s ease);
}

.todo-item.done .todo-check {
  background: var(--color-primary, #04A469);
  border-color: var(--color-primary, #04A469);
  color: white;
}

.todo-text {
  flex: 1;
  font-size: 0.8rem;
  color: var(--color-text, #C4F0E0);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.todo-item.done .todo-text {
  text-decoration: line-through;
  color: var(--color-text-dim, #3A5B4D);
}

.todo-delete {
  background: none;
  border: none;
  color: var(--color-text-dim, #3A5B4D);
  font-size: 1rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--transition-fast, 0.1s ease);
  flex-shrink: 0;
}

.todo-item:hover .todo-delete,
.todo-delete:focus-visible {
  opacity: 1;
}

.todo-delete:hover {
  color: var(--accent-danger, #e17055);
}

.todo-empty {
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-text-dim, #3A5B4D);
  padding: 0.5rem 0;
  margin: 0;
}
</style>
