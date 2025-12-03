<template>
  <div class="containerProd">
    <!-- Indicador de modo edición -->
    <Transition name="slide-down">
      <div v-if="widgets.state" class="edit-mode-banner">
        <div class="banner-content">
          <span class="banner-icon">✏️</span>
          <span class="banner-text">Modo Edición Activo</span>
          <span class="banner-hint">Arrastra para mover • Redimensiona desde las esquinas • Click en + para añadir widgets</span>
        </div>
      </div>
    </Transition>

    <!-- Toolbar flotante (solo en modo edición) -->
    <Transition name="slide-up">
      <div v-if="widgets.state" class="floating-toolbar">
        <button @click="showWidgetLibrary = !showWidgetLibrary" class="toolbar-btn primary" :class="{ 'active': showWidgetLibrary }">
          <span class="btn-icon">➕</span>
          <span class="btn-text">Añadir Widget</span>
        </button>
        
        <div class="toolbar-divider"></div>
        
        <button @click="resetLayout" class="toolbar-btn">
          <span class="btn-icon">🔄</span>
          <span class="btn-text">Restaurar</span>
        </button>
        
        <button @click="clearAllWidgets" class="toolbar-btn danger">
          <span class="btn-icon">🗑️</span>
          <span class="btn-text">Limpiar</span>
        </button>
        
        <div class="toolbar-divider"></div>
        
        <button @click="widgets.changeState()" class="toolbar-btn success">
          <span class="btn-icon">✓</span>
          <span class="btn-text">Finalizar</span>
        </button>
      </div>
    </Transition>

    <!-- Panel lateral de biblioteca de widgets (temporal) -->
    <Transition name="slide-left">
      <div v-if="widgets.state && showWidgetLibrary" class="widget-library-panel">
        <div class="library-header">
          <h3>📦 Biblioteca de Widgets</h3>
          <button @click="showWidgetLibrary = false" class="close-library-btn">✕</button>
        </div>
        
        <div class="library-content">
          <div class="library-section">
            <h4>Widgets Disponibles</h4>
            <div class="widget-grid">
              <div 
                v-for="widget in availableWidgets" 
                :key="widget.component"
                @click="addWidget(widget)"
                class="widget-card"
                :title="'Añadir ' + widget.name"
              >
                <div class="widget-card-icon">{{ widget.icon }}</div>
                <div class="widget-card-name">{{ widget.name }}</div>
                <div class="widget-card-size">{{ widget.w }}x{{ widget.h }}</div>
              </div>
            </div>
          </div>
          
          <div class="library-section">
            <h4>Widgets Activos ({{ widgets.widgets.length }})</h4>
            <div class="active-widgets-list">
              <div 
                v-for="widget in widgets.widgets" 
                :key="widget.id"
                class="active-widget-item"
              >
                <span class="widget-icon">{{ getWidgetIcon(widget.component) }}</span>
                <span class="widget-name">{{ getWidgetDisplayName(widget.name) }}</span>
                <button 
                  @click="toggleWidgetVisibility(widget.id)" 
                  class="visibility-btn"
                  :title="widget.visible !== false ? 'Ocultar' : 'Mostrar'"
                >
                  <span v-if="widget.visible !== false">👁️</span>
                  <span v-else style="opacity: 0.3">👁️</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Overlay oscuro cuando el panel está abierto -->
    <Transition name="fade">
      <div 
        v-if="widgets.state && showWidgetLibrary" 
        class="library-overlay"
        @click="showWidgetLibrary = false"
      ></div>
    </Transition>

    <!-- Contenido principal -->
    <div class="content" :class="{ 'edit-mode': widgets.state }">
      <!-- Grid de widgets -->
      <div ref="gridContainer" class="grid-stack">
        <div v-for="(item, index) in visibleWidgets" :key="item.id" class="grid-stack-item"
          :class="{ 'editable': widgets.state }" :gs-id="item.id" :gs-x="item.x" :gs-y="item.y" :gs-w="item.w" :gs-h="item.h">
          <div class="grid-stack-item-content">
            <!-- Controles del widget en modo edición -->
            <Transition name="fade">
              <div v-if="widgets.state" class="widget-controls">
                <div class="drag-handle" title="Arrastra para mover">
                  <span>⋮⋮</span>
                </div>
                <button @click="removeWidget(item.id)" class="widget-remove-btn" title="Eliminar widget">
                  ✕
                </button>
              </div>
            </Transition>
            <!-- Componente dinámico -->
            <component :is="loadWidget(item.component, item.local)" v-bind="item.props" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- Botón de configuración en la esquina inferior izquierda -->
    <div class="bottom">
      <b-setting />
    </div>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useWidgets from '../stores/useWidgets.js';
