<template>
  <div class="spaces-manager">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.spaces.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.spaces.subtitle }}</p>
    </div>

    <!-- Toggle Spaces -->
    <div class="setting-item">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.spaces.enable }}</span>
        <span class="setting-description">{{ i18n.t.spaces.enableDesc }}</span>
      </div>
      <button class="toggle-btn" :class="{ active: spacesStore.enabled }" @click="spacesStore.enabled = !spacesStore.enabled">
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </button>
    </div>

    <template v-if="spacesStore.enabled">
      <!-- Space Switcher -->
      <div class="spaces-switcher">
        <button
          v-for="space in spacesStore.spaces"
          :key="space.id"
          class="space-chip"
          :class="{ active: space.id === spacesStore.activeSpaceId }"
          :style="{ '--space-color': space.color }"
          @click="switchTo(space.id)"
        >
          <span class="space-chip-icon">{{ space.icon }}</span>
          <span class="space-chip-name">{{ space.name }}</span>
        </button>
      </div>

      <!-- Active Space Details -->
      <div class="space-details">
        <div class="detail-header">
          <span class="detail-icon">{{ activeSpace.icon }}</span>
          <div class="detail-info">
            <span class="detail-name">{{ activeSpace.name }}</span>
            <span class="detail-meta">{{ i18n.t.spaces.activeSpace }}</span>
          </div>
        </div>
      </div>

      <!-- Spaces List (Editable) -->
      <div class="spaces-list">
        <div
          v-for="space in spacesStore.spaces"
          :key="space.id"
          class="space-row"
          :class="{ active: space.id === spacesStore.activeSpaceId }"
        >
          <span class="space-row-icon" :style="{ background: space.color + '22', color: space.color }">{{ space.icon }}</span>
          <div class="space-row-info">
            <span class="space-row-name">{{ space.name }}</span>
            <span class="space-row-bg">{{ space.background?.type || 'Default' }}</span>
          </div>
          <div class="space-row-actions">
            <button class="icon-btn" :title="i18n.t.spaces.edit" @click="startEdit(space)">✏️</button>
            <button
              class="icon-btn danger"
              :title="i18n.t.spaces.delete"
              @click="removeSpace(space.id)"
              :disabled="spacesStore.spaces.length <= 1"
            >🗑️</button>
          </div>
        </div>
      </div>

      <!-- Add New Space -->
      <div v-if="!showAddForm" class="add-space-btn-wrap">
        <button class="add-space-btn" @click="showAddForm = true">
          <span>+</span> {{ i18n.t.spaces.newSpace }}
        </button>
      </div>

      <!-- Add / Edit Form -->
      <Transition name="fade">
        <div v-if="showAddForm || editingSpace" class="space-form">
          <h4 class="form-title">{{ editingSpace ? i18n.t.spaces.editSpace : i18n.t.spaces.newSpace }}</h4>
          <div class="form-row">
            <label class="form-label">{{ i18n.t.spaces.nameLabel }}</label>
            <input
              v-model="formName"
              class="form-input"
              :placeholder="i18n.t.spaces.namePlaceholder"
              maxlength="20"
            />
          </div>
          <div class="form-row">
            <label class="form-label">{{ i18n.t.spaces.iconLabel }}</label>
            <div class="icon-picker">
              <button
                v-for="ic in iconOptions"
                :key="ic"
                class="icon-option"
                :class="{ selected: formIcon === ic }"
                @click="formIcon = ic"
              >{{ ic }}</button>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">{{ i18n.t.spaces.colorLabel }}</label>
            <div class="color-picker">
              <button
                v-for="cl in colorOptions"
                :key="cl"
                class="color-option"
                :class="{ selected: formColor === cl }"
                :style="{ background: cl }"
                @click="formColor = cl"
              ></button>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn-secondary" @click="cancelForm">{{ i18n.t.spaces.cancel }}</button>
            <button class="btn-primary" @click="saveForm" :disabled="!formName.trim()">
              {{ editingSpace ? i18n.t.spaces.save : i18n.t.spaces.create }}
            </button>
          </div>
        </div>
      </Transition>
    </template>
  </div>
</template>

<script>
import useSpacesStore from '../stores/useSpacesStore.js';
import useI18nStore from '../stores/useI18nStore.js';

