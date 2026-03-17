<template>
  <div class="shortcut-editor">
    <div class="shortcut-header">
      <h4>{{ title }}</h4>
      <button @click="resetShortcut" class="reset-btn" :title="i18n.t.shortcutsTab.resetAll">
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
        {{ i18n.t.shortcutsTab.pressCombo }}
      </div>
    </div>

    <div class="shortcut-controls">
      <label class="checkbox-label">
        <input type="checkbox" v-model="localShortcut.enabled" @change="updateShortcut" />
        <span>{{ i18n.t.shortcutsTab.enabled }}</span>
      </label>
    </div>

    <div v-if="error" class="error-message">
      {{ error }}
    </div>
  </div>
</template>

<script>
import { ref, watch } from 'vue';
import useI18nStore from '../stores/useI18nStore.js';

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
    const i18n = useI18nStore();
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
        error.value = i18n.t.shortcutsTab.needModifier;
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
      i18n,
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
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
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
  color: var(--color-text, #C4F0E0);
}

.reset-btn {
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  color: var(--color-text, #C4F0E0);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm, 6px);
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--transition-fast, 0.1s ease);
}

.reset-btn:hover {
  background: var(--color-accent-bg, rgba(4,164,105,0.08));
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
  transform: rotate(180deg);
}

.shortcut-display {
  background: var(--surface-sunken, #060A10);
  border: 2px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  padding: 1rem;
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.shortcut-display:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.shortcut-display.recording {
  background: rgba(9, 132, 227, 0.1);
  border-color: var(--accent-blue, #0984e3);
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
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  font-size: 0.9rem;
  color: var(--color-text, #C4F0E0);
  font-family: var(--font-mono, monospace);
  box-shadow: var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05));
  font-weight: 600;
}

.recording-text {
  color: var(--accent-blue, #0984e3);
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
  color: var(--color-text, #C4F0E0);
  font-size: 0.85rem;
}

.checkbox-label input[type="checkbox"] {
  width: 18px;
  height: 18px;
  cursor: pointer;
  accent-color: var(--color-primary, #04A469);
}

.error-message {
  margin-top: 0.8rem;
  padding: 0.6rem;
  background: rgba(225, 112, 85, 0.1);
  border-left: 3px solid var(--accent-danger, #e17055);
  border-radius: var(--radius-sm, 6px);
  color: var(--accent-danger, #e17055);
  font-size: 0.85rem;
}

@keyframes pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(9, 132, 227, 0.3);
  }
  50% {
    box-shadow: 0 0 0 8px rgba(9, 132, 227, 0);
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