import useTabStore from '../stores/useTabStore.js';
import { GridStack } from "gridstack";
export default {
  data() {
    return {
      grid: null,
      widgets: useWidgets(),
      showWidgetLibrary: false,
      availableWidgets: [
        { name: 'Búsqueda', icon: '🔍', component: 'ZSearchWidget', local: false, w: 6, h: 1 },
        { name: 'Notas', icon: '📝', component: 'ZMarkedWidget', local: false, w: 6, h: 5 },
        { name: 'RSS News', icon: '📰', component: 'RssWidget', local: true, w: 6, h: 5 },
        { name: 'Astian News', icon: '🚀', component: 'AstianRssWidget', local: true, w: 6, h: 4 },
        { name: 'Logo', icon: '🎨', component: 'Logo', local: true, w: 2, h: 2 },
        { name: 'Reloj', icon: '🕐', component: 'ClockWidget', local: true, w: 3, h: 2 },
        { name: 'Clima', icon: '🌤️', component: 'WeatherWidget', local: true, w: 3, h: 3 },
      ],
    }
  },

  computed: {
    visibleWidgets() {
      return this.widgets.widgets.filter(w => w.visible !== false);
    }
  },

  watch: {
    'widgets.state'(newState) {
      // Actualizar el estado de edición del grid sin recargarlo
      if (this.grid) {
        this.grid.enableMove(newState);
        this.grid.enableResize(newState);
      }
    }
  },

  components: {
    BSetting: defineAsyncComponent(() => import('../components/BSetting.vue')),
  },

  mounted() {
    this.loadGrid()
  },

  beforeUnmount() {
    // Limpiar el grid al desmontar el componente
    if (this.grid) {
      this.grid.destroy(false);
      this.grid = null;
    }
  },

  methods: {
    getWidgetIcon(component) {
      const icons = {
        'ZSearchWidget': '🔍',
        'ZMarkedWidget': '📝',
        'RssWidget': '📰',
        'AstianRssWidget': '🚀',
        'Logo': '🎨',
        'BSetting': '⚙️',
        'ClockWidget': '🕐',
        'WeatherWidget': '🌤️',
      };
      return icons[component] || '📦';
    },

    getWidgetDisplayName(name) {
      const names = {
        'search': 'Búsqueda',
        'marked': 'Notas',
        'rss-news': 'RSS News',
        'astian-news': 'Astian News',
        'logo': 'Logo',
        'setting': 'Ajustes',
        'clock': 'Reloj',
        'weather': 'Clima',
      };
      return names[name] || name;
    },

    toggleWidgetVisibility(id) {
      const widget = this.widgets.widgets.find(w => w.id === id);
      if (widget) {
        widget.visible = widget.visible === false ? true : false;
        this.widgets.updateWidget(widget);
        // No necesitamos recargar el grid, Vue reactivamente actualiza visibleWidgets
      }
    },

    removeWidget(id) {
      if (confirm('¿Eliminar este widget?')) {
        // Encontrar el elemento del DOM
        const element = this.$el.querySelector(`[gs-id="${id}"]`);
        if (element && this.grid) {
          // Usar método incremental de GridStack
          this.grid.removeWidget(element, false);
        }
        // Actualizar el store
        this.widgets.widgets = this.widgets.widgets.filter(w => w.id !== id);
      }
    },

    addWidget(widgetTemplate) {
      const newId = Math.max(...this.widgets.widgets.map(w => w.id), 0) + 1;
      const setting = useTabStore();
      const newWidget = {
        id: newId,
        x: 0,
        y: 0,
        w: widgetTemplate.w,
        h: widgetTemplate.h,
        name: widgetTemplate.name.toLowerCase().replace(/\s+/g, '-'),
        component: widgetTemplate.component,
        local: widgetTemplate.local,
        visible: true,
      };
      
      if (widgetTemplate.component === 'ZMarkedWidget') {
        newWidget.props = {
          theme: setting.theme,
          small: true,
          useStorage: true,
        };
      }
      
      // Añadir al store primero
      this.widgets.widgets.push(newWidget);
      
      // Esperar a que Vue renderice el nuevo elemento
      this.$nextTick(() => {
        // Encontrar el elemento recién añadido
        const element = this.$el.querySelector(`[gs-id="${newId}"]`);
        if (element && this.grid) {
          // Hacer que GridStack lo maneje
          this.grid.makeWidget(element);
        }
      });
    },

    resetLayout() {
      if (confirm('¿Restaurar el layout por defecto? Se perderán los cambios actuales.')) {
        localStorage.removeItem('widgets');
        this.widgets.loadWidgets();
        // Destruir y recrear grid solo en este caso (cambio completo de layout)
        this.$nextTick(() => {
          if (this.grid) {
            this.grid.destroy(false);
          }
          this.loadGrid();
        });
      }
    },

    clearAllWidgets() {
      if (confirm('¿Eliminar todos los widgets? Esta acción no se puede deshacer.')) {
        // Remover todos los widgets del grid
        if (this.grid) {
          this.grid.removeAll(false);
        }
        // Limpiar el store
        this.widgets.widgets = [];
      }
    },


    loadGrid() {
      const screenHeight = window.innerHeight;
      const rows = 12;
      const cellHeight = Math.floor(screenHeight / rows);
      
      // Inicializar grid solo si no existe
      if (!this.grid) {
        this.grid = GridStack.init({
          float: true,
          cellHeight: cellHeight + 'px',
          margin: '8px',
          animate: true,
          disableOneColumnMode: true,
        });

        // Configurar event listener solo una vez
        this.grid.on('change', (event, el) => {
          const nodes = this.grid.getGridItems();
          // Buscar el nodo correspondiente al elemento actual (el)
          const node = nodes.find(item => item === el[0].el).gridstackNode;

          if (node) {
            // Crear el objeto del widget actualizado
            const widgetData = {
              id: parseInt(node.id),
              x: node.x,
              y: node.y,
              w: node.w,
              h: node.h,
            };
            this.widgets.updateWidget(widgetData);
          }
        });
      }

      // Actualizar estado de edición sin recrear el grid
      this.grid.enableMove(this.widgets.state);
      this.grid.enableResize(this.widgets.state);
    }
    ,

    loadWidget(name, isLocal) {
      if (isLocal) {
        return defineAsyncComponent(() => import(`../components/${name}.vue`));
      } else {
        return defineAsyncComponent(() => import('zen-wdg').then(m => m[name]));
      }
    },

  }
}
</script>

