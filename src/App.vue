<template>
  <div class="viewport" :class="{ 'bg-cl' : tabStore.theme !== 'light' }">
    <img :src="backgroundImage" class="background" v-if="tabStore.background.type == 'Unsplash'" />
    <div class="credits" v-if="tabStore.background.type == 'Unsplash'">
      📷 Photo by 
      <a :href="imageAuthorLink" target="_blank" rel="noopener noreferrer">{{ imageAuthor }}</a> 
      on <a :href="imageLink" target="_blank" rel="noopener noreferrer">Unsplash</a>
    </div>
    <Minimalist v-if="tabStore.mode == 'Minimalist'" />
    <Informative v-if="tabStore.mode == 'Informative'" />
    <Production v-if="tabStore.mode == 'Productivity'"/>
    <SettingsModal />
    <CommandPalette />
  </div>
</template>

<script>
  import { defineAsyncComponent } from 'vue';
  import useTabStore from './stores/useTabStore.js';
  import UnsService from './services/UnsService.js';
  import useWidgets from './stores/useWidgets.js';
  import useCommandsStore from './stores/useCommandsStore.js';
  import CommandPalette from './components/CommandPalette.vue';
  import { useCommands } from './composables/useCommands.js';
  import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';

  export default {
    data() {
      return {
        loaded: true,
        canvas: null,
        backgroundImage: "",
        textColor: 'white',
        tabStore: useTabStore(),
        widgets: useWidgets(),
        keyboardShortcutsCleanup: null,
        imageAuthor: "",
        imageAuthorLink: "",
        imageLink: "",
      }
    },

    watch: {
      'tabStore.mode': function (value){
        if(value == "Productivity"){
          this.widgets.loadWidgets();
        }
      }
    },

    components: {
      Minimalist: defineAsyncComponent(() => import('./pages/Min.vue')),
      Informative: defineAsyncComponent(() => import('./pages/Info.vue')),
      Production: defineAsyncComponent(() => import('./pages/Prod.vue')),
      SettingsModal: defineAsyncComponent(() => import('./components/SettingsModal.vue')),
      CommandPalette,
    },

    mounted() {
      this.load();
      this.loadSettings();
      if(this.tabStore.mode == "Productivity") {
        this.widgets.loadWidgets();
      }
      
      // Inicializar commandsStore si no existe
      const commandsStore = useCommandsStore();
      if (!commandsStore.shortcuts.openCommandPalette) {
        commandsStore.resetAllShortcuts();
      }
      
      this.setupKeyboardShortcuts();
    },

    beforeUnmount() {
      // Limpiar event listeners
      if (this.keyboardShortcutsCleanup) {
        this.keyboardShortcutsCleanup();
      }
    },

    methods: {
      loadSettings() {
        this.tabStore.loadSettings();
      },

      async load() {
        try {
          const uns = new UnsService();
          await uns.setImagen();
          this.backgroundImage = uns.getUrl();
          this.imageAuthor = uns.getAuthor();
          this.imageAuthorLink = uns.getAuthorLink();
          this.imageLink = uns.getImageLink();
          
          // Si el fondo es una imagen, calcular su luminosidad
          if (this.backgroundImage) {
            this.calculateLuminance(this.backgroundImage).then((luminance) => {
              this.updateTextColor(luminance);
            });
          } else if (this.backgroundColor) {
            this.updateTextColorForSolidBackground(this.backgroundColor);
          }
        } catch (e) {
          console.error("Error al cargar la imagen de fondo:", e);
        }
      },

      // Función optimizada para calcular la luminosidad de una imagen
      calculateLuminance(imageUrl) {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          img.src = imageUrl;
          
          // Timeout para evitar bloqueos largos
          const timeout = setTimeout(() => {
            resolve(0.5); // Valor por defecto si tarda mucho
          }, 3000);
          
          img.onload = () => {
            clearTimeout(timeout);
            
            // Usar requestIdleCallback para no bloquear el hilo principal
            const calculate = () => {
              const canvas = document.createElement("canvas");
              const ctx = canvas.getContext("2d", { willReadFrequently: true });
              
              // OPTIMIZACIÓN: Reducir canvas a 100x100px (suficiente para muestreo)
              const sampleSize = 100;
              canvas.width = sampleSize;
              canvas.height = sampleSize;
              
              // Dibujar imagen escalada
              ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
              const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize);
              const data = pixels.data;
              
              let r = 0, g = 0, b = 0;
              let sampleCount = 0;
              
              // OPTIMIZACIÓN: Muestrear solo cada 10 píxeles (10% de los píxeles)
              for (let i = 0; i < data.length; i += 40) { // 40 = 4 bytes * 10 píxeles
                r += data[i];     // Red
                g += data[i + 1]; // Green
                b += data[i + 2]; // Blue
                sampleCount++;
              }

              // Calcular promedio
              r = r / sampleCount;
              g = g / sampleCount;
              b = b / sampleCount;

              // Cálculo de la luminosidad
              const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
              resolve(luminance);
            };
            
            // Usar requestIdleCallback si está disponible, sino ejecutar directamente
            if ('requestIdleCallback' in window) {
              requestIdleCallback(calculate, { timeout: 1000 });
            } else {
              setTimeout(calculate, 0);
            }
          };
          
          img.onerror = () => {
            clearTimeout(timeout);
            resolve(0.5); // Valor por defecto en caso de error
          };
        });
      },

      // Función para cambiar el color del texto dependiendo de la luminosidad de la imagen
      updateTextColor(luminance) {
        this.textColor = luminance < 0.5 ? 'white' : 'black';
      },

      // Función para cambiar el color del texto si el fondo es un color sólido
      updateTextColorForSolidBackground(color) {
        const luminance = this.calculateLuminanceForColor(color);
        this.textColor = luminance < 0.5 ? 'white' : 'black';
      },

      // Función para calcular la luminosidad de un color sólido (en formato RGB)
      calculateLuminanceForColor(color) {
        const rgb = color.match(/\d+/g);
        if (rgb) {
          const [r, g, b] = rgb.map(Number);
          return (r * 0.2126 + g * 0.7152 + b * 0.0722) / 255;
        }
        return 0.5; // Retornar un valor medio por defecto si no se puede calcular
      },

      setupKeyboardShortcuts() {
        const { toggleCommandPalette } = useCommands();
        const commandsStore = useCommandsStore();
        
        // Configurar atajos de teclado desde el store
        const shortcuts = [];

        // Atajo para abrir paleta de comandos
        if (commandsStore.shortcuts.openCommandPalette.enabled) {
          const paletteShortcut = commandsStore.shortcuts.openCommandPalette;
          shortcuts.push({
            key: paletteShortcut.key,
            ctrl: paletteShortcut.ctrl,
            alt: paletteShortcut.alt,
            shift: paletteShortcut.shift,
            callback: (e) => {
              toggleCommandPalette();
            },
            allowInInput: false,
          });
        }

        // Atajo para abrir configuración
        if (commandsStore.shortcuts.openSettings.enabled) {
          const settingsShortcut = commandsStore.shortcuts.openSettings;
          shortcuts.push({
            key: settingsShortcut.key,
            ctrl: settingsShortcut.ctrl,
            alt: settingsShortcut.alt,
            shift: settingsShortcut.shift,
            callback: (e) => {
              this.tabStore.updateState();
            },
            allowInInput: false,
          });
        }
        const result = useKeyboardShortcuts(shortcuts);
        this.keyboardShortcutsCleanup = result.cleanup;
      },

    }
  }
</script>

<style scoped>
.viewport {
  width: 100%;
  height: 100%;
  min-height: 100vh;
  display: flex;
  position: relative;
}

.container {
  width: 100%;
  min-height: 100vh;
  padding: 1rem 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.header {
  width: 100%;
  height: 10%;
  display: flex;
  justify-content: end;
  align-items: center;
}

.main {
  height: 80%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.background {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: -3;
  object-fit: cover;
  pointer-events: none;
}

.credits {
  position: fixed;
  bottom: 0;
  left: 0;
  font-size: .8rem;
  color: white;
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  background-color: rgba(20, 20, 20, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: .4rem .6rem;
  border-radius: 0 4px 0 0;
  z-index: 3;
}

.credits a {
  color: white;
  text-decoration: underline;
}

.logo {
  width: 300px;
}
</style>