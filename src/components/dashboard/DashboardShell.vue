<template>
  <div class="dashboard">
    <!-- Top-right: Hamburger (Astian Apps) + Settings gear -->
    <div class="top-actions">
      <button
        class="top-btn hamburger-btn"
        type="button"
        @click="$emit('toggle-apps-menu')"
        :class="{ 'is-open': appsMenuOpen }"
        title="Astian Apps"
        aria-label="Astian Apps"
        :aria-expanded="appsMenuOpen"
      >
        <span class="hamburger-icon" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
      </button>
      <button
        class="top-btn"
        type="button"
        @click="$emit('open-settings')"
        :title="i18n.t.settings.title"
        :aria-label="i18n.t.settings.title"
      >
        <DashboardIcon name="settings" :size="20" :stroke-width="1.5" aria-hidden="true" />
      </button>
    </div>

    <!-- Bottom-right: Quick Settings button -->
    <button
      class="quick-fab"
      type="button"
      @click="$emit('toggle-quick-settings')"
      :title="i18n.$t('dashboard.quickSettings.title')"
      :aria-label="i18n.$t('dashboard.quickSettings.title')"
    >
      <DashboardIcon name="sliders" :size="18" :stroke-width="1.5" aria-hidden="true" />
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
    appsMenuOpen: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['open-settings', 'toggle-quick-settings', 'toggle-apps-menu'],
};
</script>

<style scoped>
.dashboard {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.25rem 2rem 5rem;
  gap: 1rem;
  font-size: 13px;
  box-sizing: border-box;
}

/* ── Top-right action cluster ─────────────────────────────── */
.top-actions {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 50;
  display: flex;
  gap: 0.35rem;
  align-items: center;
  padding: var(--nova-segment-padding, 4px);
  background: var(--surface-island, rgba(255,255,255,0.9));
  border: 1px solid var(--color-border, rgba(0,0,0,0.1));
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
}

.top-btn {
  width: var(--nova-control-height, 38px);
  height: var(--nova-control-height, 38px);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--nova-control-radius, 8px);
  color: var(--color-text-muted, #5A7B6D);
  cursor: pointer;
  transition: all 0.15s ease;
}

.top-btn:hover {
  background: var(--surface-control-hover, #ffffff);
  color: var(--color-text, #1A2B26);
  border-color: var(--color-border-hover, rgba(0,0,0,0.18));
  box-shadow: none;
}

/* Hamburger lines */
.hamburger-icon {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 16px;
  height: 16px;
}

.hamburger-icon span {
  display: block;
  width: 16px;
  height: 2px;
  background: currentColor;
  border-radius: 2px;
  transition: all 0.2s ease;
  transform-origin: center;
}

/* Animate to X when open */
.hamburger-btn.is-open .hamburger-icon span:nth-child(1) {
  transform: translateY(6px) rotate(45deg);
}
.hamburger-btn.is-open .hamburger-icon span:nth-child(2) {
  opacity: 0;
  transform: scaleX(0);
}
.hamburger-btn.is-open .hamburger-icon span:nth-child(3) {
  transform: translateY(-6px) rotate(-45deg);
}

/* ── Quick Settings FAB (bottom-right) ─────────────────────── */
.quick-fab {
  position: fixed;
  bottom: 1.5rem;
  right: 1rem;
  z-index: 80;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-island, rgba(255,255,255,0.9));
  border: 1px solid var(--color-border, rgba(0,0,0,0.1));
  border-radius: var(--nova-island-radius, 12px);
  color: var(--color-text-muted, #5A7B6D);
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
}

.quick-fab:hover {
  background: var(--color-primary, #04A469);
  color: #ffffff;
  border-color: var(--color-primary, #04A469);
  box-shadow: var(--shadow-floating, 0 8px 24px rgba(8,13,20,0.18));
  transform: translateY(-1px);
}

/* ── Header ───────────────────────────────────────────────── */
.dash-header {
  padding-top: 0.35rem;
  display: flex;
  justify-content: center;
}

:global([data-density='compact']) .dashboard {
  padding: 1rem 1.25rem 4.25rem;
  gap: 0.9rem;
}

@media (max-height: 640px) {
  .dashboard {
    padding-bottom: 1.25rem;
  }

  .quick-fab {
    bottom: 0.75rem;
    right: 0.75rem;
  }
}
</style>
