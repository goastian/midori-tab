<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="settings.state" class="panel-overlay" @click="closeSettings">
        <Transition name="panel-slide">
          <div v-if="settings.state" class="panel" @click.stop>
          <!-- Header -->
          <div class="panel-header">
            <div class="panel-heading">
              <h2 class="panel-title">{{ i18n.t.settings.title }}</h2>
              <p class="panel-subtitle">{{ navs[tab]?.description }}</p>
            </div>
            <button @click="closeSettings" class="panel-close" aria-label="Close settings">
              <span>✕</span>
            </button>
          </div>

          <!-- Tab navigation (horizontal) -->
          <nav class="panel-tabs">
            <button
              v-for="(item, index) in navs"
              :key="index"
              @click="changeTab(index)"
              :class="['panel-tab', { active: index === tab }]"
            >
              <span class="tab-icon">{{ item.emoji }}</span>
              <span class="tab-copy">
                <span class="tab-label">{{ item.title }}</span>
                <span class="tab-desc">{{ item.description }}</span>
              </span>
            </button>
          </nav>

          <!-- Scrollable content -->
          <div class="panel-content">
            <SettingsGeneralSection
              v-if="tab === 0"
              :i18n="i18n"
              :settings="settings"
              :spaces-store="spacesStore"
              :open-links="openLinks"
              :title="title"
              @toggle-spaces="toggleSpaces"
              @toggle-ads="toggleAds"
              @update:title="title = $event"
            />

            <SettingsVisualSection
              v-if="tab === 1"
              :i18n="i18n"
              :settings="settings"
              :background="background"
              :backgrounds="backgrounds"
              :gradients="gradients"
              @change-background="changeBackground"
              @toggle-auto-theme="toggleAutoTheme"
              @open-marketplace="openMarketplace"
            />

            <SettingsLanguageSection v-if="tab === 2" />
          </div>

          <!-- Footer -->
          <div class="panel-footer">
            <kbd>ESC</kbd> <span>{{ i18n.t.settings.close }}</span>
          </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import useTabStore from '../stores/useTabStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useSpacesStore from '../stores/useSpacesStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';
import { useAutoTheme } from '../composables/useAutoTheme.js';
import SettingsGeneralSection from './settings/SettingsGeneralSection.vue';
import SettingsVisualSection from './settings/SettingsVisualSection.vue';
import SettingsLanguageSection from './settings/SettingsLanguageSection.vue';

export default {
  name: 'SettingsModal',
  
  components: {
    SettingsGeneralSection,
    SettingsVisualSection,
    SettingsLanguageSection,
  },

  data() {
    return {
      tab: 0,
      settings: useTabStore(),
      spacesStore: useSpacesStore(),
      widgetsStore: useWidgetsStore(),
      i18n: useI18nStore(),
      background: {
        type: null,
        default: true,
        class: 'bg-orange',
        color: null,
      },
      title: '',
      navKeys: [
        { emoji: '⚙️', titleKey: 'navGeneral', descKey: 'navGeneralDesc' },
        { emoji: '🎨', titleKey: 'navVisual', descKey: 'navVisualDesc' },
        { emoji: '🌐', titleKey: 'navLanguage', descKey: 'navLanguageDesc' },
      ],
      openLinks: ['Self Tab', 'New Tab'],
      gradients: ['bg-orange', 'bg-green', 'bg-deal', 'bg-purple'],
      backgrounds: ['Gradient', 'Unsplash'],
    };
  },

  mounted() {
    this.loadSettings();
    // Cerrar con ESC
    document.addEventListener('keydown', this.handleEscape);
  },

  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },

  computed: {
    navs() {
      const t = this.i18n.t.settings;
      return this.navKeys.map(n => ({
        emoji: n.emoji,
        title: t[n.titleKey] || n.titleKey,
        description: t[n.descKey] || n.descKey,
      }));
    },
  },

  watch: {
    title(newTitle) {
      this.settings.setTitle(newTitle);
    },
  },

  methods: {
    loadSettings() {
      this.settings = useTabStore();
      this.background = this.settings.background;
    },

    changeTab(index) {
      this.tab = index;
    },

    changeBackground(clas) {
      if (clas) {
        this.background.class = clas;
      }
      this.settings.changeBackground(this.background);
    },

    closeSettings() {
      this.settings.updateState();
    },

    handleEscape(e) {
      if (e.key === 'Escape' && this.settings.state) {
        this.closeSettings();
      }
    },

    toggleSpaces() {
      this.spacesStore.enabled = !this.spacesStore.enabled;
    },

    toggleAds() {
      this.settings.showAds = !this.settings.showAds;
    },

    toggleAutoTheme() {
      this.settings.autoTheme = !this.settings.autoTheme;
      if (this.settings.autoTheme) {
        const autoTheme = useAutoTheme();
        autoTheme.start();
      } else {
        const autoTheme = useAutoTheme();
        autoTheme.stop();
        // Re-apply current manual theme
        const themeStore = useThemeStore();
        themeStore.applyTheme(this.settings.theme);
      }
    },

    openMarketplace(type) {
      window.dispatchEvent(new CustomEvent('midori:open-marketplace', { detail: { type } }));
      this.closeSettings();
    },
  },
};
</script>