<style scoped>
.containerProd {
  width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1rem 2rem;
  font-size: 13px;
  position: relative;
}

.bottom {
  position: fixed;
  bottom: 1rem;
  left: 1rem;
  z-index: 100;
}

/* ===== BANNER DE MODO EDICIÓN ===== */
.edit-mode-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.95), rgba(68, 160, 141, 0.95));
  border-bottom: 2px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 4px 20px rgba(78, 205, 196, 0.3);
  padding: 1rem 2rem;
}

.banner-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  color: white;
  flex-wrap: wrap;
}

.banner-icon {
  font-size: 1.5rem;
}

.banner-text {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.banner-hint {
  font-size: 0.9rem;
  opacity: 0.9;
  font-weight: 400;
}

/* ===== TOOLBAR FLOTANTE ===== */
.floating-toolbar {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background-color: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 1rem;
  padding: 0.75rem 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.toolbar-btn {
  /* Eliminado backdrop-filter para mejor rendimiento */
  background-color: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  color: var(--text-color);
  padding: 0.65rem 1.25rem;
  border-radius: 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.toolbar-btn.primary {
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.3), rgba(68, 160, 141, 0.3));
  border-color: rgba(78, 205, 196, 0.5);
  color: #4ecdc4;
}

.toolbar-btn.primary:hover,
.toolbar-btn.primary.active {
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.5), rgba(68, 160, 141, 0.5));
  border-color: rgba(78, 205, 196, 0.8);
}

