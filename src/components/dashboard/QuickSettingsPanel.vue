<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="quick-overlay" @click="$emit('close')">
        <div class="quick-panel" @click.stop>
          <div class="quick-header">
            <span class="quick-title">{{ i18n.$t('dashboard.quickSettings.title') }}</span>
            <button class="quick-close" type="button" @click="$emit('close')" :aria-label="i18n.$t('dashboard.quickSettings.close')">x</button>
          </div>
          <div class="quick-grid">
            <button class="quick-item" type="button" @click="tab.setTheme()">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.theme') }}</span>
              <span class="quick-item-value">{{ tab.theme === 'light' ? i18n.$t('dashboard.quickSettings.themeLight') : i18n.$t('dashboard.quickSettings.themeDark') }}</span>
            </button>
            <button class="quick-item" type="button" @click="$emit('toggle-density')">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.density') }}</span>
              <span class="quick-item-value">{{ tab.density === 'compact' ? i18n.$t('dashboard.quickSettings.densityCompact') : i18n.$t('dashboard.quickSettings.densityComfortable') }}</span>
            </button>
            <button class="quick-item" type="button" @click="$emit('toggle-section', 'search')">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.search') }}</span>
              <span class="quick-item-value">{{ widgetsStore.enabled.search ? i18n.$t('common.on') : i18n.$t('common.off') }}</span>
            </button>
            <button class="quick-item" type="button" @click="$emit('toggle-section', 'bookmarks')">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.bookmarks') }}</span>
              <span class="quick-item-value">{{ widgetsStore.enabled.bookmarks ? i18n.$t('common.on') : i18n.$t('common.off') }}</span>
            </button>
            <button class="quick-item" type="button" @click="$emit('refresh-wallpaper')">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.wallpaper') }}</span>
              <span class="quick-item-value">{{ i18n.$t('dashboard.quickSettings.refresh') }}</span>
            </button>
            <button class="quick-item" type="button" @click="$emit('open-settings')">
              <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.settings') }}</span>
              <span class="quick-item-value">{{ i18n.$t('dashboard.quickSettings.open') }}</span>
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
export default {
  name: 'QuickSettingsPanel',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    tab: {
      type: Object,
      required: true,
    },
    widgetsStore: {
      type: Object,
      required: true,
    },
    i18n: {
      type: Object,
      required: true,
    },
  },
  emits: ['close', 'toggle-density', 'toggle-section', 'refresh-wallpaper', 'open-settings'],
};
</script>

<style scoped>
.quick-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.25);
  z-index: 8500;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 1rem;
}

.quick-panel {
  width: 340px;
  max-width: calc(100vw - 2rem);
  background: var(--surface-base, #080D14);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.3));
  overflow: hidden;
}

.quick-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0F1520);
}

.quick-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.quick-close {
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
}

.quick-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.5rem;
  padding: 1rem;
}

.quick-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0.85rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  color: var(--color-text, #C4F0E0);
  cursor: pointer;
  transition: all 0.12s ease;
  text-align: left;
}

.quick-item:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.quick-item-title {
  font-size: 0.85rem;
  font-weight: 600;
}

.quick-item-value {
  font-size: 0.8rem;
  color: var(--color-text-muted, #5A9A82);
}

.dialog-fade-enter-active { transition: opacity 0.15s ease; }
.dialog-fade-leave-active { transition: opacity 0.12s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }
</style>
