<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="isCommandPaletteOpen" class="command-palette-overlay" @click="closeCommandPalette">
        <div class="command-palette" @click.stop>
          <!-- Search Input -->
          <div class="search-container">
            <Search class="search-icon" :size="20" :stroke-width="1.5" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              @input="handleSearch"
              @keydown.down.prevent="selectNext"
              @keydown.up.prevent="selectPrevious"
              @keydown.enter.prevent="executeSelected"
              @keydown.esc="closeCommandPalette"
              type="text"
              placeholder="Buscar comandos, apps, historial..."
              class="search-input"
              autofocus
            />
            <kbd class="kbd">ESC</kbd>
          </div>

          <!-- Results -->
          <div class="results-container" v-if="searchResults.length > 0">
            <div
              v-for="(result, index) in searchResults"
              :key="result.id"
              :class="['result-item', { selected: index === selectedIndex }]"
              @click="executeCommand(result)"
              @mouseenter="selectedIndex = index"
            >
              <div class="result-icon">{{ result.icon }}</div>
              <div class="result-content">
                <div class="result-name">{{ result.name }}</div>
                <div class="result-description">{{ result.description }}</div>
              </div>
              <div class="result-meta">
                <span class="result-category" :data-category="result.category">
                  {{ getCategoryLabel(result.category) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div v-else-if="searchQuery && !isSearching" class="empty-state">
            <SearchX class="empty-icon-svg" :size="48" :stroke-width="1" />
            <p>No se encontraron resultados</p>
            <small>Intenta buscar por nombre, URL o categoría</small>
          </div>

          <!-- Default State -->
          <div v-else-if="!searchQuery" class="default-state">
            <!-- Comandos personalizados del usuario -->
            <div v-if="customCommands.length > 0" class="custom-commands-section">
              <div class="section-header">
                <Star class="section-icon-svg" :size="16" :stroke-width="2" />
                <h3 class="section-title">Tus Atajos</h3>
              </div>
              <div class="custom-commands-list">
                <div
                  v-for="cmd in customCommands.slice(0, 6)"
                  :key="cmd.id"
                  class="mini-command custom"
                  @click="executeCommand(cmd)"
                >
                  <span>{{ cmd.icon || '🔗' }}</span>
                  <span>{{ cmd.name }}</span>
                </div>
              </div>
            </div>

            <!-- Categorías predefinidas -->
            <div class="categories-grid">
              <div
                v-for="category in categoryGroups"
                :key="category.name"
                class="category-card"
              >
                <div class="category-header">
                  <span class="category-icon">{{ category.icon }}</span>
                  <h3>{{ category.label }}</h3>
                </div>
                <div class="category-commands">
                  <div
                    v-for="cmd in getCommandsByCategory(category.name)"
                    :key="cmd.id"
                    class="mini-command"
                    @click="executeCommand(cmd)"
                  >
                    <span>{{ cmd.icon }}</span>
                    <span>{{ cmd.name }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Loading State -->
          <div v-if="isSearching" class="loading-state">
            <div class="spinner"></div>
            <p>Buscando...</p>
          </div>

          <!-- Footer -->
          <div class="command-footer">
            <div class="shortcuts-hint">
              <kbd>↑↓</kbd> Navegar
              <kbd>↵</kbd> Seleccionar
              <kbd>ESC</kbd> Cerrar
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, watch, nextTick, computed } from 'vue';
import { Search, SearchX, Star } from 'lucide-vue-next';
import { useCommands } from '../composables/useCommands.js';
import useCommandsStore from '../stores/useCommandsStore.js';

export default {
  name: 'CommandPalette',
  components: { Search, SearchX, Star },
  setup() {
    const {
      searchQuery,
      isCommandPaletteOpen,
      selectedIndex,
      searchResults,
      isSearching,
      predefinedCommands,
      performSearch,
      executeCommand,
      closeCommandPalette,
      selectNext,
      selectPrevious,
      executeSelected,
    } = useCommands();

    const commandsStore = useCommandsStore();
    const searchInput = ref(null);
    
    // Obtener comandos personalizados del store
    const customCommands = computed(() => commandsStore.customCommands);

    // Categorías con sus labels e iconos
    const categoryGroups = [
      { name: 'productivity', label: 'Productividad', icon: '⚡' },
      { name: 'communication', label: 'Comunicación', icon: '💬' },
      { name: 'development', label: 'Desarrollo', icon: '💻' },
      { name: 'design', label: 'Diseño', icon: '🎨' },
      { name: 'social', label: 'Social', icon: '🌐' },
      { name: 'utilities', label: 'Utilidades', icon: '🛠️' },
    ];

    const categoryLabels = {
      productivity: 'Productividad',
      communication: 'Comunicación',
      development: 'Desarrollo',
      design: 'Diseño',
      social: 'Social',
      utilities: 'Utilidades',
      history: 'Historial',
      bookmarks: 'Marcadores',
      tabs: 'Pestañas',
    };

    // Debounce para la búsqueda
    let searchTimeout = null;
    const handleSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(searchQuery.value);
      }, 200);
    };

    const getCategoryLabel = (category) => {
      return categoryLabels[category] || category;
    };

    const getCommandsByCategory = (category) => {
      return predefinedCommands.filter(cmd => cmd.category === category).slice(0, 4);
    };

    // Focus en el input cuando se abre
    watch(isCommandPaletteOpen, (isOpen) => {
      if (isOpen) {
        nextTick(() => {
          searchInput.value?.focus();
        });
      }
    });

    return {
      searchQuery,
      isCommandPaletteOpen,
      selectedIndex,
      searchResults,
      isSearching,
      searchInput,
      categoryGroups,
      customCommands,
      handleSearch,
      executeCommand,
      closeCommandPalette,
      selectNext,
      selectPrevious,
      executeSelected,
      getCategoryLabel,
      getCommandsByCategory,
    };
  },
};
</script>