.toolbar-btn.success {
  background: linear-gradient(135deg, rgba(46, 213, 115, 0.3), rgba(34, 166, 90, 0.3));
  border-color: rgba(46, 213, 115, 0.5);
  color: #2ed573;
}

.toolbar-btn.success:hover {
  background: linear-gradient(135deg, rgba(46, 213, 115, 0.5), rgba(34, 166, 90, 0.5));
  border-color: rgba(46, 213, 115, 0.8);
}

.toolbar-btn.danger {
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.3), rgba(238, 82, 83, 0.3));
  border-color: rgba(255, 107, 107, 0.5);
  color: #ff6b6b;
}

.toolbar-btn.danger:hover {
  background: linear-gradient(135deg, rgba(255, 107, 107, 0.5), rgba(238, 82, 83, 0.5));
  border-color: rgba(255, 107, 107, 0.8);
}

.btn-icon {
  font-size: 1.1rem;
}

.btn-text {
  font-size: 0.9rem;
}

.toolbar-divider {
  width: 1px;
  height: 2rem;
  background: rgba(255, 255, 255, 0.2);
  margin: 0 0.5rem;
}

/* ===== PANEL LATERAL DE BIBLIOTECA ===== */
.widget-library-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 380px;
  height: 100vh;
  z-index: 999;
  backdrop-filter: blur(30px) saturate(180%);
  -webkit-backdrop-filter: blur(30px) saturate(180%);
  background-color: var(--bg-glass);
  border-left: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.library-header {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.1), rgba(68, 160, 141, 0.1));
}

.library-header h3 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-color);
}

.close-library-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-color);
  width: 32px;
  height: 32px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.close-library-btn:hover {
  background: rgba(255, 107, 107, 0.3);
  border-color: rgba(255, 107, 107, 0.5);
  transform: rotate(90deg);
}

.library-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

.library-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.library-section h4 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-color);
  text-transform: uppercase;
  letter-spacing: 1px;
  opacity: 0.7;
}

.widget-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.widget-card {
  /* Eliminado backdrop-filter - ya está dentro de panel con blur */
  background-color: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-radius: 0.75rem;
  padding: 1.25rem;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
}

.widget-card:hover {
  background-color: var(--bg-blur);
  border-color: rgba(78, 205, 196, 0.5);
  transform: translateY(-4px) scale(1.02);
  box-shadow: 0 8px 24px rgba(78, 205, 196, 0.2);
}

.widget-card-icon {
  font-size: 2.5rem;
}

.widget-card-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color);
  text-align: center;
}

.widget-card-size {
  font-size: 0.75rem;
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.active-widgets-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.active-widget-item {
  /* Eliminado backdrop-filter - ya está dentro de panel con blur */
  background-color: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  transition: all 0.2s ease;
}

.active-widget-item:hover {
  background-color: var(--bg-blur);
  border-color: rgba(255, 255, 255, 0.3);
}

.widget-icon {
  font-size: 1.25rem;
}

.widget-name {
  flex: 1;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-color);
}

