<template>
  <div class="theme-picker">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.themes.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.themes.subtitle }}</p>
    </div>

    <!-- Theme Grid -->
    <div class="themes-grid">
      <button
        v-for="theme in themeStore.allThemes"
        :key="theme.id"
        class="theme-card"
        :class="{ active: theme.id === themeStore.activeThemeId }"
        @click="selectTheme(theme.id)"
      >
        <div class="theme-preview">
          <div class="preview-light" :style="{ background: theme.preview.light }"></div>
          <div class="preview-dark" :style="{ background: theme.preview.dark }"></div>
        </div>
        <div class="theme-card-info">
          <span class="theme-card-icon">{{ theme.icon }}</span>
          <span class="theme-card-name">{{ theme.name }}</span>
        </div>
        <span v-if="theme.id === themeStore.activeThemeId" class="theme-check">✓</span>
      </button>
    </div>

    <div class="marketplace-toggle-card">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.$t('marketplace.themeCtaTitle') }}</span>
        <span class="setting-description">{{ i18n.$t('marketplace.themeCtaDescription') }}</span>
      </div>
      <button class="marketplace-toggle-btn" type="button" @click="showMarketplace = !showMarketplace">
        {{ showMarketplace ? i18n.$t('common.close') : i18n.$t('marketplace.openThemes') }}
      </button>
    </div>

    <MarketplaceBrowser
      v-if="showMarketplace"
      :title="i18n.$t('marketplace.title')"
      :types="['theme']"
      default-type="theme"
    />

    <!-- Auto Adapt per theme -->
    <div class="setting-item">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.themes.adaptByTime }}</span>
        <span class="setting-description">{{ i18n.t.themes.adaptByTimeDesc }}</span>
      </div>
      <button class="toggle-btn" :class="{ active: tabStore.autoTheme }" @click="toggleAutoAdapt">
        <span class="toggle-track"><span class="toggle-thumb"></span></span>
      </button>
    </div>

    <!-- Active Theme Preview -->
    <div class="active-preview">
      <div class="preview-section">
        <span class="preview-label">Light</span>
        <div class="preview-swatch-row">
          <div class="swatch" :style="swatchStyle('light', '--color-bg')" title="Background"></div>
          <div class="swatch" :style="swatchStyle('light', '--color-primary')" title="Primary"></div>
          <div class="swatch" :style="swatchStyle('light', '--color-text')" title="Text"></div>
          <div class="swatch" :style="swatchStyle('light', '--theme-accent')" title="Accent"></div>
        </div>
      </div>
      <div class="preview-section">
        <span class="preview-label">Dark</span>
        <div class="preview-swatch-row">
          <div class="swatch" :style="swatchStyle('dark', '--color-bg')" title="Background"></div>
          <div class="swatch" :style="swatchStyle('dark', '--color-primary')" title="Primary"></div>
          <div class="swatch" :style="swatchStyle('dark', '--color-text')" title="Text"></div>
          <div class="swatch" :style="swatchStyle('dark', '--theme-accent')" title="Accent"></div>
        </div>
      </div>
    </div>

    <!-- Custom Theme Editor (only shown when custom is active) -->
    <template v-if="themeStore.activeThemeId === 'custom'">
      <div class="custom-editor">
        <h4 class="form-title">{{ i18n.t.themes.customizeTheme }}</h4>
        <div class="editor-variant-tabs">
          <button
            class="variant-tab"
            :class="{ active: editVariant === 'light' }"
            @click="editVariant = 'light'"
          >Light</button>
          <button
            class="variant-tab"
            :class="{ active: editVariant === 'dark' }"
            @click="editVariant = 'dark'"
          >Dark</button>
        </div>
        <div class="custom-fields">
          <div class="color-field" v-for="field in editableFields" :key="field.key">
            <label class="color-field-label">{{ field.label }}</label>
            <input
              type="color"
              :value="getCustomVar(field.key)"
              @input="setCustomVar(field.key, $event.target.value)"
              class="color-input"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useThemeStore from '../stores/useThemeStore.js';
import useTabStore from '../stores/useTabStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import { useAutoTheme } from '../composables/useAutoTheme.js';

