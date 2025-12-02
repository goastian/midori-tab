<template>
  <div class="shortcut-editor">
    <div class="shortcut-header">
      <h4>{{ title }}</h4>
      <button @click="resetShortcut" class="reset-btn" title="Resetear a valor por defecto">
        ↺
      </button>
    </div>
    
    <div class="shortcut-display" :class="{ recording: isRecording }" @click="startRecording">
      <div v-if="!isRecording" class="shortcut-keys">
        <kbd v-if="localShortcut.ctrl">Ctrl</kbd>
        <kbd v-if="localShortcut.alt">Alt</kbd>
        <kbd v-if="localShortcut.shift">Shift</kbd>
        <kbd>{{ getKeyDisplay(localShortcut.key) }}</kbd>
      </div>
      <div v-else class="recording-text">
        Presiona la combinación de teclas...
      </div>
    </div>

    <div class="shortcut-controls">
      <label class="checkbox-label">
        <input type="checkbox" v-model="localShortcut.enabled" @change="updateShortcut" />
        <span>Habilitado</span>
      </label>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue';

export default {
  name: 'ShortcutEditor',
  props: {
    title: {
      type: String,
      required: true,
    },
    shortcut: {
      type: Object,
      required: true,
    },
    shortcutName: {
      type: String,
      required: true,
    },
  },
  emits: ['update', 'reset'],
  setup(props, { emit }) {
    const isRecording = ref(false);
    const error = ref('');
    const localShortcut = ref({ ...props.shortcut });

    // Sincronizar con prop cuando cambia
    watch(() => props.shortcut, (newVal) => {
      localShortcut.value = { ...newVal };
    }, { deep: true });

    const getKeyDisplay = (key) => {
      if (key === ' ') return 'Space';
      if (key === 'Escape') return 'Esc';
      return key.toUpperCase();
    };

    const startRecording = () => {
      if (!localShortcut.value.enabled) return;
      isRecording.value = true;
      error.value = '';
      
      // Agregar listener temporal
      window.addEventListener('keydown', handleKeyPress, { once: true });
      
      // Timeout para cancelar
      setTimeout(() => {
        if (isRecording.value) {
          isRecording.value = false;
          window.removeEventListener('keydown', handleKeyPress);
        }
      }, 5000);
    };

    const handleKeyPress = (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Ignorar solo modificadores
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return;
      }

      // Validar que tenga al menos un modificador
      if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
        error.value = 'Debes usar al menos una tecla modificadora (Ctrl, Alt, Shift)';
        isRecording.value = false;
        return;
      }

      // Actualizar atajo
      localShortcut.value = {
        ...localShortcut.value,
        key: e.key,
        ctrl: e.ctrlKey || e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
      };

      isRecording.value = false;
      updateShortcut();
    };

    const updateShortcut = () => {
      emit('update', props.shortcutName, localShortcut.value);
    };

    const resetShortcut = () => {
      emit('reset', props.shortcutName);
    };

    return {
      isRecording,
      error,
      localShortcut,
      getKeyDisplay,
      startRecording,
      updateShortcut,
      resetShortcut,
    };
  },
};
</script>

<style scoped>
.shortcut-editor {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.shortcut-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.8rem;
}

.shortcut-header h4 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-color, white);
}

.reset-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--text-color, white);
  width: 28px;
  height: 28px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: rotate(180deg);
}

.shortcut-display {
  background: rgba(255, 255, 255, 0.08);
  border: 2px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shortcut-display:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
}

.shortcut-display.recording {
  background: rgba(59, 130, 246, 0.2);
  border-color: #3b82f6;
  animation: pulse 1.5s ease-in-out infinite;
}

.shortcut-keys {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
  justify-content: center;
}

kbd {
  padding: 0.4rem 0.8rem;
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  font-size: 0.9rem;
  color: var(--text-color, white);
  font-family: monospace;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  font-weight: 600;
}

.recording-text {
  color: #60a5fa;
  font-weight: 500;
  font-size: 0.9rem;
  animation: blink 1s ease-in-out infinite;
}

.shortcut-controls {
  margin-top: 0.8rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  color: var(--text-color, white);
  font-size: 0.85rem;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.error-message {
  margin-top: 0.8rem;
  padding: 0.6rem;
  background: rgba(239, 68, 68, 0.2);
  border-left: 3px solid #ef4444;
  border-radius: 4px;
  color: #fca5a5;
  font-size: 0.85rem;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.4);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(59, 130, 246, 0);
  }
}

@keyframes blink {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
