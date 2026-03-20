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
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.general.shortcuts }}</span>
                  <span class="setting-description">{{ i18n.t.general.shortcutsDesc }}</span>
                </div>
                <Switch @click="settings.changeShortcuts()" :state="settings.shortcuts" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">{{ i18n.t.general.openSearchIn }}</span>
                  <span class="setting-description">{{ i18n.t.general.openSearchInDesc }}</span>
                </div>
                <Dropdown v-model="settings.openLink" :options="openLinks"/>
              </div>

              <div class="setting-item">
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

              <div class="separator"></div>

              <div class="section-header">
                <h3 class="section-title-main">{{ i18n.t.widgets?.title || 'Widgets' }}</h3>
                <p class="section-subtitle">{{ i18n.t.widgets?.subtitle || 'Activa o desactiva los componentes del New Tab' }}</p>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">🔍 {{ i18n.t.widgets?.search || 'Buscador' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.searchDesc || 'Caja de búsqueda con AstianGO y Qwant' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('search')" :state="widgetsStore.enabled.search" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">🔖 {{ i18n.t.widgets?.bookmarks || 'Marcadores' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.bookmarksDesc || 'Accesos directos a tus sitios favoritos' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('bookmarks')" :state="widgetsStore.enabled.bookmarks" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">📰 {{ i18n.t.widgets?.rss || 'Noticias RSS' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.rssDesc || 'Feed de noticias personalizado' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('rss')" :state="widgetsStore.enabled.rss" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">📅 {{ i18n.t.widgets?.calendar || 'Calendario' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.calendarDesc || 'Fecha actual y próximos eventos' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('calendar')" :state="widgetsStore.enabled.calendar" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">📝 {{ i18n.t.widgets?.notes || 'Notas rápidas' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.notesDesc || 'Bloc de notas persistente' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('notes')" :state="widgetsStore.enabled.notes" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">✅ {{ i18n.t.widgets?.todo || 'Lista de tareas' }}</span>
                  <span class="setting-description">{{ i18n.t.widgets?.todoDesc || 'Gestiona tus pendientes' }}</span>
                </div>
                <Switch @click="widgetsStore.toggle('todo')" :state="widgetsStore.enabled.todo" />
              </div>
            </div>

            <!-- Visual Tab -->
            <div v-if="tab === 1" class="settings-section">
              <div class="section-header">
                <h3 class="section-title-main">{{ i18n.t.visual.title }}</h3>
                <p class="section-subtitle">{{ i18n.t.visual.subtitle }}</p>
              </div>
              <div class="setting-item">
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

              <ThemePicker />
            </div>

            <!-- Shortcuts Tab -->
            <div v-if="tab === 2" class="settings-section">
              <div class="shortcuts-header">
                <h3 class="section-title">⌨️ {{ i18n.t.shortcutsTab.title }}</h3>
                <p class="section-description">
                  {{ i18n.t.shortcutsTab.description }}
                </p>
              </div>

              <ShortcutEditor
                :title="i18n.t.shortcutsTab.openCommandPalette"
                :shortcut="commandsStore.shortcuts.openCommandPalette"
                shortcutName="openCommandPalette"
                @update="updateShortcut"
                @reset="resetShortcut"
              />

              <ShortcutEditor
                :title="i18n.t.shortcutsTab.openSettings"
                :shortcut="commandsStore.shortcuts.openSettings"
                shortcutName="openSettings"
                @update="updateShortcut"
                @reset="resetShortcut"
              />

              <div class="shortcuts-info">
                <p class="info-text">
                  💡 <strong>Tip:</strong> {{ i18n.t.shortcutsTab.tip }}
                </p>
                <p class="info-text">
                  ⚠️ <strong>Note:</strong> {{ i18n.t.shortcutsTab.note }}
                </p>
              </div>

              <button @click="resetAllShortcuts" class="reset-all-btn">
                {{ i18n.t.shortcutsTab.resetAll }}
              </button>
            </div>

            <!-- Language Tab -->
            <div v-if="tab === 3" class="settings-section">
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
import ShortcutEditor from './ShortcutEditor.vue';
import ThemePicker from './ThemePicker.vue';
import LanguageSelector from './LanguageSelector.vue';
import useTabStore from '../stores/useTabStore.js';
import useCommandsStore from '../stores/useCommandsStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useSpacesStore from '../stores/useSpacesStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';
import { useAutoTheme } from '../composables/useAutoTheme.js';
import { useKeyboardShortcuts } from '../composables/useKeyboardShortcuts.js';

export default {
  name: 'SettingsModal',
  
  components: {
    Switch,
    Input,
    Dropdown,
    ShortcutEditor,
    ThemePicker,
    LanguageSelector,
  },

  data() {
    return {
      tab: 0,
      settings: useTabStore(),
      commandsStore: useCommandsStore(),
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
        { emoji: '⌨️', titleKey: 'navShortcuts', descKey: 'navShortcutsDesc' },
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

    updateShortcut(shortcutName, shortcutConfig) {
      this.commandsStore.updateShortcut(shortcutName, shortcutConfig);
    },

    resetShortcut(shortcutName) {
      this.commandsStore.resetShortcut(shortcutName);
    },

    resetAllShortcuts() {
      if (confirm(this.i18n.t.shortcutsTab.resetConfirm)) {
        this.commandsStore.resetAllShortcuts();
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

/* ── Shortcuts ── */
.shortcuts-header {
  margin-bottom: 0.5rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text, white);
  margin: 0 0 0.3rem 0;
}

.section-description {
  font-size: 0.78rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
}

.shortcuts-info {
  padding: 0.75rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid rgba(59, 130, 246, 0.15);
  border-radius: var(--radius-sm, 6px);
  margin-top: 0.5rem;
}

.info-text {
  font-size: 0.78rem;
  color: var(--color-text, white);
  margin: 0.3rem 0;
}

.reset-all-btn {
  width: 100%;
  padding: 0.65rem;
  background: rgba(239, 68, 68, 0.12);
  border: 1px solid rgba(239, 68, 68, 0.25);
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text, white);
  font-weight: 500;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.1s ease;
  margin-top: 0.5rem;
}

.reset-all-btn:hover {
  background: rgba(239, 68, 68, 0.2);
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
}
</style>
