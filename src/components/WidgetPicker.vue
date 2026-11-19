<template>
  <Teleport to="body">
    <Transition name="widget-backdrop" appear>
      <div v-if="visible" class="sheet-overlay" @click="$emit('close')"></div>
    </Transition>
    <Transition name="widget-picker" appear>
      <section v-if="visible" ref="sheet" class="widget-sheet" role="dialog" aria-modal="true" tabindex="-1" :aria-labelledby="`${pickerId}-title`" :aria-describedby="`${pickerId}-subtitle`">
        <header class="sheet-header">
          <div class="sheet-heading">
            <h2 :id="`${pickerId}-title`" class="sheet-title">{{ copy('title') }}</h2>
            <p :id="`${pickerId}-subtitle`" class="sheet-subtitle">{{ copy('subtitle') }}</p>
          </div>
          <div class="sheet-actions">
            <button class="sheet-reset" type="button" :disabled="!canResetOrder" :aria-label="copy('reset')" :title="copy('reset')" @click="resetOrder">
              <DashboardIcon name="reset" :size="18" :stroke-width="1.7" aria-hidden="true" />
            </button>
            <button class="sheet-close" type="button" :aria-label="copy('close')" :title="copy('close')" @click="$emit('close')">
              <DashboardIcon name="close" :size="18" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </div>
        </header>
        <div class="sheet-body">
          <div class="sheet-grid">
            <button v-for="widget in widgets" :key="widget.key" type="button" class="sheet-item" :class="{ active: enabled[widget.key] }" :data-widget="widget.key" :aria-pressed="Boolean(enabled[widget.key])" :aria-labelledby="`${pickerId}-${widget.key}-label`" :aria-describedby="`${pickerId}-${widget.key}-description`" @click="toggleWidget(widget.key)">
              <WidgetIcon :name="widget.icon" :size="44" />
              <span class="sheet-item-copy">
                <span :id="`${pickerId}-${widget.key}-label`" class="sheet-item-label">{{ widget.label }}</span>
                <span :id="`${pickerId}-${widget.key}-description`" class="sheet-item-description">{{ widget.description }}</span>
              </span>
              <span class="sheet-item-indicator" aria-hidden="true">
                <svg v-if="enabled[widget.key]" width="16" height="16" viewBox="0 0 16 16"><path d="m3 8 3 3 7-7" /></svg>
                <DashboardIcon v-else name="plus" :size="14" :stroke-width="1.6" />
              </span>
            </button>
          </div>
        </div>
        <footer class="sheet-footer">
          <p class="sheet-summary" role="status" aria-live="polite" aria-atomic="true">{{ announcement || activeSummary }}</p>
          <button class="sheet-done" type="button" @click="$emit('close')">{{ copy('done') }}</button>
        </footer>
      </section>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick, useId } from 'vue';
import DashboardIcon from './icons/DashboardIcon.vue';
import WidgetIcon from './icons/WidgetIcon.vue';
import { manageDialogFocus } from '../utils/dialogFocus.js';

export default {
  name: 'WidgetPicker',
  components: { DashboardIcon, WidgetIcon },
  setup() { return { pickerId: useId() }; },
  emits: ['close', 'toggle', 'reset-order'],
  props: {
    visible: { type: Boolean, default: false },
    widgets: { type: Array, default: () => [] },
    enabled: { type: Object, default: () => ({}) },
    activeCount: { type: Number, default: 0 },
    canResetOrder: { type: Boolean, default: false },
    i18n: { type: Object, required: true },
  },
  data() { return { announcement: '' }; },
  computed: {
    activeSummary() {
      return this.copy(this.activeCount === 1 ? 'activeOne' : 'activeMany')
        .replace('{count}', new Intl.NumberFormat(this.i18n.locale).format(this.activeCount));
    },
  },
  watch: {
    visible: {
      immediate: true,
      handler(visible) {
        this.releaseDialogFocus?.();
        if (!visible) return;
        nextTick(() => {
          if (this.visible) this.releaseDialogFocus = manageDialogFocus(this.$refs.sheet, {
            close: () => this.$emit('close'), restoreTo: '.bottom-actions .action-btn',
          });
        });
      },
    },
  },
  beforeUnmount() { this.releaseDialogFocus?.(); },
  methods: {
    copy(key) { return String(this.i18n.$t(`dashboard.widgetsSheet.${key}`)); },
    toggleWidget(key) { this.announcement = ''; this.$emit('toggle', key); },
    resetOrder() { this.$emit('reset-order'); this.announcement = this.copy('orderReset'); },
  },
};
</script>

<style scoped>
/* Hallmark · modern-minimal · studied Astian DNA · component scope
 * pre-emit critique: P5 H5 E5 S5 R5 V4 */
