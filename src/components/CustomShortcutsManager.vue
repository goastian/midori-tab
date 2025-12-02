<template>
  <div class="custom-shortcuts-manager">
    <div class="header">
      <h3 class="title">🔗 Atajos Personalizados</h3>
      <p class="description">
        Crea atajos rápidos para tus sitios web y aplicaciones favoritas.
      </p>
    </div>

    <!-- Botón para añadir nuevo atajo -->
    <button @click="showAddForm = !showAddForm" class="add-btn">
      <span class="icon">{{ showAddForm ? '✕' : '＋' }}</span>
      {{ showAddForm ? 'Cancelar' : 'Añadir Atajo Personalizado' }}
    </button>

    <!-- Formulario para añadir atajo -->
    <transition name="slide-fade">
      <div v-if="showAddForm" class="add-form">
        <div class="form-group">
          <label>
            <span class="label-icon">📝</span>
            Nombre del Atajo
          </label>
          <input
            v-model="newCommand.name"
            type="text"
            placeholder="Ej: Mi Dashboard"
            class="form-input"
            @keydown.enter="addCustomCommand"
          />
        </div>

        <div class="form-group">
          <label>
            <span class="label-icon">🔗</span>
            URL
          </label>
          <input
            v-model="newCommand.url"
            type="url"
            placeholder="https://ejemplo.com"
            class="form-input"
            @keydown.enter="addCustomCommand"
          />
        </div>

        <div class="form-group">
          <label>
            <span class="label-icon">📄</span>
            Descripción (opcional)
          </label>
          <input
            v-model="newCommand.description"
            type="text"
            placeholder="Descripción breve"
            class="form-input"
            @keydown.enter="addCustomCommand"
          />
        </div>

        <div class="form-row">
          <div class="form-group emoji-form-group">
            <label>
              <span class="label-icon">😀</span>
              Emoji/Icono
            </label>
            <div class="icon-selector-wrapper">
              <input
                v-model="newCommand.icon"
                type="text"
                placeholder="🚀"
                class="form-input icon-input"
                maxlength="2"
                readonly
              />
              <button 
                type="button"
                @click="showEmojiPicker = !showEmojiPicker" 
                class="emoji-picker-btn"
                title="Seleccionar emoji"
              >
                {{ showEmojiPicker ? '✕' : '😀' }}
              </button>
              
              <!-- Emoji Picker Simple -->
              <transition name="slide-fade">
                <div v-if="showEmojiPicker" class="emoji-picker-simple">
                  <button
                    v-for="emoji in popularEmojis"
                    :key="emoji"
                    @click="selectEmoji(emoji)"
                    class="emoji-btn-simple"
                    type="button"
                    :title="emoji"
                  >
                    {{ emoji }}
                  </button>
                </div>
              </transition>
            </div>
          </div>

          <div class="form-group">
            <label>
              <span class="label-icon">🏷️</span>
              Categoría
            </label>
            <select v-model="newCommand.category" class="form-select">
              <option value="custom">Personalizado</option>
              <option value="productivity">Productividad</option>
              <option value="communication">Comunicación</option>
              <option value="development">Desarrollo</option>
              <option value="design">Diseño</option>
              <option value="social">Social</option>
              <option value="utilities">Utilidades</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>
            <span class="label-icon">🔍</span>
            Palabras Clave (separadas por comas)
          </label>
          <input
            v-model="keywordsInput"
            type="text"
            placeholder="dashboard, trabajo, proyecto"
            class="form-input"
            @keydown.enter="addCustomCommand"
          />
          <small class="hint">Ayuda a encontrar el atajo más rápido en la búsqueda</small>
        </div>

        <div class="form-actions">
          <button @click="addCustomCommand" class="save-btn" :disabled="!isFormValid">
            <span class="icon">✓</span>
            Guardar Atajo
          </button>
          <button @click="resetForm" class="cancel-btn">
            Cancelar
          </button>
        </div>

        <!-- Preview -->
        <div v-if="newCommand.name && newCommand.url" class="preview">
          <p class="preview-label">Vista Previa:</p>
          <div class="preview-item">
            <span class="preview-icon">{{ newCommand.icon || '🔗' }}</span>
            <div class="preview-content">
              <div class="preview-name">{{ newCommand.name }}</div>
              <div class="preview-description">{{ newCommand.description || newCommand.url }}</div>
            </div>
            <span class="preview-category" :data-category="newCommand.category">
              {{ getCategoryLabel(newCommand.category) }}
            </span>
          </div>
        </div>
      </div>
    </transition>

    <!-- Lista de atajos personalizados -->
    <div v-if="customCommands.length > 0" class="shortcuts-list">
      <h4 class="list-title">Tus Atajos ({{ customCommands.length }})</h4>
      
      <div class="shortcuts-grid">
        <div
          v-for="command in customCommands"
          :key="command.id"
          class="shortcut-card"
        >
          <div class="card-header">
            <span class="card-icon">{{ command.icon || '🔗' }}</span>
            <div class="card-info">
              <h5 class="card-name">{{ command.name }}</h5>
              <p class="card-url">{{ command.url }}</p>
            </div>
          </div>
          
          <div class="card-body">
            <p v-if="command.description" class="card-description">
              {{ command.description }}
            </p>
            <div class="card-meta">
              <span class="card-category" :data-category="command.category">
                {{ getCategoryLabel(command.category) }}
              </span>
              <span v-if="command.keywords && command.keywords.length > 0" class="card-keywords">
                🔍 {{ command.keywords.slice(0, 3).join(', ') }}
              </span>
            </div>
          </div>

          <div class="card-actions">
            <button @click="editCommand(command)" class="edit-btn" title="Editar">
              ✏️
            </button>
            <button @click="deleteCommand(command.id)" class="delete-btn" title="Eliminar">
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Estado vacío -->
    <div v-else class="empty-state">
      <span class="empty-icon">📦</span>
      <p class="empty-text">No tienes atajos personalizados aún</p>
      <small class="empty-hint">Haz clic en "Añadir Atajo Personalizado" para crear uno</small>
    </div>

    <!-- Información adicional -->
    <div class="info-box">
      <p class="info-text">
        💡 <strong>Consejo:</strong> Los atajos personalizados aparecerán en la paleta de comandos (Ctrl+Alt+Space) y podrás buscarlos por nombre o palabras clave.
      </p>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue';
