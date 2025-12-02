import { defineStore } from 'pinia';

const useCommandsStore = defineStore('commandsStore', {
  state: () => ({
    // Comandos personalizados del usuario
    customCommands: [],
    
    // Historial de comandos usados
    commandHistory: [],
    
    // Comandos favoritos
    favoriteCommands: [],
    
    // Configuración
    settings: {
      maxHistoryItems: 50,
      showCategories: true,
      enableFuzzySearch: true,
      openInNewTab: true,
    },
    
    // Atajos de teclado personalizables
    shortcuts: {
      openCommandPalette: {
        key: ' ',
        ctrl: true,
        alt: true,
        shift: false,
        enabled: true,
        description: 'Abrir paleta de comandos',
      },
      openSettings: {
        key: ',',
        ctrl: true,
        alt: false,
        shift: false,
        enabled: true,
        description: 'Abrir configuración',
      },
    },
  }),

  actions: {
    // Agregar comando personalizado
    addCustomCommand(command) {
      const newCommand = {
        ...command,
        id: `custom-${Date.now()}`,
        custom: true,
      };
      this.customCommands.push(newCommand);
    },

    // Eliminar comando personalizado
    removeCustomCommand(commandId) {
      this.customCommands = this.customCommands.filter(
        cmd => cmd.id !== commandId
      );
    },

    // Actualizar comando personalizado
    updateCustomCommand(commandId, updates) {
      const index = this.customCommands.findIndex(cmd => cmd.id === commandId);
      if (index !== -1) {
        this.customCommands[index] = {
          ...this.customCommands[index],
          ...updates,
        };
      }
    },

    // Agregar al historial
    addToHistory(command) {
      // Evitar duplicados recientes
      const existingIndex = this.commandHistory.findIndex(
        item => item.id === command.id
      );
      
      if (existingIndex !== -1) {
        this.commandHistory.splice(existingIndex, 1);
      }

      // Agregar al inicio
      this.commandHistory.unshift({
        ...command,
        usedAt: Date.now(),
      });

      // Limitar tamaño del historial
      if (this.commandHistory.length > this.settings.maxHistoryItems) {
        this.commandHistory = this.commandHistory.slice(
          0,
          this.settings.maxHistoryItems
        );
      }
    },

    // Agregar a favoritos
    addToFavorites(command) {
      if (!this.favoriteCommands.find(cmd => cmd.id === command.id)) {
        this.favoriteCommands.push(command);
      }
    },

    // Quitar de favoritos
    removeFromFavorites(commandId) {
      this.favoriteCommands = this.favoriteCommands.filter(
        cmd => cmd.id !== commandId
      );
    },

    // Verificar si es favorito
    isFavorite(commandId) {
      return this.favoriteCommands.some(cmd => cmd.id === commandId);
    },

    // Obtener comandos más usados
    getMostUsedCommands(limit = 5) {
      const commandCounts = {};
      
      this.commandHistory.forEach(item => {
        commandCounts[item.id] = (commandCounts[item.id] || 0) + 1;
      });

      return Object.entries(commandCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => 
          this.commandHistory.find(cmd => cmd.id === id)
        )
        .filter(Boolean);
    },

    // Limpiar historial
    clearHistory() {
      this.commandHistory = [];
    },

    // Actualizar configuración
    updateSettings(newSettings) {
      this.settings = {
        ...this.settings,
        ...newSettings,
      };
    },

    // Actualizar atajo de teclado
    updateShortcut(shortcutName, shortcutConfig) {
      if (this.shortcuts[shortcutName]) {
        this.shortcuts[shortcutName] = {
          ...this.shortcuts[shortcutName],
          ...shortcutConfig,
        };
      }
    },

    // Resetear atajo a valores por defecto
    resetShortcut(shortcutName) {
      const defaults = {
        openCommandPalette: {
          key: ' ',
          ctrl: true,
          alt: true,
          shift: false,
          enabled: true,
          description: 'Abrir paleta de comandos',
        },
        openSettings: {
          key: ',',
          ctrl: true,
          alt: false,
          shift: false,
          enabled: true,
          description: 'Abrir configuración',
        },
      };
      
      if (defaults[shortcutName]) {
        this.shortcuts[shortcutName] = defaults[shortcutName];
      }
    },

    // Resetear todos los atajos
    resetAllShortcuts() {
      this.shortcuts = {
        openCommandPalette: {
          key: ' ',
          ctrl: true,
          alt: true,
          shift: false,
          enabled: true,
          description: 'Abrir paleta de comandos',
        },
        openSettings: {
          key: ',',
          ctrl: true,
          alt: false,
          shift: false,
          enabled: true,
          description: 'Abrir configuración',
        },
      };
    },

    // Exportar datos
    exportData() {
      return {
        customCommands: this.customCommands,
        favoriteCommands: this.favoriteCommands,
        settings: this.settings,
        exportedAt: new Date().toISOString(),
      };
    },

    // Importar datos
    importData(data) {
      if (data.customCommands) {
        this.customCommands = data.customCommands;
      }
      if (data.favoriteCommands) {
        this.favoriteCommands = data.favoriteCommands;
      }
      if (data.settings) {
        this.settings = {
          ...this.settings,
          ...data.settings,
        };
      }
    },
  },

  getters: {
    // Obtener todos los comandos (predefinidos + personalizados)
    allCustomCommands: (state) => state.customCommands,

    // Obtener comandos recientes
    recentCommands: (state) => state.commandHistory.slice(0, 10),

    // Obtener estadísticas
    stats: (state) => ({
      totalCustomCommands: state.customCommands.length,
      totalFavorites: state.favoriteCommands.length,
      totalHistoryItems: state.commandHistory.length,
    }),
  },

  persist: true,
});

export default useCommandsStore;
