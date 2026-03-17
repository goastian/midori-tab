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
              :placeholder="i18n.t.commandPalette.searchPlaceholder"
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
            <p>{{ i18n.t.commandPalette.noResults }}</p>
            <small>{{ i18n.t.commandPalette.trySearch }}</small>
          </div>

          <!-- Default State -->
          <div v-else-if="!searchQuery" class="default-state">
            <!-- Comandos personalizados del usuario -->
            <div v-if="customCommands.length > 0" class="custom-commands-section">
              <div class="section-header">
                <Star class="section-icon-svg" :size="16" :stroke-width="2" />
                <h3 class="section-title">{{ i18n.t.commandPalette.yourShortcuts }}</h3>
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
            <p>{{ i18n.t.commandPalette.searching }}</p>
          </div>

          <!-- Footer -->
          <div class="command-footer">
            <div class="shortcuts-hint">
              <kbd>↑↓</kbd> {{ i18n.t.commandPalette.navigate }}
              <kbd>↵</kbd> {{ i18n.t.commandPalette.select }}
              <kbd>ESC</kbd> {{ i18n.t.commandPalette.close }}
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
import useI18nStore from '../stores/useI18nStore.js';

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
    const i18n = useI18nStore();
    const searchInput = ref(null);
    
    // Obtener comandos personalizados del store
    const customCommands = computed(() => commandsStore.customCommands);

    // Categorías con sus labels e iconos
    const categoryGroups = computed(() => [
      { name: 'productivity', label: i18n.t.customShortcuts.catProductivity, icon: '⚡' },
      { name: 'communication', label: i18n.t.customShortcuts.catCommunication, icon: '💬' },
      { name: 'development', label: i18n.t.customShortcuts.catDevelopment, icon: '💻' },
      { name: 'design', label: i18n.t.customShortcuts.catDesign, icon: '🎨' },
      { name: 'social', label: i18n.t.customShortcuts.catSocial, icon: '🌐' },
      { name: 'utilities', label: i18n.t.customShortcuts.catUtilities, icon: '🛠️' },
    ]);

    // Debounce para la búsqueda
    let searchTimeout = null;
    const handleSearch = () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        performSearch(searchQuery.value);
      }, 200);
    };

    const getCategoryLabel = (category) => {
      const key = 'cat' + category.charAt(0).toUpperCase() + category.slice(1);
      return i18n.t.customShortcuts[key] || category;
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
      i18n,
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
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  z-index: 9999;
}

.command-palette {
  width: 90%;
  max-width: 640px;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.2));
  overflow: hidden;
  animation: slideDown 0.15s ease;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}

.search-container {
  display: flex;
  align-items: center;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  gap: 0.8rem;
  background: var(--surface-sunken, #060A10);
}

.search-icon {
  color: var(--color-primary, #04A469);
  opacity: 0.7;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--color-text, white);
  font-size: 1rem;
  font-family: inherit;
}

.search-input::placeholder {
  color: var(--color-text-muted, #5A9A82);
}

.kbd {
  padding: 0.2rem 0.5rem;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 4px;
  font-size: 0.75rem;
  color: var(--color-text-secondary, #7EC4A8);
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
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  margin-bottom: 0.3rem;
}

.result-item:hover,
.result-item.selected {
  background: var(--surface-overlay, #1E2D3D);
  transform: translateX(4px);
  border-left: 2px solid var(--color-primary, #04A469);
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
  color: var(--color-text, white);
  margin-bottom: 0.2rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.result-description {
  font-size: 0.85rem;
  color: var(--color-text-muted, #5A9A82);
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
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text-secondary, #7EC4A8);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.result-category[data-category="productivity"] {
  background: var(--cat-productivity-bg);
  color: var(--cat-productivity-text);
}

.result-category[data-category="communication"] {
  background: var(--cat-communication-bg);
  color: var(--cat-communication-text);
}

.result-category[data-category="development"] {
  background: var(--cat-development-bg);
  color: var(--cat-development-text);
}

.result-category[data-category="design"] {
  background: var(--cat-design-bg);
  color: var(--cat-design-text);
}

.result-category[data-category="history"] {
  background: var(--cat-history-bg);
  color: var(--cat-history-text);
}

.result-category[data-category="bookmarks"] {
  background: var(--cat-bookmarks-bg);
  color: var(--cat-bookmarks-text);
}

.result-category[data-category="tabs"] {
  background: rgba(14, 165, 233, 0.12);
  color: #38bdf8;
}

.empty-state,
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 2rem;
  color: var(--color-text, white);
  text-align: center;
}

.empty-icon-svg {
  color: var(--color-primary, #04A469);
  margin-bottom: 1rem;
  opacity: 0.4;
}

.section-icon-svg {
  color: var(--color-primary, #04A469);
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
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
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
  color: var(--color-text);
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
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 1rem;
  transition: all var(--transition-fast, 0.1s ease);
}

.category-card:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
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
  color: var(--color-text, white);
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
  background: var(--surface-raised, #0F1520);
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  font-size: 0.85rem;
  color: var(--color-text, white);
}

.mini-command:hover {
  background: var(--surface-overlay, #1E2D3D);
  transform: translateX(4px);
}

.mini-command.custom {
  background: var(--cat-productivity-bg, rgba(59, 130, 246, 0.12));
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.mini-command.custom:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.35);
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border, rgba(126,196,168,0.1));
  border-top-color: var(--color-primary, #04A469);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 1rem;
}

.command-footer {
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: 0.8rem 1.2rem;
  background: var(--surface-sunken, #060A10);
}

.shortcuts-hint {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--color-text-muted, #5A9A82);
}

.shortcuts-hint kbd {
  margin-left: 0.3rem;
  margin-right: 0.3rem;
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Scrollbar */
.results-container::-webkit-scrollbar,
.default-state::-webkit-scrollbar {
  width: 6px;
}

.results-container::-webkit-scrollbar-track,
.default-state::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 3px;
}

.results-container::-webkit-scrollbar-thumb,
.default-state::-webkit-scrollbar-thumb {
  background: var(--color-border, rgba(126,196,168,0.1));
  border-radius: 3px;
}

.results-container::-webkit-scrollbar-thumb:hover,
.default-state::-webkit-scrollbar-thumb:hover {
  background: var(--color-border-hover, rgba(126,196,168,0.2));
}
</style>
