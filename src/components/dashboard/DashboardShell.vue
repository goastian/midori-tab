<template>
  <div class="dashboard">
    <button class="settings-btn" type="button" @click="$emit('open-settings')" :title="i18n.t.settings.title" :aria-label="i18n.t.settings.title">
      <DashboardIcon name="settings" :size="20" :stroke-width="1.5" aria-hidden="true" />
    </button>
    <button class="quick-btn" type="button" @click="$emit('toggle-quick-settings')" :title="i18n.$t('dashboard.quickSettings.title')" :aria-label="i18n.$t('dashboard.quickSettings.title')">
      <DashboardIcon name="sliders" :size="20" :stroke-width="1.5" aria-hidden="true" />
    </button>

    <header class="dash-header">
      <Logo />
    </header>

    <slot />
  </div>
</template>

<script>
import Logo from '../Logo.vue';
import DashboardIcon from '../icons/DashboardIcon.vue';

export default {
  name: 'DashboardShell',
  components: {
    DashboardIcon,
    Logo,
  },
  props: {
    i18n: {
      type: Object,
      required: true,
    },
  },
  emits: ['open-settings', 'toggle-quick-settings'],
};
</script>

<style scoped>
.dashboard {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.5rem 2rem 5rem;
  gap: 1.25rem;
  font-size: 13px;
  box-sizing: border-box;
}

.settings-btn,
.quick-btn {
  position: fixed;
  top: 1rem;
  z-index: 50;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-raised, rgba(15,21,32,0.75));
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  transition: all 0.15s ease;
  backdrop-filter: blur(8px);
}

.settings-btn {
  right: 1rem;
}

.quick-btn {
  right: 3.75rem;
}

.settings-btn:hover,
.quick-btn:hover {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, #C4F0E0);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.dash-header {
  padding-top: 0.5rem;
  display: flex;
  justify-content: center;
}

:global([data-density='compact']) .dashboard {
  padding: 1rem 1.25rem 4.25rem;
  gap: 0.9rem;
}
</style>
