<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="settings.state" class="settings-overlay" @click="closeSettings">
        <div class="settings-modal" @click.stop>
          <!-- Header -->
          <div class="settings-header">
            <div class="header-content">
              <span class="settings-icon">⚙️</span>
              <h2 class="settings-title">Configuración</h2>
            </div>
            <button @click="closeSettings" class="close-btn">
              <span>✕</span>
            </button>
          </div>

          <!-- Navigation Tabs -->
          <div class="settings-nav">
            <button
              v-for="(item, index) in navs"
              :key="index"
              @click="changeTab(index)"
              :class="['nav-btn', { active: index === tab }]"
            >
              <span class="nav-icon">{{ item.emoji }}</span>
              <span class="nav-text">{{ item.title }}</span>
            </button>
          </div>

          <!-- Content -->
          <div class="settings-content">
            <!-- General Tab -->
            <div v-if="tab === 0" class="settings-section">
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Shortcuts</span>
                  <span class="setting-description">Mostrar accesos rápidos en la página</span>
                </div>
                <Switch @click="settings.changeShortcuts()" :state="settings.shortcuts" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Abrir búsqueda en</span>
                  <span class="setting-description">Dónde abrir los resultados de búsqueda</span>
                </div>
                <Dropdown v-model="settings.openLink" :options="openLinks"/>
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Nombre de la pestaña</span>
                  <span class="setting-description">Personaliza el título de la pestaña</span>
                </div>
                <Input placeholder="New Tab" :value="settings.tabName" v-model="title" round full/>
              </div>
            </div>

            <!-- Visual Tab -->
            <div v-if="tab === 1" class="settings-section">
              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Fondo</span>
                  <span class="setting-description">Tipo de fondo para la página</span>
                </div>
                <Dropdown v-model="background.type" :options="backgrounds" @change="changeBackground()" />
              </div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Modo oscuro</span>
                  <span class="setting-description">Activar tema oscuro</span>
                </div>
                <Switch @click="settings.setTheme()" :state="settings.theme == 'dark'" />
              </div>

              <div class="separator"></div>

              <div class="setting-item">
                <div class="setting-info">
                  <span class="setting-label">Modo de visualización</span>
                  <span class="setting-description">Selecciona cómo quieres ver tu página</span>
                </div>
                <Dropdown v-model="settings.mode" :options="modes" @change="changeBackground()" />
              </div>

              <div class="setting-item" v-if="settings.mode == 'Productivity'">
                <div class="setting-info">
                  <span class="setting-label">Personalizar widgets</span>
                  <span class="setting-description">Activar personalización de widgets</span>
                </div>
                <Switch @click="widgets.changeState" :state="widgets.state == true" />
              </div>

              <div v-if="background.type == 'Gradient'" class="gradients-section">
                <span class="section-label">Gradientes disponibles</span>
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
            </div>

            <!-- Shortcuts Tab -->
            <div v-if="tab === 2" class="settings-section">
              <div class="shortcuts-header">
                <h3 class="section-title">⌨️ Atajos de Teclado</h3>
                <p class="section-description">
                  Personaliza los atajos de teclado para acceder rápidamente a las funciones.
                </p>
              </div>

              <ShortcutEditor
                title="Abrir Paleta de Comandos"
                :shortcut="commandsStore.shortcuts.openCommandPalette"
                shortcutName="openCommandPalette"
                @update="updateShortcut"
                @reset="resetShortcut"
              />

              <ShortcutEditor
                title="Abrir Configuración"
                :shortcut="commandsStore.shortcuts.openSettings"
                shortcutName="openSettings"
                @update="updateShortcut"
                @reset="resetShortcut"
              />

              <div class="shortcuts-info">
                <p class="info-text">
                  💡 <strong>Consejo:</strong> Haz clic en el cuadro del atajo y presiona la combinación de teclas que deseas usar.
                </p>
                <p class="info-text">
                  ⚠️ <strong>Nota:</strong> Debes usar al menos una tecla modificadora (Ctrl, Alt, Shift).
                </p>
              </div>

              <button @click="resetAllShortcuts" class="reset-all-btn">
                Resetear Todos los Atajos
              </button>
            </div>

            <!-- Custom Shortcuts Tab -->
            <div v-if="tab === 3" class="settings-section">
              <CustomShortcutsManager />
            </div>
          </div>

          <!-- Footer -->
          <div class="settings-footer">
            <div class="footer-hint">
              <kbd>ESC</kbd> Cerrar
            </div>
          </div>
        </div>
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
import CustomShortcutsManager from './CustomShortcutsManager.vue';
import useTabStore from '../stores/useTabStore.js';
import useWidgets from '../stores/useWidgets.js';
import useCommandsStore from '../stores/useCommandsStore.js';

