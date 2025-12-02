<template>
  <Dialog :show="settings.state" @open="settings.updateState" title="Settings" icon="material-symbols-light:settings-outline-rounded">
    <template #nav>
      <div class="nav">
        <Button bound wFull v-for="(item, index) in navs" :title="item.title" :icon="item.icon" iconLeft
          @click="changeTab(index)" :class="[index == tab ? 'bg' : 'no-bg']" />
      </div>
    </template>
    <div class="contentDialog">
      <div class="main">
        <div v-if="tab === 0" class="column">
          
          <div class="section-main">
            <div class="section-dialog">
              <div class="flex justify-between align-center item">
                <span>Shortcuts</span>
                <div>
                  <Switch @click="settings.changeShortcuts()" :state="settings.shortcuts" />
                </div>
              </div>
              <div class="flex justify-between align-center item">
                <span>Open Search in:</span>
                <div>
                  <Dropdown v-model="settings.openLink" :options="openLinks"/>
                </div>
              </div>
              
              <div class="flex justify-between align-center item">
                <span>Tab Name:</span>
                <div>
                  <Input placeholder="New Tab" :value="settings.tabName" v-model="title" round full/>
                </div>
              </div>
            </div>
          </div>
        
        </div>

        <div v-if="tab === 1" class="settings">
          <div class="section-main">
            <div class="section-dialog">
              <div class="flex justify-between align-center item">
                <span>Background</span>
                <div>
                  <Dropdown v-model="background.type" :options="backgrounds" @change="changeBackground()" />
                </div>
              </div>
              <div class="flex justify-between align-center item">
                <span>Dark Mode</span>
                <div>
                  <Switch @click="settings.setTheme()" :state="settings.theme == 'dark'" />
                </div>
              </div>
            </div>
          </div>
          <div class="separator"></div>
          <div class="section-main">
            <div class="section-dialog">
              <div class="flex justify-between align-center item">
                <span>Select a mode</span>
                <div>
                  <Dropdown v-model="settings.mode" :options="modes" @change="changeBackground()" />
                </div>
              </div>
              <div class="flex justify-between align-center item" v-if="settings.mode == 'Productivity'">
                <span>Personalize</span>
                <div>
                  <Switch @click="widgets.changeState" :state="widgets.state == true" />
                </div>
              </div>
            </div>
          </div>
          

          <div v-if="background.type == 'Solid'" class="column ga-1">
            <div class="flex justify-between">
              <span>Color</span>
              <div class="flex ga-1">
                <label>Default</label>
                <input type="checkbox" v-model="background.default" />
              </div>
            </div>
            <!--<ColorPicker v-model="background.color" class="self-end" v-if="!background.default" />-->
          </div>

          <div v-if="background.type == 'Gradient'" class="column ga-1">
            <span>Gradients</span>
            <div class="flex ga-1">
              <div v-for="(item, index) in gradients" class="card"
                :class="[item, [background.class == item ? 'active' : '']]" @click="changeBackground(item)"></div>
            </div>
          </div>
        </div>

        <div v-if="tab === 2" class="shortcuts-tab">
          <div class="section-main">
            <h3 class="section-title">⌨️ Atajos de Teclado</h3>
            <p class="section-description">
              Personaliza los atajos de teclado para acceder rápidamente a las funciones.
            </p>
            
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
        </div>
      </div>
    </div>
  </Dialog>
</template>

<script>
import Button from './UI/Button.vue';
import Dialog from './UI/Dialog.vue';
import Switch from './UI/Switch.vue';
import Dropdown from './UI/Dropdown.vue';
import Input from './UI/Input.vue';
import ShortcutEditor from './ShortcutEditor.vue';
import useTabStore from '../stores/useTabStore.js';
import useWidgets from '../stores/useWidgets.js';
import useCommandsStore from '../stores/useCommandsStore.js';

export default {
  data() {
    return {
      modal: false,
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
          icon: "rivet-icons:settings",
        },
        {
          title: 'Visual',
          icon: "material-symbols-light:palette-outline",
        },
        {
          title: 'Atajos',
          icon: "material-symbols:keyboard-outline",
        },
      ],
      openLinks: ['Self Tab', 'New Tab'],
      gradients: ['bg-orange', 'bg-green', 'bg-deal', 'bg-purple'],
      backgrounds: ['Gradient', 'Unsplash'],
      modes: ['Minimalist', 'Informative', 'Productivity'],
    }
  },

  components: {
    Button,
    Dialog,
    Switch,
    Input,
    Dropdown,
    ShortcutEditor,
  },

  mounted() {
    this.loadSettings();
  },

  watch: {
    title(newTitle) {
      this.settings.setTitle(newTitle)
    }
  },

  methods: {
    openModal() {
      this.modal = !this.modal;
    },

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

    updateShortcut(shortcutName, shortcutConfig) {
      this.commandsStore.updateShortcut(shortcutName, shortcutConfig);
      // Recargar la página para aplicar los nuevos atajos
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },

    resetShortcut(shortcutName) {
      this.commandsStore.resetShortcut(shortcutName);
      // Recargar la página para aplicar los atajos reseteados
      setTimeout(() => {
        window.location.reload();
      }, 500);
    },

    resetAllShortcuts() {
      if (confirm('¿Estás seguro de que quieres resetear todos los atajos a sus valores por defecto?')) {
        this.commandsStore.resetAllShortcuts();
        // Recargar la página para aplicar los atajos reseteados
        setTimeout(() => {
          window.location.reload();
        }, 500);
      }
    },
  }
}
</script>

<style scoped>
.nav {
  background-color: var(--bg-secondary);
  border-radius: .8rem;
  padding: .2rem .2rem;
  display: flex;
  justify-content: space-around;
  gap: .3rem;
}

.main {
  padding: 1rem 0;
  font-size: .87rem;
}

.settings {
  display: flex;
  flex-direction: column;
}

.card {
  width: 60px;
  height: 60px;
  border-radius: .5rem;
}

.card.active {
  box-shadow: 0 0 4px var(--text-color);
}

.section-main {
  padding: 0 .8rem;
}

.section-dialog {
  background-color: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: .8rem;
  padding: .4rem;
}

.separator {
  width: 100%;
  background-color: rgba(255, 255, 255, 0.3);
  height: 1px;
  margin-top: 10px;
  margin-bottom: 10px;
}

.item {
  padding: .4rem;
  border-radius: .8rem;
  height: 50px;
}

.item span {
  font-size: .8rem;
  font-weight: 100;
}

.item > div {
  width: 100%;
  max-width: 180px;
  display: flex;
  justify-content: end;
}

.shortcuts-tab {
  padding: 1rem 0;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.section-description {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 1.5rem;
  line-height: 1.5;
}

.shortcuts-info {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
  border-radius: 8px;
  padding: 1rem;
  margin: 1.5rem 0;
}

.info-text {
  color: var(--text-color);
  font-size: 0.85rem;
  margin: 0.5rem 0;
  line-height: 1.5;
}

.info-text strong {
  font-weight: 600;
}

.reset-all-btn {
  width: 100%;
  padding: 0.8rem 1.5rem;
  background: rgba(239, 68, 68, 0.2);
  border: 1px solid rgba(239, 68, 68, 0.4);
  color: #fca5a5;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  margin-top: 1rem;
}

.reset-all-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.6);
  transform: translateY(-2px);
}
</style>