.visibility-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  padding: 0.25rem;
  transition: all 0.2s ease;
  opacity: 0.7;
}

.visibility-btn:hover {
  opacity: 1;
  transform: scale(1.1);
}

.library-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

/* ===== CONTENIDO PRINCIPAL ===== */
.content {
  width: 100%;
  max-width: 1600px;
  flex: 1;
  display: flex;
  flex-direction: column;
  transition: all 0.3s ease;
}

.content.edit-mode {
  padding-top: 4rem;
  padding-bottom: 6rem;
}

.grid-stack {
  width: 100%;
  min-height: 80vh;
  font-size: 13px;
}

.grid-stack-item {
  box-sizing: border-box;
  transition: all 0.3s ease;
}

.grid-stack-item-content {
  width: 100%;
  height: 100%;
  position: relative;
  /* Mantener backdrop-filter aquí - es contenedor principal de widget */
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  background-color: var(--bg-glass);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 1rem;
  overflow: hidden;
  transition: all 0.3s ease;
}

.grid-stack-item-content:hover {
  background-color: var(--bg-blur);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.grid-stack-item.editable .grid-stack-item-content {
  border: 2px dashed rgba(78, 205, 196, 0.5);
  background-color: rgba(78, 205, 196, 0.05);
  cursor: move;
}

.grid-stack-item.editable:hover .grid-stack-item-content {
  border-color: rgba(78, 205, 196, 0.8);
  background-color: rgba(78, 205, 196, 0.1);
  box-shadow: 0 4px 16px rgba(78, 205, 196, 0.3);
}

/* ===== CONTROLES DE WIDGET ===== */
.widget-controls {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 10;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.drag-handle {
  /* Eliminado backdrop-filter - botón pequeño */
  background: linear-gradient(135deg, rgba(78, 205, 196, 0.95), rgba(68, 160, 141, 0.95));
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 6px rgba(78, 205, 196, 0.3);
  color: white;
  padding: 0.35rem 0.6rem;
  border-radius: 0.5rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: move;
  letter-spacing: -2px;
  transition: all 0.2s ease;
}

.drag-handle:hover {
  background: linear-gradient(135deg, rgba(78, 205, 196, 1), rgba(68, 160, 141, 1));
  transform: scale(1.05);
  box-shadow: 0 4px 12px rgba(78, 205, 196, 0.5);
}

.widget-remove-btn {
  /* Eliminado backdrop-filter - botón pequeño */
  background-color: rgba(255, 107, 107, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.3);
  box-shadow: 0 2px 6px rgba(255, 107, 107, 0.3);
  color: white;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  font-weight: bold;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.widget-remove-btn:hover {
  background-color: rgba(255, 107, 107, 1);
  transform: scale(1.15);
  box-shadow: 0 4px 12px rgba(255, 107, 107, 0.5);
}

/* ===== ANIMACIONES ===== */
.slide-down-enter-active,
.slide-down-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-down-enter-from {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-up-enter-from {
  transform: translateY(150%) translateX(-50%);
  opacity: 0;
}

.slide-up-leave-to {
  transform: translateY(150%) translateX(-50%);
  opacity: 0;
}

.slide-left-enter-active,
.slide-left-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-left-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.slide-left-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ===== SCROLLBAR ===== */
.library-content::-webkit-scrollbar,
.grid-stack::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.library-content::-webkit-scrollbar-track,
.grid-stack::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.library-content::-webkit-scrollbar-thumb,
.grid-stack::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 3px;
}

.library-content::-webkit-scrollbar-thumb:hover,
.grid-stack::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.3);
}

/* ===== RESPONSIVE ===== */
@media (max-width: 768px) {
  .widget-library-panel {
    width: 100%;
  }
  
  .banner-hint {
    display: none;
  }
  
  .toolbar-btn .btn-text {
    display: none;
  }
  
  .toolbar-btn {
    padding: 0.65rem;
  }
}
</style>