export default {
  name: 'SettingsModal',
  
  components: {
    Switch,
    Input,
    Dropdown,
    ShortcutEditor,
    CustomShortcutsManager,
  },

  data() {
    return {
      tab: 0,
      settings: useTabStore(),
      widgets: useWidgets(),
      commandsStore: useCommandsStore(),
      background: {
        type: null,
        default: true,
        class: 'bg-orange',
        color: null,
      },
      title: '',
      navs: [
        {
          title: 'General',
          emoji: '⚙️',
        },
        {
          title: 'Visual',
          emoji: '🎨',
        },
        {
          title: 'Atajos',
          emoji: '⌨️',
        },
        {
          title: 'Personalizados',
          emoji: '🔗',
        },
      ],
      openLinks: ['Self Tab', 'New Tab'],
      gradients: ['bg-orange', 'bg-green', 'bg-deal', 'bg-purple'],
      backgrounds: ['Gradient', 'Unsplash'],
      modes: ['Minimalist', 'Informative', 'Productivity'],
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
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },

    resetShortcut(shortcutName) {
      this.commandsStore.resetShortcut(shortcutName);
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },

    resetAllShortcuts() {
      if (confirm('¿Estás seguro de que quieres resetear todos los atajos a sus valores por defecto?')) {
        this.commandsStore.resetAllShortcuts();
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    },
  },
};
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

.settings-modal {
  width: 90%;
  max-width: 700px;
  max-height: 85vh;
  background: var(--bg-glass, rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  animation: slideDown 0.3s ease;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.2rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.settings-icon {
  font-size: 1.5rem;
}

.settings-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-color, white);
  margin: 0;
}

.close-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-color, white);
  font-size: 1.2rem;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.05);
}

.settings-nav {
  display: flex;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  overflow-x: auto;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--text-color, white);
  font-size: 0.9rem;
  white-space: nowrap;
}

.nav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.nav-btn.active {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
}

.nav-icon {
  font-size: 1.1rem;
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.setting-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  flex: 1;
}

.setting-label {
  font-weight: 500;
  color: var(--text-color, white);
  font-size: 0.95rem;
}

.setting-description {
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 0.5rem 0;
}

.gradients-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.section-label {
  font-weight: 500;
  color: var(--text-color, white);
  font-size: 0.9rem;
}

.gradients-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 0.8rem;
}

.gradient-card {
  height: 80px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.gradient-card:hover {
  transform: scale(1.05);
  border-color: rgba(255, 255, 255, 0.3);
}

.gradient-card.active {
  border-color: rgba(59, 130, 246, 0.8);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.4);
}

.check-icon {
  font-size: 1.5rem;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.shortcuts-header {
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-color, white);
  margin: 0 0 0.5rem 0;
}

.section-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.shortcuts-info {
  padding: 1rem;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
  border-radius: 10px;
  margin-top: 1rem;
}

.info-text {
  font-size: 0.85rem;
  color: var(--text-color, white);
  margin: 0.5rem 0;
}

.reset-all-btn {
  width: 100%;
  padding: 0.8rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 8px;
  color: var(--text-color, white);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-top: 1rem;
}

.reset-all-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  transform: translateY(-2px);
}

.settings-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0.8rem 1.5rem;
  background: rgba(255, 255, 255, 0.03);
}

.footer-hint {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.footer-hint kbd {
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-color, white);
  font-family: monospace;
}

/* Scrollbar personalizado */
.settings-content::-webkit-scrollbar {
  width: 6px;
}

.settings-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.settings-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.settings-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* Animaciones */
@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 768px) {
  .settings-modal {
    width: 95%;
    max-height: 90vh;
  }

  .settings-nav {
    overflow-x: auto;
  }

  .gradients-grid {
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  }
}
</style>