export default {
  name: 'SpacesManager',

  data() {
    return {
      spacesStore: useSpacesStore(),
      i18n: useI18nStore(),
      showAddForm: false,
      editingSpace: null,
      formName: '',
      formIcon: '🌐',
      formColor: '#00b894',
      iconOptions: ['🏠', '💼', '📚', '🎮', '🎵', '🏋️', '✈️', '🌐', '💡', '🎯', '🧑‍💻', '📷'],
      colorOptions: ['#00b894', '#0984e3', '#6c5ce7', '#e17055', '#fdcb6e', '#e84393', '#00cec9', '#636e72'],
    };
  },

  computed: {
    activeSpace() {
      return this.spacesStore.activeSpace;
    },
  },

  methods: {
    switchTo(id) {
      if (id !== this.spacesStore.activeSpaceId) {
        this.spacesStore.switchSpace(id);
      }
    },

    startEdit(space) {
      this.editingSpace = space;
      this.formName = space.name;
      this.formIcon = space.icon;
      this.formColor = space.color;
      this.showAddForm = false;
    },

    cancelForm() {
      this.showAddForm = false;
      this.editingSpace = null;
      this.formName = '';
      this.formIcon = '🌐';
      this.formColor = '#00b894';
    },

    saveForm() {
      if (!this.formName.trim()) return;

      if (this.editingSpace) {
        this.spacesStore.updateSpace(this.editingSpace.id, {
          name: this.formName.trim(),
          icon: this.formIcon,
          color: this.formColor,
        });
      } else {
        this.spacesStore.addSpace(this.formName.trim(), this.formIcon, this.formColor);
      }
      this.cancelForm();
    },

    removeSpace(id) {
      if (this.spacesStore.spaces.length <= 1) return;
      if (confirm('¿Eliminar este espacio?')) {
        this.spacesStore.removeSpace(id);
      }
    },
  },
};
</script>

<style scoped>
.spaces-manager {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header { margin-bottom: 0.5rem; }

.section-title-main {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--text-color, white);
  margin: 0 0 0.3rem 0;
}

.section-subtitle {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

/* Setting Item (toggle) */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.setting-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.setting-info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.setting-label { font-weight: 500; color: var(--text-color, white); font-size: 0.95rem; }
.setting-description { font-size: 0.8rem; color: rgba(255, 255, 255, 0.6); }

/* Toggle */
.toggle-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}

.toggle-track {
  display: block;
  width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 12px;
  position: relative;
  transition: background 0.2s;
}

.toggle-btn.active .toggle-track {
  background: var(--midori-500, #00b894);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s;
}

.toggle-btn.active .toggle-thumb {
  transform: translateX(20px);
}

/* Space Switcher (chips) */
.spaces-switcher {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.space-chip {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-radius: 2rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-color, white);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.85rem;
}

.space-chip:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: var(--space-color);
}

.space-chip.active {
  background: color-mix(in srgb, var(--space-color) 25%, transparent);
  border-color: var(--space-color);
  box-shadow: 0 0 12px color-mix(in srgb, var(--space-color) 30%, transparent);
}

.space-chip-icon { font-size: 1rem; }
.space-chip-name { font-weight: 500; }

/* Active Space Detail */
.space-details {
  padding: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.detail-icon { font-size: 2rem; }

.detail-info { display: flex; flex-direction: column; }
.detail-name { font-weight: 600; color: var(--text-color, white); font-size: 1.05rem; }
.detail-meta { font-size: 0.8rem; color: rgba(255, 255, 255, 0.5); }

/* Spaces list */
.spaces-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.space-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  transition: all 0.2s ease;
}

.space-row.active {
  border-color: rgba(0, 184, 148, 0.3);
  background: rgba(0, 184, 148, 0.06);
}

.space-row:hover {
  background: rgba(255, 255, 255, 0.08);
}

.space-row-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  flex-shrink: 0;
}

.space-row-info { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.space-row-name { font-weight: 500; color: var(--text-color, white); font-size: 0.9rem; }
.space-row-bg { font-size: 0.75rem; color: rgba(255, 255, 255, 0.5); }

.space-row-actions { display: flex; gap: 0.25rem; }

.icon-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s ease;
}

.icon-btn:hover { background: rgba(255, 255, 255, 0.15); }
.icon-btn.danger:hover { background: rgba(239, 68, 68, 0.25); }
.icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

/* Add space button */
.add-space-btn-wrap { display: flex; }

.add-space-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.2rem;
  background: rgba(0, 184, 148, 0.12);
  border: 1px dashed rgba(0, 184, 148, 0.4);
  border-radius: 8px;
  color: var(--midori-400, #26d99f);
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.add-space-btn:hover {
  background: rgba(0, 184, 148, 0.2);
  border-color: rgba(0, 184, 148, 0.6);
}

/* Form */
.space-form {
  padding: 1.25rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-color, white);
}

.form-row {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

.form-input {
  padding: 0.6rem 0.8rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: var(--text-color, white);
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.2s;
}

.form-input:focus {
  border-color: var(--midori-500, #00b894);
}

.form-input::placeholder { color: rgba(255, 255, 255, 0.3); }

.icon-picker, .color-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.icon-option {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  cursor: pointer;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.icon-option:hover { background: rgba(255, 255, 255, 0.12); }
.icon-option.selected {
  border-color: var(--midori-500, #00b894);
  background: rgba(0, 184, 148, 0.15);
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
}

.color-option:hover { transform: scale(1.15); }
.color-option.selected {
  border-color: white;
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.3);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.btn-secondary {
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  color: var(--text-color, white);
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.btn-secondary:hover { background: rgba(255, 255, 255, 0.14); }

.btn-primary {
  padding: 0.5rem 1rem;
  background: var(--midori-500, #00b894);
  border: none;
  border-radius: 8px;
  color: white;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s;
}

.btn-primary:hover { background: var(--midori-600, #00996b); }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

/* Transition */
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
