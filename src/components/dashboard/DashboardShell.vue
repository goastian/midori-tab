<template>
  <div class="dashboard">
    <div class="dashboard-toolbar">
      <div class="dashboard-spaces">
        <SpaceSwitcher />
      </div>

      <!-- Astian Apps + Settings share one reserved toolbar area. -->
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
          :class="{ 'is-open': quickSettingsOpen }"
          :title="i18n.t.settings.title"
          :aria-label="i18n.t.settings.title"
          :aria-expanded="quickSettingsOpen"
        >
          <DashboardIcon name="settings" :size="20" :stroke-width="1.5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <header class="dash-header">
      <Logo />
    </header>

    <slot />
  </div>
</template>

<script>
import Logo from '../Logo.vue';
import SpaceSwitcher from '../SpaceSwitcher.vue';
import DashboardIcon from '../icons/DashboardIcon.vue';

export default {
  name: 'DashboardShell',
  components: {
    DashboardIcon,
    Logo,
    SpaceSwitcher,
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
    quickSettingsOpen: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['open-settings', 'toggle-quick-settings', 'toggle-apps-menu'],
};
</script>

<style scoped>
.dashboard {
  --dashboard-gutter: clamp(0.75rem, 3vw, 2rem);
  --dashboard-content-width: 45rem;
  position: relative;
  width: 100%;
  min-width: 0;
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding:
    max(1.25rem, env(safe-area-inset-top, 0px))
    var(--dashboard-gutter)
    calc(1rem + env(safe-area-inset-bottom, 0px));
  gap: 1rem;
  font-size: 13px;
  box-sizing: border-box;
}

.dashboard-toolbar {
  position: absolute;
  top: max(1rem, env(safe-area-inset-top, 0px));
  inset-inline: var(--dashboard-gutter);
  width: auto;
  min-width: 0;
  min-height: 46px;
  display: grid;
  grid-template-columns: minmax(44px, 1fr) minmax(0, auto) minmax(44px, 1fr);
  align-items: start;
  gap: 0.75rem;
}

.dashboard-spaces {
  grid-column: 2;
  min-width: 0;
  max-width: min(100%, 680px);
  justify-self: center;
  pointer-events: auto;
}

/* ── Top-right action cluster ─────────────────────────────── */
.top-actions {
  position: static;
  grid-column: 3;
  justify-self: end;
  z-index: 50;
  display: flex;
  gap: 0.35rem;
  align-items: center;
  padding: var(--nova-segment-padding, 4px);
  background: var(--surface-island, rgba(255,255,255,0.9));
  border: 1px solid var(--color-border, rgba(0,0,0,0.1));
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
  pointer-events: auto;
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

.top-btn.is-open {
  color: #ffffff;
  background: var(--color-primary, #04A469);
  border-color: var(--color-primary, #04A469);
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

/* ── Header ───────────────────────────────────────────────── */
.dash-header {
  width: 100%;
  min-height: 4.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

:global([data-density='compact']) .dashboard {
  --dashboard-gutter: clamp(0.75rem, 3vw, 1.25rem);
  padding:
    max(0.65rem, env(safe-area-inset-top, 0px))
    var(--dashboard-gutter)
    calc(0.85rem + env(safe-area-inset-bottom, 0px));
  gap: 0.9rem;
}

@media (max-height: 640px) {
  .dashboard {
    padding-bottom: 1.25rem;
  }
}

@media (max-width: 700px) {
  .dashboard {
    --dashboard-gutter: clamp(0.75rem, 4vw, 1rem);
    padding-bottom: 1rem;
    gap: 0.75rem;
  }

  .dashboard-toolbar {
    position: static;
    inset: auto;
    width: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column-reverse;
    align-items: stretch;
    gap: 0.6rem;
  }

  .dashboard-spaces {
    width: 100%;
    max-width: 100%;
  }

  .dashboard-spaces:empty {
    display: none;
  }

  .top-actions {
    align-self: flex-end;
  }

  .dash-header {
    min-height: clamp(2.75rem, 14vw, 4rem);
  }
}
</style>
