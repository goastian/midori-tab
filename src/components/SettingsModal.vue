<template>
  <Teleport to="body">
    <Transition name="settings-dialog">
      <div v-if="settings.state" class="panel-overlay" @click.self="closeSettings">
          <section
            ref="settingsDialog"
            class="panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-page-settings-title"
            tabindex="-1"
            @click.stop
          >
          <!-- Header -->
          <div class="panel-header">
            <div class="panel-heading">
              <span class="panel-eyebrow">Midori Tab</span>
              <h2 id="start-page-settings-title" class="panel-title">{{ i18n.t.settings.title }}</h2>
              <p class="panel-subtitle">{{ navs[tab]?.description }}</p>
            </div>
            <button type="button" @click="closeSettings" class="panel-close" :aria-label="i18n.t.settings.close">
              <span>✕</span>
            </button>
          </div>

          <div class="panel-main">
            <!-- Settings navigation -->
            <nav class="panel-tabs" :aria-label="i18n.t.settings.title">
              <button
                v-for="(item, index) in navs"
                :key="index"
                type="button"
                @click="changeTab(index)"
                :class="['panel-tab', { active: index === tab }]"
                :aria-current="index === tab ? 'page' : undefined"
              >
                <span class="tab-icon">{{ item.emoji }}</span>
                <span class="tab-copy">
                  <span class="tab-label">{{ item.title }}</span>
                  <span class="tab-desc">{{ item.description }}</span>
                </span>
              </button>
            </nav>

            <!-- Scrollable content -->
            <main class="panel-content">
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

              <SettingsStartPageSection
                v-if="tab === 1"
                :i18n="i18n"
                :settings="settings"
                :widgets-store="widgetsStore"
              />

              <SettingsVisualSection
                v-if="tab === 2"
                :i18n="i18n"
                :settings="settings"
                :background="background"
                :backgrounds="backgrounds"
                :gradients="gradients"
                @change-background="changeBackground"
                @toggle-auto-theme="toggleAutoTheme"
                @open-marketplace="openMarketplace"
              />

              <SettingsLanguageSection v-if="tab === 3" />
            </main>
          </div>

          <!-- Footer -->
          <div class="panel-footer">
            <kbd>ESC</kbd> <span>{{ i18n.t.settings.close }}</span>
          </div>
          </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue';
import useTabStore from '../stores/useTabStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useSpacesStore from '../stores/useSpacesStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';
import useAdsStore from '../stores/useAdsStore.js';
import { useAutoTheme } from '../composables/useAutoTheme.js';
import SettingsGeneralSection from './settings/SettingsGeneralSection.vue';
import SettingsStartPageSection from './settings/SettingsStartPageSection.vue';
import SettingsVisualSection from './settings/SettingsVisualSection.vue';
import SettingsLanguageSection from './settings/SettingsLanguageSection.vue';