.sheet-overlay { position: fixed; inset: 0; background: var(--control-overlay); z-index: var(--z-modal); }
.widget-sheet { position: fixed; inset: auto 0 var(--space-md); width: min(1120px, calc(100% - var(--space-xl))); max-height: min(700px, 86dvh); margin-inline: auto; display: flex; flex-direction: column; z-index: calc(var(--z-modal) + 1); overflow: clip; color: var(--color-text); background: var(--surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-panel); box-shadow: var(--control-shadow); }
.widget-sheet:focus { outline: none; }
.sheet-header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--space-lg); padding: var(--space-lg); background: var(--ecosystem-soft); border-bottom: 1px solid var(--color-border); flex-shrink: 0; }
.sheet-heading { min-width: 0; }
.sheet-title { margin: 0; font-size: var(--text-xl); font-weight: 300; letter-spacing: -.025em; line-height: 1.15; }
.sheet-subtitle { margin: var(--space-sm) 0 0; color: var(--color-text-secondary); font-size: var(--text-sm); line-height: 1.5; }
.sheet-actions { display: flex; gap: var(--space-xs); flex-shrink: 0; }
.sheet-reset, .sheet-close { display: grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid var(--color-transparent); border-radius: var(--radius-pill); background: var(--color-transparent); color: var(--color-text-secondary); cursor: pointer; transition: background-color var(--transition-fast), color var(--transition-fast); }
.sheet-reset:disabled { opacity: .4; cursor: not-allowed; }
.sheet-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: var(--space-lg); }
.sheet-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-sm); }
.sheet-item { display: grid; grid-template-columns: 44px minmax(0, 1fr) 24px; align-items: center; gap: var(--space-sm); min-width: 0; min-height: 112px; padding: var(--space-md); border: 1px solid var(--color-border); border-radius: var(--radius-control); color: var(--color-text); background: var(--surface-raised); font-family: inherit; cursor: pointer; text-align: start; transition: background-color var(--transition-fast), border-color var(--transition-fast); }
.sheet-item.active { border-color: var(--color-primary); background: var(--color-primary-subtle); }
.sheet-item-copy { display: flex; min-width: 0; flex-direction: column; gap: var(--space-xs); }
.sheet-item-label { font-size: var(--text-sm); font-weight: 600; line-height: 1.4; white-space: nowrap; }
.sheet-item-description { font-size: var(--text-xs); font-weight: 400; line-height: 1.5; color: var(--color-text-secondary); }
.sheet-item-indicator { display: grid; place-items: center; width: 24px; height: 24px; border: 1px solid var(--color-border-hover); border-radius: var(--radius-pill); color: var(--color-text-secondary); background: var(--surface-raised); }
.sheet-item.active .sheet-item-indicator { color: var(--control-primary-ink); background: var(--control-primary-bg); border-color: var(--control-primary-bg); }
.sheet-item-indicator > svg { fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.sheet-footer { display: flex; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-md) var(--space-lg); border-top: 1px solid var(--color-border); flex-shrink: 0; }
.sheet-summary { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); line-height: 1.5; }
.sheet-done { min-width: 112px; min-height: 44px; padding: var(--space-sm) var(--space-lg); border: 1px solid var(--color-transparent); border-radius: var(--radius-pill); background: var(--control-primary-bg); color: var(--control-primary-ink); font: inherit; font-size: var(--text-sm); font-weight: 600; cursor: pointer; white-space: nowrap; transition: background-color var(--transition-fast); }
.sheet-item:active { background: var(--surface-sunken); }
.sheet-reset:active:not(:disabled), .sheet-close:active { background: var(--surface-sunken); }
.sheet-done:active { background: var(--control-primary-hover); }
@media (hover: hover) {
  .sheet-reset:hover:not(:disabled), .sheet-close:hover { background: var(--color-primary-subtle); color: var(--color-text); }
  .sheet-item:hover { background: var(--ecosystem-soft); border-color: var(--color-border-hover); }
  .sheet-item.active:hover { background: var(--color-primary-subtle); border-color: var(--color-primary); }
  .sheet-done:hover { background: var(--control-primary-hover); }
}
.widget-backdrop-enter-active { transition: opacity var(--dur-short) var(--ease-out); }
.widget-backdrop-leave-active { transition: opacity var(--dur-exit) var(--ease-in); }
.widget-picker-enter-active { transition: opacity var(--dur-short) var(--ease-out), transform var(--dur-short) var(--ease-out); }
.widget-picker-leave-active { transition: opacity var(--dur-exit) var(--ease-in), transform var(--dur-exit) var(--ease-in); }
.widget-backdrop-enter-from, .widget-backdrop-leave-to { opacity: 0; }
.widget-picker-enter-from, .widget-picker-leave-to { opacity: 0; transform: translateY(16px); }
@media (max-width: 1000px) { .sheet-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 580px) {
  .widget-sheet { inset: auto 0 0; width: 100%; max-height: 88dvh; border-radius: var(--radius-panel) var(--radius-panel) 0 0; padding-bottom: env(safe-area-inset-bottom, 0px); }
  .sheet-header { padding: var(--space-md); gap: var(--space-sm); }
  .sheet-title { font-size: var(--text-lg); font-weight: 400; }
  .sheet-actions { gap: 0; }
  .sheet-body { padding: var(--space-md); }
  .sheet-grid { grid-template-columns: minmax(0, 1fr); }
  .sheet-item { min-height: 84px; padding: var(--space-sm) var(--space-md); gap: var(--space-md); }
  .sheet-footer { padding: var(--space-md); }
}
@media (prefers-reduced-motion: reduce) { .widget-picker-enter-from, .widget-picker-leave-to { transform: none; } }
</style>
