<template>
  <div class="bottom-actions">
    <button class="action-btn" type="button" @click="$emit('toggle-widgets')" :aria-label="i18n.$t('dashboard.actions.widget')">
      <DashboardIcon :name="showWidgetSheet ? 'minus' : 'plus'" :size="14" aria-hidden="true" />
      <span>{{ i18n.$t('dashboard.actions.widget') }}</span>
    </button>
    <button class="action-btn" type="button" @click="$emit('open-marketplace')" :aria-label="i18n.$t('dashboard.actions.marketplace')">
      <DashboardIcon name="store" :size="14" aria-hidden="true" />
      <span>{{ i18n.$t('dashboard.actions.marketplace') }}</span>
    </button>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';

export default {
  name: 'DashboardActions',
  components: {
    DashboardIcon: defineAsyncComponent(() => import('../icons/DashboardIcon.vue')),
  },
  props: {
    i18n: {
      type: Object,
      required: true,
    },
    showWidgetSheet: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['toggle-widgets', 'open-marketplace'],
};
</script>

<style scoped>
.bottom-actions {
  position: relative;
  z-index: 80;
  width: fit-content;
  max-width: 100%;
  display: flex;
  gap: 0.25rem;
  margin: auto auto 0;
  padding: var(--nova-segment-padding, 4px);
  background: var(--surface-island, rgba(15,21,32,0.86));
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 34px;
  padding: 0.45rem 0.85rem;
  background: transparent;
  border: none;
  border-radius: var(--nova-control-radius, 8px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.action-btn:hover {
  background: var(--surface-control-hover, #1E2D3D);
  color: var(--color-text, #C4F0E0);
}

@media (max-width: 520px) {
  .bottom-actions {
    max-width: 100%;
    overflow-x: auto;
  }

  .action-btn {
    padding-inline: 0.65rem;
  }
}
</style>
