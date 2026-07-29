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
          <header class="panel-header">
            <div class="panel-brand">
              <img class="panel-logo" :src="midoriLogo" alt="Midori" width="84" height="28" />
              <h2 id="start-page-settings-title" class="panel-title">{{ i18n.t.settings.title }}</h2>
            </div>
            <button type="button" @click="closeSettings" class="panel-close" :aria-label="i18n.t.settings.close">
              <DashboardIcon name="close" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>

          <div class="panel-main">
            <nav class="panel-tabs" :aria-label="i18n.t.settings.title">
              <button
                v-for="(item, index) in navs"
                :key="item.key"
                type="button"
                @click="changeTab(index)"
                :class="['panel-tab', { active: index === tab }]"
                :aria-current="index === tab ? 'page' : undefined"
              >
                <span class="tab-icon" aria-hidden="true">
                  <DashboardIcon :name="item.icon" :size="17" :stroke-width="1.7" />
                </span>
                <span class="tab-copy">
                  <span class="tab-label">{{ item.title }}</span>
                </span>
              </button>
            </nav>

            <main class="panel-content">
              <SettingsGeneralSection
                v-if="tab === 0"
                :i18n="i18n"
                :settings="settings"
                :spaces-store="spacesStore"
                @toggle-spaces="toggleSpaces"
                @toggle-ads="toggleAds"
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
import midoriLogo from '../assets/midori.png';
import DashboardIcon from './icons/DashboardIcon.vue';
import SettingsGeneralSection from './settings/SettingsGeneralSection.vue';
import SettingsStartPageSection from './settings/SettingsStartPageSection.vue';
import SettingsVisualSection from './settings/SettingsVisualSection.vue';
import SettingsLanguageSection from './settings/SettingsLanguageSection.vue';

export default {
  name: 'SettingsModal',
  
  components: {
    DashboardIcon,
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
      midoriLogo,
      background: {
        type: null,
        default: true,
        class: 'bg-orange',
        color: null,
      },
      navKeys: [
        { key: 'general', icon: 'settings', titleKey: 'navGeneral' },
        { key: 'start-page', icon: 'grid', titleKey: 'navStartPage' },
        { key: 'visual', icon: 'palette', titleKey: 'navVisual' },
        { key: 'language', icon: 'globe', titleKey: 'navLanguage' },
      ],
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
        key: n.key,
        icon: n.icon,
        title: t[n.titleKey] || n.titleKey,
      }));
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
.panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(0.75rem, 3vw, 2rem);
  background: rgba(3, 16, 11, 0.46);
}

.panel {
  width: min(980px, calc(100vw - 2rem));
  height: min(720px, calc(100dvh - 2rem));
  max-width: 100%;
  max-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text, #142a24);
  background: var(--surface-raised, #fff);
  border: 1px solid var(--color-border, rgba(20, 42, 36, 0.14));
  border-radius: 12px;
  box-shadow: 0 18px 52px rgba(3, 30, 20, 0.26), 0 1px 2px rgba(3, 30, 20, 0.08);
  outline: none;
}

.panel-header {
  min-height: 60px;
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface-raised, #fff);
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
}

.panel-brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.72rem;
}

.panel-logo {
  width: 84px;
  height: 28px;
  flex: 0 0 auto;
  object-fit: contain;
}

