<template>
  <Teleport to="body">
    <div v-if="entry" class="undo-toast" role="status" aria-live="polite">
      <span class="undo-toast__text">{{ message }}</span>
      <button type="button" class="undo-toast__action" @click="$emit('undo')">{{ copy.undo }}</button>
      <button type="button" class="undo-toast__close" :aria-label="copy.dismiss" @click="$emit('dismiss')">×</button>
    </div>
  </Teleport>
</template>

<script>
function isTyping(target) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

export default {
  name: 'UndoToast',
  props: {
    entry: { type: Object, default: null },
    copy: { type: Object, required: true },
  },
  emits: ['undo', 'dismiss'],
  computed: {
    message() {
      return this.copy.deleted.replace('{name}', this.entry?.label || '');
    },
  },
  watch: {
    entry(value) {
      if (value) this.listen();
      else this.unlisten();
    },
  },
  mounted() {
    if (this.entry) this.listen();
  },
  beforeUnmount() {
    this.unlisten();
  },
  methods: {
    listen() {
      if (this.keydown) return;
      this.keydown = event => {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z' && !isTyping(event.target)) {
          event.preventDefault();
          this.$emit('undo');
        }
      };
      document.addEventListener('keydown', this.keydown);
    },
    unlisten() {
      if (this.keydown) document.removeEventListener('keydown', this.keydown);
      this.keydown = null;
    },
  },
};
</script>

<style scoped>
.undo-toast {
  position: fixed;
  left: 50%;
  bottom: 4.5rem;
  z-index: 9300;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  max-width: min(32rem, calc(100vw - 2rem));
  padding: 0.5rem 0.6rem 0.5rem 0.9rem;
  transform: translateX(-50%);
  border: 1px solid var(--color-border-hover, rgba(126, 196, 168, 0.25));
  border-radius: var(--nova-island-radius, 12px);
  background: var(--surface-raised, #0f1520);
  box-shadow: var(--shadow-xl, 0 12px 32px rgba(0, 0, 0, 0.28));
  color: var(--color-text, #c4f0e0);
  font-size: 0.8rem;
}

.undo-toast__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.undo-toast__action {
  padding: 0.3rem 0.7rem;
  border: 0;
  border-radius: var(--nova-control-radius, 8px);
  background: var(--color-primary, #04a469);
  color: #fff;
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}

.undo-toast__close {
  padding: 0 0.3rem;
  border: 0;
  background: transparent;
  color: var(--color-text-muted, #5a9a82);
  font-size: 1.1rem;
  cursor: pointer;
}
</style>
