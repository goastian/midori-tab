<template>
  <Teleport to="body">
    <Transition name="panel-fade">
      <div v-if="settings.state" class="panel-overlay" @click="closeSettings">
        <Transition name="panel-slide">
          <div v-if="settings.state" class="panel" @click.stop>
          <!-- Header -->
          <div class="panel-header">
            <h2 class="panel-title">{{ i18n.t.settings.title }}</h2>
            <button @click="closeSettings" class="panel-close">
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
              <span class="tab-label">{{ item.title }}</span>
            </button>
          </nav>

          <!-- Scrollable content -->
          <div class="panel-content">
            <!-- General Tab -->
            <div v-if="tab === 0" class="settings-section">
              <div class="section-header">
                <h3 class="section-title-main">{{ i18n.t.general.title }}</h3>
                <p class="section-subtitle">{{ i18n.t.general.subtitle }}</p>
              </div>
              <div class="setting-item setting-item--stacked">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.general.openSearchIn }}</span>
                  <span class="setting-description">{{ i18n.t.general.openSearchInDesc }}</span>
                </div>
                <Dropdown v-model="settings.openLink" :options="openLinks"/>
              </div>

              <div class="setting-item setting-item--stacked">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.general.tabName }}</span>
                  <span class="setting-description">{{ i18n.t.general.tabNameDesc }}</span>
                </div>
                <Input placeholder="New Tab" :value="settings.tabName" v-model="title" round full/>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.spaces?.enable || 'Activar Spaces' }}</span>
                  <span class="setting-description">{{ i18n.t.spaces?.enableDesc || 'Cambia entre espacios de trabajo personalizados' }}</span>
                </div>
                <Switch @click="toggleSpaces()" :state="spacesStore.enabled" />
              </div>

            </div>

            <!-- Visual Tab -->
            <div v-if="tab === 1" class="settings-section">
              <div class="section-header">
                <h3 class="section-title-main">{{ i18n.t.visual.title }}</h3>
                <p class="section-subtitle">{{ i18n.t.visual.subtitle }}</p>
              </div>
              <div class="setting-item setting-item--stacked">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.visual.background }}</span>
                  <span class="setting-description">{{ i18n.t.visual.backgroundDesc }}</span>
                </div>
                <Dropdown v-model="background.type" :options="backgrounds" @change="changeBackground()" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.visual.darkMode }}</span>
                  <span class="setting-description">{{ i18n.t.visual.darkModeDesc }}</span>
                </div>
                <Switch @click="settings.setTheme()" :state="settings.theme == 'dark'" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.visual.autoTheme }}</span>
                  <span class="setting-description">{{ i18n.t.visual.autoThemeDesc }}</span>
                </div>
                <Switch @click="toggleAutoTheme()" :state="settings.autoTheme" />
              </div>

              <div v-if="background.type == 'Gradient'" class="gradients-section">
                <span class="section-label">{{ i18n.t.visual.availableGradients }}</span>
                <div class="gradients-grid">
                  <div
                    v-for="(item, index) in gradients"
                    :key="index"
                    class="gradient-card"
                    :class="[item, { active: background.class == item }]"
                    @click="changeBackground(item)"
                  >
                    <span v-if="background.class == item" class="check-icon">✓</span>
                  </div>
                </div>
              </div>

              <div class="separator"></div>

              <div class="marketplace-shortcut">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.$t('marketplace.wallpaperCtaTitle') }}</span>
                  <span class="setting-description">{{ i18n.$t('marketplace.wallpaperCtaDescription') }}</span>
                </div>
                <button class="marketplace-shortcut-btn" type="button" @click="openMarketplace('wallpaper')">
                  {{ i18n.$t('marketplace.openAssets') }}
                </button>
              </div>

              <ThemePicker />
            </div>

            <!-- Language Tab -->
            <div v-if="tab === 2" class="settings-section">
              <LanguageSelector />
            </div>
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
import { watch } from 'vue';
import Switch from './UI/Switch.vue';
import Dropdown from './UI/Dropdown.vue';
import Input from './UI/Input.vue';
import { defineAsyncComponent } from 'vue';
import useTabStore from '../stores/useTabStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useSpacesStore from '../stores/useSpacesStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';
import { useAutoTheme } from '../composables/useAutoTheme.js';

export default {
  name: 'SettingsModal',
  
  components: {
    Switch,
    Input,
    Dropdown,
    ThemePicker: defineAsyncComponent(() => import('./ThemePicker.vue')),
    LanguageSelector: defineAsyncComponent(() => import('./LanguageSelector.vue')),
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
  width: 380px;
  max-width: 92vw;
  height: 100vh;
  background: var(--surface-base, #080D14);
  border-left: 1px solid var(--color-border, rgba(126,196,168,0.1));
  box-shadow: -4px 0 24px rgba(0,0,0,0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0F1520);
  flex-shrink: 0;
}

.panel-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, white);
  margin: 0;
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
  display: flex;
  gap: 2px;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-sunken, #060A10);
  flex-shrink: 0;
  overflow-x: auto;
}

.panel-tab {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.7rem;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.12s ease;
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
  font-size: 0.9rem;
}

.tab-label {
  font-size: 0.8rem;
}

/* ── Scrollable content area ── */
.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
}

/* ── Sections ── */
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.section-header {
  margin-bottom: 0.25rem;
}

.section-title-main {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, white);
  margin: 0 0 0.2rem 0;
}

.section-subtitle {
  font-size: 0.78rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
}

/* ── Setting item rows ── */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.85rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  gap: 0.75rem;
  transition: all 0.1s ease;
}

.setting-item:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

/* Stacked variant: label on top, control below (for dropdowns/inputs in narrow panel) */
.setting-item--stacked {
  flex-direction: column;
  align-items: stretch;
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}

.setting-label {
  font-weight: 500;
  color: var(--color-text, white);
  font-size: 0.85rem;
}

.setting-description {
  font-size: 0.72rem;
  color: var(--color-text-muted, #5A9A82);
  line-height: 1.3;
}

.separator {
  height: 1px;
  background: var(--color-border, rgba(126,196,168,0.1));
  margin: 0.35rem 0;
}

.marketplace-shortcut {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: var(--radius-md, 10px);
  background: linear-gradient(135deg, rgba(4, 164, 105, 0.12), rgba(15, 21, 32, 0.88));
  border: 1px solid rgba(4, 164, 105, 0.18);
}

.marketplace-shortcut-btn {
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
.gradients-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.85rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
}

.section-label {
  font-weight: 500;
  color: var(--color-text, white);
  font-size: 0.85rem;
}

.gradients-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.gradient-card {
  height: 56px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all 0.12s ease;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gradient-card:hover {
  transform: scale(1.03);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.gradient-card.active {
  border-color: var(--color-primary, #04A469);
}

.check-icon {
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
    padding: 0.4rem 0.5rem;
  }

  .gradients-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .marketplace-shortcut {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