<style scoped>
/* ═══════════════════════════════════════
   Settings Panel — Right-side slide-in
   ═══════════════════════════════════════ */

/* ── Overlay ── */
.panel-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
}

/* ── Panel container ── */
.panel {
  width: 420px;
  max-width: 94vw;
  height: 100vh;
  background: var(--surface-base, #080D14);
  border-left: 1px solid var(--color-border, rgba(126,196,168,0.1));
  box-shadow: -14px 0 50px rgba(0, 0, 0, 0.42);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 1.1rem 0.9rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background:
    linear-gradient(180deg, rgba(8, 20, 32, 0.96), rgba(8, 16, 28, 0.94)),
    radial-gradient(circle at 12% -20%, rgba(4, 164, 105, 0.16), transparent 42%);
  flex-shrink: 0;
}

.panel-heading {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
}

.panel-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text, white);
  margin: 0;
  line-height: 1.2;
}

.panel-subtitle {
  margin: 0;
  font-size: 0.74rem;
  color: var(--color-text-muted, #5A9A82);
  line-height: 1.25;
  letter-spacing: 0.01em;
}

.panel-close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.12s ease;
}

.panel-close:hover {
  background: var(--color-border-hover, rgba(126,196,168,0.2));
  color: var(--color-text, white);
}

/* ── Horizontal tab bar ── */
.panel-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
  padding: 0.65rem 0.8rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-sunken, #060A10);
  flex-shrink: 0;
}

.panel-tab {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.5rem 0.58rem;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.76rem;
  font-weight: 500;
  transition: all 0.12s ease;
  min-width: 0;
  text-align: left;
}

.panel-tab:hover {
  background: var(--surface-raised, #0F1520);
  color: var(--color-text, #C4F0E0);
}

.panel-tab.active {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, white);
}

.tab-icon {
  font-size: 0.86rem;
  line-height: 1;
  margin-top: 0.08rem;
}

.tab-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 0.08rem;
}

.tab-label {
  font-size: 0.78rem;
  line-height: 1.15;
}

.tab-desc {
  font-size: 0.67rem;
  line-height: 1.15;
  color: color-mix(in srgb, var(--color-text-muted, #5A9A82) 90%, white 10%);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ── Scrollable content area ── */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1rem 1.15rem;
}

/* ── Sections ── */
:deep(.settings-section) {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}

:deep(.section-header) {
  margin-bottom: 0.25rem;
}

:deep(.section-title-main) {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text, white);
  margin: 0 0 0.2rem 0;
  line-height: 1.2;
}

:deep(.section-subtitle) {
  font-size: 0.78rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
  line-height: 1.3;
}

/* ── Setting item rows ── */
:deep(.setting-item) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 0.92rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  gap: 0.75rem;
  transition: all 0.1s ease;
}

