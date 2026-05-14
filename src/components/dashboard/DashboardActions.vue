<template>
  <div class="bottom-actions">
    <button class="action-btn" type="button" @click="$emit('open-shortcut')" :aria-label="i18n.$t('dashboard.actions.shortcut')">
      <DashboardIcon name="plus" :size="14" aria-hidden="true" />
      <span>{{ i18n.$t('dashboard.actions.shortcut') }}</span>
    </button>
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
import DashboardIcon from '../icons/DashboardIcon.vue';

export default {
  name: 'DashboardActions',
  components: {
    DashboardIcon,
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
  emits: ['open-shortcut', 'toggle-widgets', 'open-marketplace'],
};
</script>

<style scoped>
.bottom-actions {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 80;
  display: flex;
  gap: 0.5rem;
  padding: 0.35rem;
  background: var(--surface-raised, rgba(15,21,32,0.8));
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  backdrop-filter: blur(12px);
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s ease;
  white-space: nowrap;
}

.action-btn:hover {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, #C4F0E0);
}
</style>