export default {
  name: 'ThemePicker',

  components: {
    MarketplaceBrowser: defineAsyncComponent(() => import('./MarketplaceBrowser.vue')),
  },

  data() {
    return {
      themeStore: useThemeStore(),
      tabStore: useTabStore(),
      i18n: useI18nStore(),
      editVariant: 'dark',
      showMarketplace: false,
    };
  },

  computed: {
    editableFields() {
      const t = this.i18n.t.themes;
      return [
        { key: '--color-bg', label: t.fieldBg },
        { key: '--color-primary', label: t.fieldPrimary },
        { key: '--color-text', label: t.fieldText },
        { key: '--theme-accent', label: t.fieldAccent },
        { key: '--color-bg-secondary', label: t.fieldBgSecondary },
        { key: '--color-text-secondary', label: t.fieldTextSecondary },
      ];
    },
  },

  methods: {
    selectTheme(id) {
      this.themeStore.setTheme(id);
    },

    toggleAutoAdapt() {
      this.tabStore.autoTheme = !this.tabStore.autoTheme;
      if (this.tabStore.autoTheme) {
        const autoTheme = useAutoTheme();
        autoTheme.start();
      } else {
        const autoTheme = useAutoTheme();
        autoTheme.stop();
        // Re-apply current manual theme
        this.themeStore.applyTheme(this.tabStore.theme);
      }
    },

    swatchStyle(variant, key) {
      const theme = this.themeStore.activeTheme;
      const vars = theme[variant] || {};
      return { background: vars[key] || '#888' };
    },

    getCustomVar(key) {
      const vars = this.themeStore.customTheme[this.editVariant] || {};
      const val = vars[key] || '#000000';
      // Convert non-hex to a fallback
      if (val.startsWith('#')) return val;
      return '#888888';
    },

    setCustomVar(key, value) {
      this.themeStore.updateCustomTheme(this.editVariant, { [key]: value });
    },
  },
};
</script>

<style scoped>
.theme-picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header { margin-bottom: 0.25rem; }

.section-title-main {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--color-text, white);
  margin: 0 0 0.3rem 0;
}

.section-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
}

/* Themes Grid */
.themes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.75rem;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.6rem;
  background: var(--surface-raised, #0F1520);
  border: 2px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  text-align: left;
  color: var(--color-text, white);
}

.theme-card:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.theme-card.active {
  border-color: var(--color-primary, #04A469);
}

.theme-preview {
  display: flex;
  border-radius: 8px;
  overflow: hidden;
  height: 48px;
}

.preview-light, .preview-dark {
  flex: 1;
}

.theme-card-info {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.theme-card-icon { font-size: 1rem; }

.theme-card-name {
  font-size: 0.8rem;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.theme-check {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 20px;
  height: 20px;
  background: var(--color-primary, #04A469);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  color: white;
  font-weight: 700;
}

/* Setting Item */
.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  transition: all var(--transition-fast, 0.1s ease);
}

.setting-item:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.setting-info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.setting-label { font-weight: 500; color: var(--color-text, white); font-size: 0.95rem; }
.setting-description { font-size: 0.8rem; color: var(--color-text-muted, #5A9A82); }

.marketplace-toggle-card {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.95rem 1rem;
  border-radius: var(--radius-md, 10px);
  background: linear-gradient(135deg, rgba(4, 164, 105, 0.12), rgba(15, 21, 32, 0.84));
  border: 1px solid rgba(4, 164, 105, 0.18);
}

.marketplace-toggle-btn {
  border: none;
  background: var(--color-primary, #04A469);
  color: #fff;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  cursor: pointer;
  font-weight: 600;
  white-space: nowrap;
}

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
  background: var(--surface-overlay, #1E2D3D);
  border-radius: 12px;
  position: relative;
  transition: background var(--transition-fast, 0.1s ease);
}

.toggle-btn.active .toggle-track {
  background: var(--color-primary, #04A469);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: white;
  transition: transform var(--transition-fast, 0.1s ease);
}

.toggle-btn.active .toggle-thumb {
  transform: translateX(20px);
}

/* Active Preview */
.active-preview {
  display: flex;
  gap: 1rem;
  padding: 1rem;
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
}

.preview-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.preview-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted, #5A9A82);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.preview-swatch-row {
  display: flex;
  gap: 0.4rem;
}

.swatch {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 2px solid var(--color-border, rgba(126,196,168,0.1));
  transition: transform var(--transition-fast, 0.1s ease);
}

.swatch:hover {
  transform: scale(1.15);
}

/* Custom Editor */
.custom-editor {
  padding: 1.25rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.editor-variant-tabs {
  display: flex;
  gap: 0.35rem;
  background: var(--surface-sunken, #060A10);
  border-radius: var(--radius-sm, 6px);
  padding: 0.2rem;
}

.variant-tab {
  flex: 1;
  padding: 0.4rem;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
}

.variant-tab.active {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, white);
}

.custom-fields {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.color-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.6rem;
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
}

.color-field-label {
  font-size: 0.78rem;
  color: var(--color-text-secondary, #7EC4A8);
  font-weight: 500;
}

.color-input {
  width: 32px;
  height: 28px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  background: transparent;
  padding: 0;
}

.color-input::-webkit-color-swatch-wrapper { padding: 0; }
.color-input::-webkit-color-swatch {
  border: 2px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 6px;
}

@media (max-width: 720px) {
  .marketplace-toggle-card {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
