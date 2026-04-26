<template>
  <div class="settings-section">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.visual.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.visual.subtitle }}</p>
    </div>

    <div class="setting-item setting-item--stacked">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.visual.background }}</span>
        <span class="setting-description">{{ i18n.t.visual.backgroundDesc }}</span>
      </div>
      <Dropdown v-model="background.type" :options="backgrounds" @change="$emit('change-background')" />
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.visual.darkMode }}</span>
        <span class="setting-description">{{ i18n.t.visual.darkModeDesc }}</span>
      </div>
      <Switch :state="settings.theme == 'dark'" @click="settings.setTheme()" />
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.visual.autoTheme }}</span>
        <span class="setting-description">{{ i18n.t.visual.autoThemeDesc }}</span>
      </div>
      <Switch :state="settings.autoTheme" @click="$emit('toggle-auto-theme')" />
    </div>

    <div v-if="background.type == 'Gradient'" class="gradients-section">
      <span class="section-label">{{ i18n.t.visual.availableGradients }}</span>
      <div class="gradients-grid">
        <div
          v-for="(item, index) in gradients"
          :key="index"
          class="gradient-card"
          :class="[item, { active: background.class == item }]"
          @click="$emit('change-background', item)"
        >
          <span v-if="background.class == item" class="check-icon">✓</span>
        </div>
      </div>
    </div>

    <div class="separator"></div>

    <div class="marketplace-shortcut">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.$t('marketplace.wallpaperCtaTitle') }}</span>
        <span class="setting-description">{{ i18n.$t('marketplace.wallpaperCtaDescription') }}</span>
      </div>
      <button class="marketplace-shortcut-btn" type="button" @click="$emit('open-marketplace', 'wallpaper')">
        {{ i18n.$t('marketplace.openAssets') }}
      </button>
    </div>

    <ThemePicker />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import Switch from '../UI/Switch.vue';
import Dropdown from '../UI/Dropdown.vue';

export default {
  name: 'SettingsVisualSection',
  components: {
    Switch,
    Dropdown,
    ThemePicker: defineAsyncComponent(() => import('../ThemePicker.vue')),
  },
  emits: ['change-background', 'toggle-auto-theme', 'open-marketplace'],
  props: {
    i18n: {
      type: Object,
      required: true,
    },
    settings: {
      type: Object,
      required: true,
    },
    background: {
      type: Object,
      required: true,
    },
    backgrounds: {
      type: Array,
      default: () => [],
    },
    gradients: {
      type: Array,
      default: () => [],
    },
  },
};
</script>
