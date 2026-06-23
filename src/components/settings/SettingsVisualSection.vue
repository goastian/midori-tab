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
      <Dropdown v-model="background.type" :options="backgrounds" :labels="backgroundLabels" @change="$emit('change-background')" />
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

    <div v-if="background.type == 'LocalFolder'" class="local-folder-section">
      <span class="section-label">{{ i18n.$t('visual.localFolderTitle') }}</span>
      <p class="local-folder-hint">{{ i18n.$t('visual.localFolderHint') }}</p>

      <input
        ref="folderInput"
        type="file"
        webkitdirectory
        directory
        multiple
        accept="image/*"
        class="local-folder-input"
        @change="onFilesSelected"
      />
      <input
        ref="filesInput"
        type="file"
        multiple
        accept="image/*"
        class="local-folder-input"
        @change="onFilesSelected"
      />

      <div class="local-folder-actions">
        <button type="button" class="local-folder-btn" :disabled="localLoading" @click="pickFolder">
          {{ i18n.$t('visual.chooseFolder') }}
        </button>
        <button type="button" class="local-folder-btn local-folder-btn--ghost" :disabled="localLoading" @click="pickImages">
          {{ i18n.$t('visual.chooseImages') }}
        </button>
      </div>

      <div class="local-folder-status">
        <span v-if="localLoading">{{ i18n.$t('visual.localLoading') }}</span>
        <span v-else-if="localCount > 0">{{ localStatusText }}</span>
        <span v-else>{{ i18n.$t('visual.localFolderEmpty') }}</span>
        <button
          v-if="localCount > 0 && !localLoading"
          type="button"
          class="local-folder-clear"
          @click="clearLocal"
        >
          {{ i18n.$t('visual.clearImages') }}
        </button>
      </div>
      <p v-if="localError" class="local-folder-error">{{ localError }}</p>
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
import {
  saveLocalWallpapers,
  countLocalWallpapers,
  clearLocalWallpapers,
} from '../../services/LocalWallpaperService.js';

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
  data() {
    return {
      localCount: 0,
      localLoading: false,
      localError: '',
    };
  },
  computed: {
    backgroundLabels() {
      return {
        Gradient: this.i18n.$t('visual.bgGradient'),
        Unsplash: this.i18n.$t('visual.bgUnsplash'),
        LocalFolder: this.i18n.$t('visual.bgLocalFolder'),
        Solid: this.i18n.$t('visual.bgSolid'),
        MarketplaceWallpaper: this.i18n.$t('visual.bgMarketplace'),
      };
    },
    localStatusText() {
      const template = this.i18n.$t('visual.localImagesLoaded') || '{count} images ready';
      return String(template).replace('{count}', this.localCount);
    },
  },
  mounted() {
    this.refreshLocalCount();
  },
  methods: {
    async refreshLocalCount() {
      try {
        this.localCount = await countLocalWallpapers();
      } catch (_) {
        this.localCount = 0;
      }
    },
    pickFolder() {
      this.localError = '';
      this.$refs.folderInput?.click();
    },
    pickImages() {
      this.localError = '';
      this.$refs.filesInput?.click();
    },
    async onFilesSelected(event) {
      const files = event?.target?.files;
      if (!files || !files.length) return;

      this.localLoading = true;
      this.localError = '';
      try {
        const saved = await saveLocalWallpapers(files);
        if (saved <= 0) {
          this.localError = this.i18n.$t('visual.localNoImages') || 'No valid images found.';
        } else {
          this.localCount = saved;
          window.dispatchEvent(new CustomEvent('midori:refresh-wallpaper'));
        }
      } catch (error) {
        this.localError = this.i18n.$t('visual.localSaveError') || 'Could not save images.';
        console.warn('Local wallpaper save failed', error);
      } finally {
        this.localLoading = false;
        if (event?.target) event.target.value = '';
      }
    },
    async clearLocal() {
      this.localLoading = true;
      this.localError = '';
      try {
        await clearLocalWallpapers();
        this.localCount = 0;
        window.dispatchEvent(new CustomEvent('midori:refresh-wallpaper'));
      } catch (error) {
        console.warn('Local wallpaper clear failed', error);
      } finally {
        this.localLoading = false;
      }
    },
  },
};
</script>

<style scoped>
.local-folder-section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.local-folder-hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-text-muted, rgba(196, 240, 224, 0.65));
}

.local-folder-input {
  display: none;
}

.local-folder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.local-folder-btn {
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius-sm, 6px);
  border: 1px solid var(--color-border, rgba(126, 196, 168, 0.2));
  background-color: var(--color-primary, #2ec4a0);
  color: var(--color-on-primary, #06231b);
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: opacity var(--transition-fast, 0.1s ease), border-color 0.15s ease;
}

.local-folder-btn--ghost {
  background-color: transparent;
  color: var(--color-text, #c4f0e0);
}

.local-folder-btn:disabled {
  opacity: 0.55;
  cursor: progress;
}

.local-folder-btn:not(:disabled):hover {
  opacity: 0.9;
}

.local-folder-status {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--color-text, #c4f0e0);
}

.local-folder-clear {
  background: none;
  border: none;
  color: var(--color-danger, #ff6b6b);
  font-size: 0.78rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.local-folder-error {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-danger, #ff6b6b);
}
</style>