<style scoped>
.command-palette-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 9999;
  animation: fadeIn 0.2s ease;
}

.command-palette {
  width: 90%;
  max-width: 640px;
  background: var(--glass-bg, rgba(0, 184, 148, 0.03));
  backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%));
  -webkit-backdrop-filter: blur(var(--glass-blur, 20px)) saturate(var(--glass-saturate, 180%));
  border: 1px solid var(--glass-border, rgba(0, 184, 148, 0.12));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-xl, 0 20px 60px rgba(0, 0, 0, 0.3)), var(--shadow-glow, 0 0 20px rgba(0, 184, 148, 0.08));
  overflow: hidden;
  animation: slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.search-container {
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid var(--glass-border, rgba(0, 184, 148, 0.1));
  gap: 0.8rem;
  background: rgba(0, 184, 148, 0.02);
}

.search-icon {
  color: var(--midori-400, #26d99f);
  opacity: 0.7;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color, white);
  font-size: 1rem;
  font-family: inherit;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.kbd {
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--text-color, white);
  font-family: monospace;
}

.results-container {
  overflow-y: auto;
  max-height: 400px;
  padding: 0.5rem;
}

.result-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 0.3rem;
}

.result-item:hover,
.result-item.selected {
  background: rgba(0, 184, 148, 0.08);
  transform: translateX(4px);
  border-left: 2px solid rgba(0, 184, 148, 0.4);
}

.result-icon {
  font-size: 1.5rem;
  min-width: 32px;
  text-align: center;
}

.result-content {
  flex: 1;
  min-width: 0;
}

.result-name {
  font-weight: 500;
  color: var(--text-color, white);
  margin-bottom: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.result-category {
  font-size: 0.7rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color, white);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-category[data-category="productivity"] {
  background: rgba(59, 130, 246, 0.3);
}

.result-category[data-category="communication"] {
  background: rgba(16, 185, 129, 0.3);
}

.result-category[data-category="development"] {
  background: rgba(139, 92, 246, 0.3);
}

.result-category[data-category="design"] {
  background: rgba(236, 72, 153, 0.3);
}

.result-category[data-category="history"] {
  background: rgba(251, 191, 36, 0.3);
}

.result-category[data-category="bookmarks"] {
  background: rgba(245, 158, 11, 0.3);
}

.result-category[data-category="tabs"] {
  background: rgba(14, 165, 233, 0.3);
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  color: var(--text-color, white);
  text-align: center;
}

.empty-icon-svg {
  color: var(--midori-400, #26d99f);
  margin-bottom: 1rem;
  opacity: 0.4;
}

.section-icon-svg {
  color: var(--midori-400, #26d99f);
  flex-shrink: 0;
}

.empty-state p {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  opacity: 0.8;
}

.empty-state small {
  opacity: 0.6;
}

.default-state {
  padding: 1rem;
  overflow-y: auto;
  max-height: 450px;
}

.custom-commands-section {
  margin-bottom: 1.5rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.section-icon {
  font-size: 1.2rem;
}

.section-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.custom-commands-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 0.5rem;
}

.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.category-card {
  background: rgba(0, 184, 148, 0.03);
  border: 1px solid var(--glass-border, rgba(0, 184, 148, 0.08));
  border-radius: var(--radius-md, 10px);
  padding: 1rem;
  transition: all var(--transition-normal, 0.2s ease);
}

.category-card:hover {
  background: rgba(0, 184, 148, 0.06);
  border-color: rgba(0, 184, 148, 0.2);
  box-shadow: var(--shadow-glow, 0 0 12px rgba(0, 184, 148, 0.08));
}

.category-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.8rem;
}

.category-icon {
  font-size: 1.2rem;
}

.category-header h3 {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color, white);
  margin: 0;
}

.category-commands {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.mini-command {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.7rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.85rem;
  color: var(--text-color, white);
}

.mini-command:hover {
  background: rgba(0, 184, 148, 0.08);
  transform: translateX(4px);
}

.mini-command.custom {
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.mini-command.custom:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(0, 184, 148, 0.15);
  border-top-color: var(--midori-400, #26d99f);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

.command-footer {
  border-top: 1px solid var(--glass-border, rgba(0, 184, 148, 0.08));
  padding: 0.8rem 1.2rem;
  background: rgba(0, 184, 148, 0.02);
}

.shortcuts-hint {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.6);
}

.shortcuts-hint kbd {
  margin-left: 0.3rem;
  margin-right: 0.3rem;
}

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
    transform: translateY(-20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
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

/* Scrollbar personalizado */
.results-container::-webkit-scrollbar,
.default-state::-webkit-scrollbar {
  width: 6px;
}

.results-container::-webkit-scrollbar-track,
.default-state::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 3px;
}

.results-container::-webkit-scrollbar-thumb,
.default-state::-webkit-scrollbar-thumb {
  background: rgba(0, 184, 148, 0.2);
  border-radius: 3px;
}

.results-container::-webkit-scrollbar-thumb:hover,
.default-state::-webkit-scrollbar-thumb:hover {
  background: rgba(0, 184, 148, 0.35);
}
</style>
