<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="sheet-overlay" @click="$emit('close')"></div>
    </Transition>
    <Transition name="sheet-slide">
      <div v-if="visible" class="widget-sheet">
        <div class="sheet-header">
          <span class="sheet-title">{{ i18n.$t('dashboard.widgetsSheet.title') }}</span>
          <button class="sheet-close" type="button" :aria-label="i18n.$t('dashboard.widgetsSheet.close')" @click="$emit('close')">✕</button>
        </div>
        <div class="sheet-grid">
          <button
            v-for="widget in widgets"
            :key="widget.key"
            class="sheet-item"
            :class="{ active: enabled[widget.key] }"
            @click="$emit('toggle', widget.key)"
          >
            <span class="sheet-item-icon">{{ widget.icon }}</span>
            <span class="sheet-item-label">{{ widget.label }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
export default {
  name: 'WidgetPicker',
  emits: ['close', 'toggle'],
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    widgets: {
      type: Array,
      default: () => [],
    },
    enabled: {
      type: Object,
      default: () => ({}),
    },
    i18n: {
      type: Object,
      required: true,
    },
  },
};
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 8000;
}

.widget-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 8001;
  background: var(--surface-base, #080D14);
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-lg, 16px) var(--radius-lg, 16px) 0 0;
  padding: 1.25rem 2rem 2rem;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.2);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sheet-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.sheet-close {
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

.sheet-close:hover {
  color: var(--color-text, white);
  background: var(--color-border-hover, rgba(126,196,168,0.2));
}

.sheet-grid {
  display: flex;
  gap: 1rem;
  overflow-x: auto;
  padding-bottom: 0.5rem;
}

.sheet-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  min-width: 80px;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  transition: all 0.12s ease;
  flex-shrink: 0;
}

.sheet-item:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
  color: var(--color-text, #C4F0E0);
}

.sheet-item.active {
  border-color: var(--color-primary, #04A469);
  background: rgba(4, 164, 105, 0.08);
  color: var(--color-primary, #04A469);
}

.sheet-item-icon {
  font-size: 1.8rem;
}

.sheet-item-label {
  font-size: 0.72rem;
  font-weight: 500;
  white-space: nowrap;
}

.sheet-fade-enter-active {
  transition: opacity 0.15s ease;
}

.sheet-fade-leave-active {
  transition: opacity 0.12s ease;
}

.sheet-fade-enter-from,
.sheet-fade-leave-to {
  opacity: 0;
}

.sheet-slide-enter-active {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.sheet-slide-leave-active {
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.sheet-slide-enter-from,
.sheet-slide-leave-to {
  transform: translateY(100%);
}
</style>
