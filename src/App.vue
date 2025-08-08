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
    <Production v-if="tabStore.mode == 'Productivity'" :key="gridKey"/>
    <Settings :style="{color: textColor }" />
  </div>
</template>

<script>
  import { defineAsyncComponent } from 'vue';
  import useTabStore from './stores/useTabStore.js';
  import UnsService from './services/UnsService.js';
  import useWidgets from './stores/useWidgets.js';

  export default {
    data() {
      return {
        loaded: true,
        canvas: null,
        backgroundImage: "",
        textColor: "black",
        tabStore: useTabStore(),
        widgets: useWidgets(),
        gridKey: Date.now(),
        imageAuthor: "",
        imageAuthorLink: "",
        imageLink: "",
      }
    },

    watch: {
      'widgets.state': function() {
        this.gridKey = Date.now()
      },

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
      Settings: defineAsyncComponent(() => import('./components/Settings.vue')),
    },

    mounted() {
      this.load();
      this.loadSettings();
      if(this.tabStore.mode == "Productivity") {
        this.widgets.loadWidgets();
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

      // Función para calcular la luminosidad de una imagen
      calculateLuminance(imageUrl) {
        return new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous'; // Permitir CORS
          img.src = imageUrl;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const pixels = ctx.getImageData(0, 0, img.width, img.height);
            const data = pixels.data;
            let r = 0, g = 0, b = 0;
            
            // Recorremospadding los píxeles para obtener el promedio de R, G, B
            for (let i = 0; i < data.length; i += 4) {
              r += data[i];     // Red
              g += data[i + 1]; // Green
              b += data[i + 2]; // Blue
            }

            const totalPixels = data.length / 4;
            r = r / totalPixels;
            g = g / totalPixels;
            b = b / totalPixels;

            // Cálculo de la luminosidad
            const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            resolve(luminance);
          };
        });
      },

      // Función para cambiar el color del texto dependiendo de la luminosidad de la imagen
      updateTextColor(luminance) {
        this.textColor = luminance < 0.5 ? 'white' : 'black';
      },

      // Función para campaddingbiar el color del texto si el fondo es un color sólido
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