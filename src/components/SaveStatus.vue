<template>
  <span v-if="message" class="save-status" :class="`save-status--${tone}`" role="status" aria-live="polite">
    <span>{{ message }}</span>
    <button v-if="failed" type="button" class="save-status__retry" @click="$emit('retry')">{{ copy.retry }}</button>
  </span>
</template>

<script>
export default {
  name: 'SaveStatus',
  props: {
    storage: { type: Object, required: true },
    copy: { type: Object, required: true },
  },
  emits: ['retry'],
  computed: {
    failed() {
      return this.storage.load === 'error' || this.storage.save === 'failed';
    },
    tone() {
      if (this.failed) return 'error';
      return this.storage.save === 'saving' ? 'busy' : 'ok';
    },
    message() {
      if (this.storage.load === 'error') return this.copy.loadFailed;
      if (this.storage.save === 'failed') return this.storage.error?.kind === 'quota' ? this.copy.storageFull : this.copy.saveFailed;
      if (this.storage.save === 'saving') return this.copy.saving;
      return this.storage.save === 'saved' ? this.copy.saved : '';
    },
  },
};
</script>

<style scoped>
.save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  font-size: 0.68rem;
  color: var(--color-text-muted, #5A9A82);
}

.save-status--error {
  color: var(--accent-danger, #e17055);
}

.save-status__retry {
  padding: 0.1rem 0.45rem;
  border: 1px solid currentColor;
  border-radius: 10rem;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
</style>