import useCommandsStore from '../stores/useCommandsStore.js';

export default {
  name: 'CustomShortcutsManager',
  setup() {
    const commandsStore = useCommandsStore();
    const showAddForm = ref(false);
    const keywordsInput = ref('');
    const editingId = ref(null);
    const showEmojiPicker = ref(false);

    const newCommand = ref({
      name: '',
      url: '',
      description: '',
      icon: '🔗',
      category: 'custom',
      keywords: [],
    });

    const customCommands = computed(() => commandsStore.customCommands);

    // 10 emojis más populares y útiles
    const popularEmojis = [
      '🔗', '🚀', '💼', '📊', '💻', 
      '📱', '⭐', '🎯', '📝', '🌐'
    ];

    const selectEmoji = (emoji) => {
      newCommand.value.icon = emoji;
      showEmojiPicker.value = false;
    };

    const isFormValid = computed(() => {
      return newCommand.value.name.trim() !== '' && 
             newCommand.value.url.trim() !== '' &&
             isValidUrl(newCommand.value.url);
    });

    const isValidUrl = (url) => {
      try {
        new URL(url);
        return true;
      } catch {
        return false;
      }
    };

    const getCategoryLabel = (category) => {
      const labels = {
        custom: 'Personalizado',
        productivity: 'Productividad',
        communication: 'Comunicación',
        development: 'Desarrollo',
        design: 'Diseño',
        social: 'Social',
        utilities: 'Utilidades',
      };
      return labels[category] || category;
    };

    const addCustomCommand = () => {
      if (!isFormValid.value) return;

      // Procesar keywords
      const keywords = keywordsInput.value
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      const commandData = {
        ...newCommand.value,
        keywords,
      };

      if (editingId.value) {
        // Actualizar comando existente
        commandsStore.updateCustomCommand(editingId.value, commandData);
        editingId.value = null;
      } else {
        // Agregar nuevo comando
        commandsStore.addCustomCommand(commandData);
      }

      resetForm();
    };

    const editCommand = (command) => {
      newCommand.value = {
        name: command.name,
        url: command.url,
        description: command.description || '',
        icon: command.icon || '🔗',
        category: command.category || 'custom',
        keywords: command.keywords || [],
      };
      keywordsInput.value = (command.keywords || []).join(', ');
      editingId.value = command.id;
      showAddForm.value = true;
    };

    const deleteCommand = (commandId) => {
      if (confirm('¿Estás seguro de que quieres eliminar este atajo?')) {
        commandsStore.removeCustomCommand(commandId);
      }
    };

    const resetForm = () => {
      newCommand.value = {
        name: '',
        url: '',
        description: '',
        icon: '🔗',
        category: 'custom',
        keywords: [],
      };
      keywordsInput.value = '';
      showAddForm.value = false;
      editingId.value = null;
      showEmojiPicker.value = false;
    };

    return {
      showAddForm,
      newCommand,
      keywordsInput,
      customCommands,
      isFormValid,
      showEmojiPicker,
      popularEmojis,
      selectEmoji,
      addCustomCommand,
      editCommand,
      deleteCommand,
      resetForm,
      getCategoryLabel,
    };
  },
};
</script>

<style scoped>
.custom-shortcuts-manager {
  padding: 0 0.8rem;
}

.header {
  margin-bottom: 1.5rem;
}

