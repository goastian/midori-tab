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
        type="button"
        class="theme-card"
        :class="{ active: theme.id === themeStore.activeThemeId }"
        :aria-pressed="theme.id === themeStore.activeThemeId"
        @click="selectTheme(theme.id)"
      >
        <div class="theme-preview">
          <div class="preview-light" :style="{ background: theme.preview.light }"></div>
          <div class="preview-dark" :style="{ background: theme.preview.dark }"></div>
        </div>
        <div class="theme-card-info">
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

    <!-- Custom Theme Editor (only shown when custom is active) -->
    <template v-if="themeStore.activeThemeId === 'custom'">
      <div class="custom-editor">
        <h4 class="form-title">{{ i18n.t.themes.customizeTheme }}</h4>
        <div class="editor-variant-tabs">
          <button
            class="variant-tab"
            :class="{ active: editVariant === 'light' }"
            @click="editVariant = 'light'"
          >{{ copy.light }}</button>
          <button
            class="variant-tab"
            :class="{ active: editVariant === 'dark' }"
            @click="editVariant = 'dark'"
          >{{ copy.dark }}</button>
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
import { getWidgetCopy } from '../i18n/widget-copy.js';
import useThemeStore from '../stores/useThemeStore.js';
import useI18nStore from '../stores/useI18nStore.js';

export default {
  name: 'ThemePicker',

  components: {
    MarketplaceBrowser: defineAsyncComponent(() => import('./MarketplaceBrowser.vue')),
  },

  data() {
    return {
      themeStore: useThemeStore(),
      i18n: useI18nStore(),
      editVariant: 'dark',
      showMarketplace: false,
    };
  },

  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).themePicker;
    },
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
  gap: 0.55rem;
}

.theme-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.48rem;
  padding: 0.52rem;
  background: var(--surface-overlay, #f7fbf8);
  border: 1px solid var(--color-border, rgba(20,42,36,0.14));
  border-radius: 8px;
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  text-align: left;
  color: var(--color-text, white);
}

.theme-card:hover {
  background: var(--surface-control-hover, #fff);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.theme-card.active {
  border-color: var(--color-primary, #0eae5b);
  box-shadow: inset 0 0 0 1px var(--color-primary, #0eae5b);
}

.theme-preview {
  display: flex;
  border-radius: 6px;
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
  background: var(--color-primary, #0eae5b);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.65rem;
  color: white;
  font-weight: 700;
}

.setting-info { display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.setting-label { font-weight: 500; color: var(--color-text, white); font-size: 0.95rem; }
.setting-description { font-size: 0.8rem; color: var(--color-text-muted, #5A9A82); }

.marketplace-toggle-card {
  display: flex;
  gap: 0.8rem;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 0;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border, rgba(20,42,36,0.12));
}

.marketplace-toggle-btn {
  min-height: 34px;
  padding: 0.42rem 0.72rem;
  color: var(--color-text, #142a24);
  background: var(--surface-control, #fff);
  border: 1px solid var(--color-border, rgba(20,42,36,0.16));
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 600;
  white-space: nowrap;
}

.marketplace-toggle-btn:hover {
  color: var(--color-primary, #0eae5b);
  background: var(--surface-control-hover, #fff);
  border-color: var(--color-border-hover, rgba(20,42,36,0.24));
}

.theme-card:focus-visible,
.marketplace-toggle-btn:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary, #0eae5b), transparent 28%);
  outline-offset: 2px;
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
