<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click="$emit('close')">
        <Transition name="dialog-zoom">
          <div v-if="visible" class="shortcut-dialog" @click.stop>
            <div class="dialog-header">
              <span class="dialog-title">{{ i18n.$t('dashboard.shortcutsDialog.title') }}</span>
              <button class="dialog-close" type="button" @click="$emit('close')" :aria-label="i18n.$t('dashboard.shortcutsDialog.close')">x</button>
            </div>
            <div class="dialog-body">
              <label class="dialog-label">
                <span>{{ i18n.$t('dashboard.shortcutsDialog.address') }}</span>
                <input
                  v-model="form.url"
                  class="dialog-input"
                  type="url"
                  :placeholder="i18n.$t('dashboard.shortcutsDialog.addressPlaceholder')"
                  @keydown.enter="submit"
                  ref="shortcutUrlInput"
                />
              </label>
              <label class="dialog-label">
                <span>{{ i18n.$t('dashboard.shortcutsDialog.name') }}</span>
                <input
                  v-model="form.title"
                  class="dialog-input"
                  type="text"
                  :placeholder="i18n.$t('dashboard.shortcutsDialog.namePlaceholder')"
                  @keydown.enter="submit"
                />
              </label>
            </div>
            <div class="dialog-footer">
              <button class="dialog-btn-primary" type="button" @click="submit">{{ i18n.$t('dashboard.shortcutsDialog.add') }}</button>
              <button class="dialog-btn-secondary" type="button" @click="$emit('close')">{{ i18n.$t('dashboard.shortcutsDialog.cancel') }}</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue';

export default {
  name: 'ShortcutDialog',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    i18n: {
      type: Object,
      required: true,
    },
  },
  emits: ['close', 'submit-shortcut'],
  data() {
    return {
      form: {
        url: '',
        title: '',
      },
    };
  },
  watch: {
    visible(value) {
      if (!value) return;
      this.form = { url: '', title: '' };
      nextTick(() => {
        this.$refs.shortcutUrlInput?.focus();
      });
    },
  },
  methods: {
    submit() {
      this.$emit('submit-shortcut', { ...this.form });
    },
  },
};
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shortcut-dialog {
  width: 380px;
  max-width: 90vw;
  background: var(--surface-base, #080D14);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  overflow: hidden;
}

.dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0F1520);
}

.dialog-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.dialog-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.12s ease;
}

.dialog-close:hover {
  color: var(--color-text, white);
}

.dialog-body {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.dialog-label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text-muted, #5A9A82);
}

.dialog-input {
  padding: 0.6rem 0.75rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, #C4F0E0);
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.12s ease;
}

.dialog-input:focus {
  border-color: var(--color-primary, #04A469);
}

.dialog-input::placeholder {
  color: var(--color-text-dim, #3A5B4D);
}

.dialog-footer {
  display: flex;
  gap: 0.5rem;
  padding: 0.85rem 1.25rem;
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-sunken, #060A10);
}

.dialog-btn-primary,
.dialog-btn-secondary {
  padding: 0.5rem 1.25rem;
  border-radius: var(--radius-sm, 6px);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.12s ease;
}

.dialog-btn-primary {
  background: var(--color-primary, #04A469);
  color: white;
  border: none;
}

.dialog-btn-primary:hover {
  background: var(--color-primary-hover, #059b62);
}

.dialog-btn-secondary {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text-muted, #5A9A82);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  font-weight: 500;
}

.dialog-btn-secondary:hover {
  background: var(--surface-raised, #0F1520);
  color: var(--color-text, white);
}

.dialog-fade-enter-active { transition: opacity 0.15s ease; }
.dialog-fade-leave-active { transition: opacity 0.12s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }

.dialog-zoom-enter-active { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease; }
.dialog-zoom-leave-active { transition: transform 0.15s ease, opacity 0.12s ease; }
.dialog-zoom-enter-from { transform: scale(0.95); opacity: 0; }
.dialog-zoom-leave-to { transform: scale(0.95); opacity: 0; }
</style>