.title {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.description {
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
}

.add-btn {
  width: 100%;
  padding: 0.8rem 1rem;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #60a5fa;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.add-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.6);
  transform: translateY(-2px);
}

.icon {
  font-size: 1.1rem;
}

.add-form {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 0.5rem;
}

.label-icon {
  font-size: 1rem;
}

.form-input,
.form-select {
  width: 100%;
  padding: 0.7rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: var(--text-color);
  font-size: 0.9rem;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: rgba(59, 130, 246, 0.6);
  background: rgba(255, 255, 255, 0.15);
}

.icon-input {
  text-align: center;
  font-size: 1.2rem;
  padding-right: 3rem;
}

.emoji-form-group {
  position: relative;
}

.icon-selector-wrapper {
  position: relative;
  width: 100%;
}

.emoji-picker-btn {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
  width: 2.5rem;
  height: 2.5rem;
  background: rgba(59, 130, 246, 0.2);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;
}

.emoji-picker-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
  transform: scale(1.05);
}

.emoji-picker-simple {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  right: 0;
  background: rgba(20, 20, 20, 0.98);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 10px;
  padding: 1rem;
  z-index: 1000;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.6rem;
}

.emoji-btn-simple {
  width: 100%;
  min-height: 3rem;
  aspect-ratio: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  cursor: pointer;
  font-size: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.emoji-btn-simple:hover {
  background: rgba(59, 130, 246, 0.4);
  border-color: rgba(59, 130, 246, 0.6);
  transform: scale(1.15);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
}

.emoji-btn-simple:active {
  transform: scale(1.05);
}

.hint {
  display: block;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 0.3rem;
}

.form-actions {
  display: flex;
  gap: 0.8rem;
  margin-top: 1.5rem;
}

.save-btn,
.cancel-btn {
  flex: 1;
  padding: 0.8rem 1rem;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.save-btn {
  background: rgba(34, 197, 94, 0.2);
  border: 1px solid rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.save-btn:hover:not(:disabled) {
  background: rgba(34, 197, 94, 0.3);
  border-color: rgba(34, 197, 94, 0.6);
  transform: translateY(-2px);
}

.save-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.7);
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.preview {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.preview-label {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.8rem;
}

.preview-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
}

.preview-icon {
  font-size: 1.5rem;
}

.preview-content {
  flex: 1;
  min-width: 0;
}

.preview-name {
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 0.2rem;
}

.preview-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-category {
  font-size: 0.7rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.shortcuts-list {
  margin-top: 2rem;
}

.list-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 1rem;
}

.shortcuts-grid {
  display: grid;
  gap: 1rem;
}

.shortcut-card {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  transition: all 0.2s ease;
  position: relative;
}

.shortcut-card:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.8rem;
}

.card-icon {
  font-size: 1.8rem;
}

.card-info {
  flex: 1;
  min-width: 0;
}

.card-name {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 0.2rem;
}

.card-url {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}

.card-body {
  margin-bottom: 0.8rem;
}

.card-description {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 0.8rem;
  line-height: 1.4;
}

.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.card-category {
  font-size: 0.7rem;
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: var(--text-color);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.card-category[data-category="custom"] {
  background: rgba(156, 163, 175, 0.3);
}

.card-category[data-category="productivity"] {
  background: rgba(59, 130, 246, 0.3);
}

.card-category[data-category="communication"] {
  background: rgba(16, 185, 129, 0.3);
}

.card-category[data-category="development"] {
  background: rgba(139, 92, 246, 0.3);
}

.card-category[data-category="design"] {
  background: rgba(236, 72, 153, 0.3);
}

.card-category[data-category="social"] {
  background: rgba(251, 146, 60, 0.3);
}

.card-category[data-category="utilities"] {
  background: rgba(234, 179, 8, 0.3);
}

.card-keywords {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.5);
}

.card-actions {
  display: flex;
  gap: 0.5rem;
  position: absolute;
  top: 1rem;
  right: 1rem;
}

.edit-btn,
.delete-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
}

.edit-btn {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.3);
}

.edit-btn:hover {
  background: rgba(59, 130, 246, 0.3);
  border-color: rgba(59, 130, 246, 0.5);
  transform: scale(1.1);
}

.delete-btn {
  background: rgba(239, 68, 68, 0.2);
  border-color: rgba(239, 68, 68, 0.3);
}

.delete-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: rgba(239, 68, 68, 0.5);
  transform: scale(1.1);
}

.empty-state {
  text-align: center;
  padding: 3rem 2rem;
  color: var(--text-color);
}

.empty-icon {
  font-size: 3rem;
  display: block;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-text {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  opacity: 0.8;
}

.empty-hint {
  font-size: 0.85rem;
  opacity: 0.6;
}

.info-box {
  background: rgba(59, 130, 246, 0.1);
  border-left: 3px solid #3b82f6;
  border-radius: 8px;
  padding: 1rem;
  margin-top: 1.5rem;
}

.info-text {
  color: var(--text-color);
  font-size: 0.85rem;
  margin: 0;
  line-height: 1.5;
}

.info-text strong {
  font-weight: 600;
}

/* Animaciones */
.slide-fade-enter-active {
  transition: all 0.3s ease;
}

.slide-fade-leave-active {
  transition: all 0.2s ease;
}

.slide-fade-enter-from {
  transform: translateY(-10px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateY(-10px);
  opacity: 0;
}
</style>