export default {
  name: 'SettingsModal',
  
  components: {
    SettingsGeneralSection,
    SettingsStartPageSection,
    SettingsVisualSection,
    SettingsLanguageSection,
  },

  data() {
    const settings = useTabStore();
    const sectionTabs = {
      general: 0,
      'start-page': 1,
      visual: 2,
      language: 3,
    };
    return {
      tab: sectionTabs[settings.settingsSection] ?? 0,
      settings,
      spacesStore: useSpacesStore(),
      widgetsStore: useWidgetsStore(),
      adsStore: useAdsStore(),
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
        { emoji: '▦', titleKey: 'navStartPage', descKey: 'navStartPageDesc' },
        { emoji: '🎨', titleKey: 'navVisual', descKey: 'navVisualDesc' },
        { emoji: '🌐', titleKey: 'navLanguage', descKey: 'navLanguageDesc' },
      ],
      openLinks: ['Self Tab', 'New Tab'],
      gradients: ['bg-orange', 'bg-green', 'bg-deal', 'bg-purple'],
      backgrounds: ['Gradient', 'Unsplash', 'LocalFolder'],
    };
  },

  mounted() {
    this.loadSettings();
    document.addEventListener('keydown', this.handleEscape);
    nextTick(() => this.$refs.settingsDialog?.focus());
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
      this.settings.settingsSection = ['general', 'start-page', 'visual', 'language'][index] || 'general';
    },

    changeBackground(clas) {
      if (clas) {
        this.background.class = clas;
      }
      this.settings.changeBackground(this.background);
    },

    closeSettings() {
      this.settings.closeSettings();
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
      if (this.settings.showAds) {
        void this.adsStore.recordOptOut();
      }
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
   Full settings — centered workspace
   ═══════════════════════════════════════ */

/* ── Overlay ── */
.panel-overlay {
  position: fixed;
  inset: 0;
  padding: clamp(1rem, 3vw, 2.5rem);
  background: rgba(4, 12, 10, 0.48);
  backdrop-filter: blur(8px) saturate(0.9);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ── Dialog container ── */
.panel {
  width: min(1080px, calc(100vw - 3rem));
  height: min(820px, calc(100dvh - 3rem));
  max-width: 100%;
  max-height: 100%;
  background: var(--surface-base, #080D14);
  border: 1px solid var(--color-border, rgba(126,196,168,0.16));
  border-radius: 18px;
  box-shadow: 0 30px 90px rgba(2, 22, 15, 0.38), inset 0 1px rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  outline: none;
}

/* ── Header ── */
.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 1rem 1.2rem 0.95rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background:
    radial-gradient(circle at 8% -80%, color-mix(in srgb, var(--color-primary, #04a469) 14%, transparent), transparent 35%),
    var(--surface-island, #101923);
  flex-shrink: 0;
}

.panel-heading {
  display: flex;
  flex-direction: column;
  gap: 0.22rem;
  min-width: 0;
}

.panel-eyebrow {
  color: var(--color-primary, #04a469);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.12em;
  line-height: 1;
  text-transform: uppercase;
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

/* ── Main workspace ── */
.panel-main {
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
}

/* ── Vertical category navigation ── */
.panel-tabs {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.28rem;
  padding: 1rem 0.72rem;
  border-right: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-sunken, #060A10);
}

.panel-tab {
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  padding: 0.72rem 0.68rem;
  border: none;
  background: transparent;
  border-radius: 9px;
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
  background: color-mix(in srgb, var(--color-primary, #04a469) 13%, var(--surface-overlay, #1E2D3D));
  color: var(--color-text, white);
  box-shadow: inset 3px 0 var(--color-primary, #04a469);
}

.tab-icon {
  width: 1.25rem;
  font-size: 0.92rem;
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
  font-size: 0.8rem;
  font-weight: 650;
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
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 1.5rem clamp(1.25rem, 3vw, 2.5rem) 2.5rem;
  overscroll-behavior: contain;
}

/* ── Sections ── */
:deep(.settings-section) {
  width: min(100%, 760px);
  margin: 0 auto;
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

/* ── Animations: focused dialog ── */
.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity 180ms ease;
}

.settings-dialog-enter-active .panel,
.settings-dialog-leave-active .panel {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.settings-dialog-enter-from,
.settings-dialog-leave-to {
  opacity: 0;
}

.settings-dialog-enter-from .panel,
.settings-dialog-leave-to .panel {
  opacity: 0;
  transform: translateY(16px) scale(0.975);
}

/* ── Responsive ── */
@media (max-width: 760px) {
  .panel-overlay {
    padding: 0;
  }

  .panel {
    width: 100vw;
    max-width: 100vw;
    height: 100dvh;
    max-height: 100dvh;
    border: 0;
    border-radius: 0;
  }

  .panel-main {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }

  .panel-tabs {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.32rem;
    padding: 0.45rem 0.55rem;
    border-right: 0;
    border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
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

@media (prefers-reduced-motion: reduce) {
  .settings-dialog-enter-active,
  .settings-dialog-leave-active,
  .settings-dialog-enter-active .panel,
  .settings-dialog-leave-active .panel {
    transition-duration: 1ms;
  }
}
</style>
