<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="sheet-overlay" @click="$emit('close')"></div>
    </Transition>
    <Transition name="sheet-slide">
      <section
        v-if="visible"
        ref="sheet"
        class="widget-sheet"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-labelledby="titleId"
        @keydown.esc="$emit('close')"
      >
        <div class="sheet-header">
          <div class="sheet-heading">
            <span :id="titleId" class="sheet-title">{{ i18n.$t('dashboard.widgetsSheet.title') }}</span>
            <span class="sheet-subtitle">{{ sheetSubtitle }}</span>
          </div>
          <div class="sheet-actions">
            <button class="sheet-reset" type="button" @click="$emit('reset-order')">
              <DashboardIcon name="reset" :size="15" :stroke-width="1.8" aria-hidden="true" />
              <span>{{ i18n.$t('dashboard.widgetBoard.reset') }}</span>
            </button>
            <button class="sheet-close" type="button" :aria-label="i18n.$t('dashboard.widgetsSheet.close')" @click="$emit('close')">
              <DashboardIcon name="close" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="sheet-grid">
          <button
            v-for="widget in widgets"
            :key="widget.key"
            type="button"
            class="sheet-item"
            :class="{ active: enabled[widget.key] }"
            :aria-pressed="Boolean(enabled[widget.key])"
            @click="$emit('toggle', widget.key)"
          >
            <span class="sheet-item-icon" aria-hidden="true">
              <DashboardIcon :name="widget.icon" :size="18" :stroke-width="1.7" />
            </span>
            <span class="sheet-item-copy">
              <span class="sheet-item-label">{{ widget.label }}</span>
              <span class="sheet-item-status">
                {{ enabled[widget.key] ? i18n.$t('common.on') : i18n.$t('common.off') }}
              </span>
            </span>
            <span class="sheet-item-indicator" aria-hidden="true">
              <span v-if="enabled[widget.key]">&#10003;</span>
              <span v-else>+</span>
            </span>
          </button>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue';
import DashboardIcon from './icons/DashboardIcon.vue';

export default {
  name: 'WidgetPicker',
  components: {
    DashboardIcon,
  },
  emits: ['close', 'toggle', 'reset-order'],
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
    activeCount: {
      type: Number,
      default: 0,
    },
    i18n: {
      type: Object,
      required: true,
    },
  },
  computed: {
    titleId() {
      return 'midori-widget-picker-title';
    },
    sheetSubtitle() {
      return String(this.i18n.$t('dashboard.widgetsSheet.subtitle'))
        .replace('{count}', String(this.activeCount));
    },
  },
  watch: {
    visible(isVisible) {
      if (!isVisible) return;
      nextTick(() => this.$refs.sheet?.focus());
    },
  },
};
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 12, 9, 0.42);
  z-index: 8000;
}

.widget-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 8001;
  max-height: min(620px, 76vh);
  overflow-y: auto;
  background: var(--surface-base, #080D14);
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 18px 18px 0 0;
  padding: 1.1rem clamp(1rem, 4vw, 3.5rem) 1.75rem;
  box-shadow: 0 -18px 48px rgba(3, 12, 9, 0.22);
}

.sheet-header {
  width: min(1040px, 100%);
  margin: 0 auto 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.sheet-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.16rem;
}

.sheet-title {
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.015em;
  color: var(--color-text, white);
}

.sheet-subtitle {
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.72rem;
  line-height: 1.35;
}

.sheet-actions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.sheet-reset,
.sheet-close {
  min-height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--nova-control-radius, 8px);
  color: var(--color-text-muted, #5A9A82);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 550;
  cursor: pointer;
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease;
}

.sheet-reset {
  padding: 0.4rem 0.65rem;
}

.sheet-close {
  width: 34px;
}

.sheet-reset:hover,
.sheet-close:hover {
  color: var(--color-text, white);
  background: var(--color-border-hover, rgba(126,196,168,0.2));
}

.sheet-grid {
  width: min(1040px, 100%);
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
}

.sheet-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  min-width: 0;
  padding: 0.72rem;
  background: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 11px;
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  text-align: left;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
}

.sheet-item:hover {
  background: var(--surface-control-hover, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
  color: var(--color-text, #C4F0E0);
  transform: translateY(-1px);
}

.sheet-item.active {
  border-color: var(--color-primary, #04A469);
  background: rgba(4, 164, 105, 0.08);
  color: var(--color-text, #C4F0E0);
}

.sheet-item-icon {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--surface-overlay, #1E2D3D);
  font-size: 1.05rem;
}

.sheet-item-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.sheet-item-label {
  overflow: hidden;
  color: var(--color-text, #C4F0E0);
  font-size: 0.76rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-item-status {
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.65rem;
}

.sheet-item-indicator {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 7px;
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.78rem;
  font-weight: 700;
}

.sheet-item.active .sheet-item-indicator {
  border-color: var(--color-primary, #04A469);
  background: var(--color-primary, #04A469);
  color: white;
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

@media (max-width: 820px) {
  .sheet-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 480px) {
  .widget-sheet {
    max-height: 82vh;
    padding-inline: 0.85rem;
  }

  .sheet-grid {
    grid-template-columns: 1fr;
  }

  .sheet-reset span {
    display: none;
  }
}
</style>
