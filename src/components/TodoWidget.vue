<template>
  <div class="todo-widget">
    <div class="todo-header">
      <span class="todo-title">✅ Tareas</span>
      <span class="todo-count">{{ doneCount }}/{{ items.length }}</span>
    </div>

    <div class="todo-input-row">
      <input
        v-model="newTask"
        class="todo-input"
        placeholder="Nueva tarea..."
        @keydown.enter="addTask"
      />
      <button class="todo-add-btn" @click="addTask">+</button>
    </div>

    <ul class="todo-list" v-if="items.length">
      <li v-for="(item, idx) in items" :key="idx" class="todo-item" :class="{ done: item.done }">
        <button class="todo-check" @click="toggleItem(idx)">
          <span v-if="item.done">✓</span>
        </button>
        <span class="todo-text">{{ item.text }}</span>
        <button class="todo-delete" @click="removeItem(idx)">×</button>
      </li>
    </ul>
    <p v-else class="todo-empty">Sin tareas pendientes</p>
  </div>
</template>

<script>
const STORAGE_KEY = 'midori_todos';

/**
 * Simple to-do list widget with persistent storage.
 * Supports add, toggle complete, and delete operations.
 */
export default {
  name: 'TodoWidget',

  data() {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      items: saved || [],
      newTask: '',
    };
  },

  computed: {
    doneCount() {
      return this.items.filter(i => i.done).length;
    },
  },

  methods: {
    /** Persists the todo list to localStorage. */
    save() {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    },

    addTask() {
      const text = this.newTask.trim();
      if (!text) return;
      this.items.push({ text, done: false });
      this.newTask = '';
      this.save();
    },

    toggleItem(idx) {
      this.items[idx].done = !this.items[idx].done;
      this.save();
    },

    removeItem(idx) {
      this.items.splice(idx, 1);
      this.save();
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

.todo-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--color-text, #C4F0E0);
}

.todo-count {
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

.todo-item:hover .todo-delete {
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