:deep(.setting-item:hover) {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

/* Stacked variant: label on top, control below (for dropdowns/inputs in narrow panel) */
:deep(.setting-item--stacked) {
  flex-direction: column;
  align-items: stretch;
}

:deep(.setting-info) {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 0;
}

:deep(.setting-label) {
  font-weight: 500;
  color: var(--color-text, white);
  font-size: 0.84rem;
  line-height: 1.25;
  display: block;
}

:deep(.setting-description) {
  font-size: 0.72rem;
  color: var(--color-text-muted, #5A9A82);
  line-height: 1.3;
  display: block;
}

:deep(.separator) {
  height: 1px;
  background: var(--color-border, rgba(126,196,168,0.1));
  margin: 0.5rem 0;
}

:deep(.marketplace-shortcut) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 1rem;
  margin-bottom: 0.8rem;
  border-radius: var(--radius-md, 10px);
  background: linear-gradient(135deg, rgba(4, 164, 105, 0.12), rgba(15, 21, 32, 0.88));
  border: 1px solid rgba(4, 164, 105, 0.18);
}

:deep(.marketplace-shortcut-btn) {
  border: none;
  background: var(--color-primary, #04A469);
  color: #fff;
  border-radius: 999px;
  padding: 0.75rem 1rem;
  cursor: pointer;
  white-space: nowrap;
  font-weight: 600;
}

/* ── Gradients ── */
:deep(.gradients-section) {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
}

:deep(.section-label) {
  font-weight: 500;
  color: var(--color-text, white);
  font-size: 0.85rem;
}

:deep(.gradients-grid) {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

:deep(.gradient-card) {
  height: 56px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.12s ease;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

:deep(.gradient-card:hover) {
  transform: scale(1.03);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

:deep(.gradient-card.active) {
  border-color: var(--color-primary, #04A469);
}

:deep(.check-icon) {
  font-size: 1.2rem;
  color: white;
}

/* ── Footer ── */
.panel-footer {
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: 0.6rem 1.25rem;
  background: var(--surface-sunken, #060A10);
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
  flex-shrink: 0;
}

.panel-footer kbd {
  padding: 0.15rem 0.4rem;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 4px;
  font-size: 0.7rem;
  color: var(--color-text-secondary, #7EC4A8);
  font-family: monospace;
}

/* ── Scrollbar ── */
.panel-content::-webkit-scrollbar {
  width: 5px;
}

.panel-content::-webkit-scrollbar-track {
  background: transparent;
}

.panel-content::-webkit-scrollbar-thumb {
  background: var(--color-border, rgba(126,196,168,0.1));
  border-radius: 3px;
}

.panel-content::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-hover, rgba(126,196,168,0.2));
}

/* ── Animations: slide from right ── */
.panel-fade-enter-active {
  transition: opacity 0.15s ease;
}

.panel-fade-leave-active {
  transition: opacity 0.12s ease;
}

.panel-fade-enter-from,
.panel-fade-leave-to {
  opacity: 0;
}

.panel-slide-enter-active {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-slide-leave-active {
  transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.panel-slide-enter-from {
  transform: translateX(100%);
}

.panel-slide-leave-to {
  transform: translateX(100%);
}

/* ── Responsive ── */
@media (max-width: 480px) {
  .panel {
    width: 100vw;
    max-width: 100vw;
    border-left: none;
  }

  .panel-tabs {
    grid-template-columns: 1fr;
    gap: 0.32rem;
    padding: 0.45rem 0.55rem;
  }

  :deep(.gradients-grid) {
    grid-template-columns: repeat(2, 1fr);
  }

  :deep(.marketplace-shortcut) {
    flex-direction: column;
    align-items: stretch;
  }

  .panel-content {
    padding: 0.8rem 0.75rem 0.95rem;
  }
}
</style>