.panel-title {
  margin: 0;
  padding-left: 0.72rem;
  color: var(--color-text, #142a24);
  border-left: 1px solid var(--color-border-hover, rgba(20, 42, 36, 0.24));
  font-size: 1.04rem;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.012em;
}

.panel-close {
  width: 32px;
  height: 32px;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted, #617a72);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 100ms ease;
}

.panel-close:hover {
  color: var(--color-text, #142a24);
  background: var(--surface-control-hover, #eff8f3);
  border-color: var(--color-border, rgba(20, 42, 36, 0.14));
}

.panel-close:active {
  transform: scale(0.95);
}

.panel-main {
  min-height: 0;
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: 208px minmax(0, 1fr);
}

.panel-tabs {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.8rem 0.62rem;
  background: var(--surface-island, #f7fbf8);
  border-right: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
}

.panel-tab {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.62rem;
  padding: 0.65rem 0.68rem;
  color: var(--color-text-secondary, #31554b);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 100ms ease;
}

.panel-tab:hover {
  color: var(--color-text, #142a24);
  background: var(--surface-control-hover, #fff);
}

.panel-tab:active {
  transform: translateY(1px);
}

.panel-tab.active {
  color: var(--color-text, #142a24);
  background: color-mix(in srgb, var(--color-primary, #0eae5b) 11%, var(--surface-raised, #fff));
  border-color: color-mix(in srgb, var(--color-primary, #0eae5b) 18%, transparent);
  box-shadow: inset 2px 0 var(--color-primary, #0eae5b);
}

.tab-icon {
  width: 1.2rem;
  height: 1.2rem;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: currentColor;
}

.tab-copy {
  min-width: 0;
}

.tab-label {
  display: block;
  overflow: hidden;
  font-size: 0.8rem;
  font-weight: 560;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.panel-content {
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 2rem clamp(1.5rem, 4vw, 3.25rem) 3rem;
  background: var(--surface-raised, #fff);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--color-border-hover, rgba(20, 42, 36, 0.24)) transparent;
}

:deep(.settings-section) {
  width: min(100%, 680px);
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

:deep(.section-header) {
  margin-bottom: 0.42rem;
}

:deep(.section-title-main) {
  margin: 0 0 0.32rem;
  color: var(--color-text, #142a24);
  font-size: 1.32rem;
  font-weight: 650;
  line-height: 1.16;
  letter-spacing: -0.025em;
}

:deep(.section-subtitle) {
  max-width: 62ch;
  margin: 0;
  color: var(--color-text-muted, #617a72);
  font-size: 0.8rem;
  line-height: 1.45;
  text-wrap: pretty;
}

:deep(.setting-item) {
  min-height: 66px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.88rem 0.92rem;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  border-radius: 0;
  transition: background 150ms ease;
}

:deep(.setting-item:hover) {
  background: color-mix(in srgb, var(--color-primary, #0eae5b) 4%, transparent);
}

:deep(.setting-item--stacked) {
  flex-direction: column;
  align-items: stretch;
}

:deep(.setting-info) {
  min-width: 0;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.18rem;
}

:deep(.setting-label) {
  display: block;
  color: var(--color-text, #142a24);
  font-size: 0.83rem;
  font-weight: 560;
  line-height: 1.3;
}

:deep(.setting-description) {
  display: block;
  color: var(--color-text-muted, #617a72);
  font-size: 0.72rem;
  line-height: 1.4;
  text-wrap: pretty;
}

:deep(.separator) {
  height: 1px;
  margin: 0.55rem 0;
  background: var(--color-border, rgba(20, 42, 36, 0.12));
}

:deep(.marketplace-shortcut) {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.82rem 0;
  margin-bottom: 0.65rem;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  border-radius: 0;
}

:deep(.marketplace-shortcut-btn) {
  min-height: 34px;
  padding: 0.42rem 0.72rem;
  color: var(--color-text, #142a24);
  background: var(--surface-control, #f7fbf8);
  border: 1px solid var(--color-border, rgba(20, 42, 36, 0.16));
  border-radius: 8px;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition: color 150ms ease, background 150ms ease, border-color 150ms ease, transform 100ms ease;
}

:deep(.marketplace-shortcut-btn:hover) {
  color: var(--color-primary, #0eae5b);
  background: var(--surface-control-hover, #fff);
  border-color: var(--color-border-hover, rgba(20, 42, 36, 0.24));
}

:deep(.marketplace-shortcut-btn:active) {
  transform: translateY(1px);
}

:deep(.gradients-section) {
  display: flex;
  flex-direction: column;
  gap: 0.68rem;
  padding: 0.88rem 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  border-radius: 0;
}

:deep(.section-label) {
  color: var(--color-text, #142a24);
  font-size: 0.82rem;
  font-weight: 560;
}

:deep(.gradients-grid) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}

:deep(.gradient-card) {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 150ms ease, transform 100ms ease;
}

:deep(.gradient-card:hover) {
  border-color: var(--color-border-hover, rgba(20, 42, 36, 0.24));
}

:deep(.gradient-card:active) {
  transform: scale(0.98);
}

:deep(.gradient-card.active) {
  border-color: var(--color-primary, #0eae5b);
}

:deep(.check-icon) {
  color: white;
  font-size: 1rem;
  font-weight: 700;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.28);
}

.panel-close:focus-visible,
.panel-tab:focus-visible,
:deep(.marketplace-shortcut-btn:focus-visible),
:deep(.gradient-card:focus-visible) {
  outline: 2px solid color-mix(in srgb, var(--color-primary, #0eae5b), transparent 28%);
  outline-offset: 2px;
}

.settings-dialog-enter-active,
.settings-dialog-leave-active {
  transition: opacity 160ms ease;
}

.settings-dialog-enter-active .panel,
.settings-dialog-leave-active .panel {
  transition: opacity 160ms ease, transform 190ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.settings-dialog-enter-from,
.settings-dialog-leave-to {
  opacity: 0;
}

.settings-dialog-enter-from .panel,
.settings-dialog-leave-to .panel {
  opacity: 0;
  transform: translateY(10px) scale(0.99);
}

@media (max-width: 720px) {
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
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.22rem;
    padding: 0.42rem;
    border-right: 0;
    border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  }

  .panel-tab {
    justify-content: center;
    gap: 0.35rem;
    padding: 0.58rem 0.35rem;
    text-align: center;
  }

  .panel-tab.active {
    box-shadow: inset 0 -2px var(--color-primary, #0eae5b);
  }

  .tab-label {
    font-size: 0.7rem;
  }

  .panel-content {
    padding: 1.2rem 1rem 2rem;
  }

  :deep(.marketplace-shortcut) {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 460px) {
  .panel-header {
    min-height: 58px;
    padding: 0.65rem 0.75rem;
  }

  .panel-content {
    padding-inline: 0.75rem;
  }

  .tab-icon {
    display: none;
  }

  :deep(.gradients-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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
