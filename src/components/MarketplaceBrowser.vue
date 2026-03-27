<template>
  <section class="marketplace-browser">
    <div class="marketplace-header">
      <div>
        <h4 v-if="title" class="marketplace-title">{{ title }}</h4>
        <p class="marketplace-subtitle">{{ i18n.$t('marketplace.subtitle') }}</p>
      </div>
      <button class="marketplace-refresh" type="button" @click="reloadCatalog">↻</button>
    </div>

    <div v-if="showTabs && normalizedTypes.length > 1" class="marketplace-tabs">
      <button
        v-for="type in normalizedTypes"
        :key="type"
        class="marketplace-tab"
        :class="{ active: activeType === type }"
        type="button"
        @click="activeType = type"
      >
        {{ labelForType(type) }}
      </button>
    </div>

    <div class="marketplace-toolbar">
      <input
        v-model="search"
        class="marketplace-search"
        type="search"
        :placeholder="i18n.$t('marketplace.searchPlaceholder')"
      />
      <span class="marketplace-count">{{ items.length }}</span>
    </div>

    <div v-if="!catalogStore.isConfigured" class="marketplace-state marketplace-state--warning">
      {{ i18n.$t('marketplace.unconfigured') }}
    </div>
    <div v-else-if="status === 'loading'" class="marketplace-state">
      {{ i18n.$t('marketplace.loading') }}
    </div>
    <div v-else-if="error" class="marketplace-state marketplace-state--warning">
      {{ error }}
    </div>
    <div v-else-if="items.length" class="asset-grid">
      <article
        v-for="asset in items"
        :key="asset.slug"
        class="asset-card"
        :class="{ incompatible: !asset.isCompatible }"
      >
        <div class="asset-preview" :class="`asset-preview--${asset.type}`" :style="previewStyle(asset)">
          <template v-if="asset.type === 'theme'">
            <div class="theme-swatch" :style="themePreviewStyle(asset, 'light')"></div>
            <div class="theme-swatch" :style="themePreviewStyle(asset, 'dark')"></div>
          </template>
          <span v-else class="asset-preview-label">{{ labelForType(asset.type) }}</span>
        </div>

        <div class="asset-body">
          <div class="asset-topline">
            <span class="asset-name">{{ asset.name }}</span>
            <span v-if="installed(asset.slug)" class="asset-pill">{{ i18n.$t('marketplace.installed') }}</span>
          </div>
          <p class="asset-description">{{ asset.description || i18n.$t('marketplace.noDescription') }}</p>
          <div class="asset-meta">
            <span v-if="asset.version">v{{ asset.version }}</span>
            <span v-if="asset.author.name">{{ asset.author.name }}</span>
            <span v-if="!asset.isCompatible" class="asset-warning">{{ i18n.$t('marketplace.incompatible') }}</span>
          </div>
        </div>

        <button
          class="asset-action"
          type="button"
          :disabled="!asset.isCompatible || isActionDisabled(asset)"
          @click="handleAction(asset)"
        >
          {{ actionLabel(asset) }}
        </button>
      </article>
    </div>
    <div v-else class="marketplace-state">
      {{ i18n.$t('marketplace.empty') }}
    </div>
  </section>
</template>

<script>
import useCatalogStore from '../stores/useCatalogStore.js';
import useI18nStore from '../stores/useI18nStore.js';
import useThemeStore from '../stores/useThemeStore.js';
import useTabStore from '../stores/useTabStore.js';
import useWidgetsStore from '../stores/useWidgetsStore.js';

export default {
  name: 'MarketplaceBrowser',

  props: {
    types: {
      type: Array,
      default: () => ['theme'],
    },
    defaultType: {
      type: String,
      default: 'theme',
    },
    title: {
      type: String,
      default: '',
    },
  },

  data() {
    return {
      catalogStore: useCatalogStore(),
      themeStore: useThemeStore(),
      tabStore: useTabStore(),
      widgetsStore: useWidgetsStore(),
      i18n: useI18nStore(),
      activeType: this.defaultType,
      search: '',
      searchTimeout: null,
    };
  },

  computed: {
    normalizedTypes() {
      return this.types.length ? this.types : ['theme'];
    },

    showTabs() {
      return this.normalizedTypes.length > 1;
    },

    items() {
      return this.catalogStore.itemsForType(this.activeType);
    },

    status() {
      return this.catalogStore.statusForType(this.activeType);
    },

    error() {
      return this.catalogStore.errorForType(this.activeType);
    },
  },

  watch: {
    defaultType(nextType) {
      if (nextType) {
        this.activeType = nextType;
      }
    },

    activeType: {
      immediate: true,
      handler() {
        this.loadCatalog();
      },
    },

    search() {
      window.clearTimeout(this.searchTimeout);
      this.searchTimeout = window.setTimeout(() => {
        this.loadCatalog(true);
      }, 250);
    },
  },

  beforeUnmount() {
    window.clearTimeout(this.searchTimeout);
  },

  methods: {
    async loadCatalog(force = false) {
      await this.catalogStore.ensureCatalog(this.activeType, {
        q: this.search,
        force,
      });
    },

    reloadCatalog() {
      this.loadCatalog(true);
    },

    installed(slug) {
      return this.catalogStore.isInstalled(slug);
    },

    labelForType(type) {
      return this.i18n.$t(`marketplace.types.${type}`);
    },

    previewStyle(asset) {
      if (asset.type === 'wallpaper' && asset.previewUrl) {
        return {
          backgroundImage: `linear-gradient(180deg, rgba(7, 11, 16, 0.08), rgba(7, 11, 16, 0.4)), url(${asset.previewUrl})`,
        };
      }

      return {};
    },

    themePreviewStyle(asset, variant) {
      const modes = asset.manifest?.payload?.modes || {};
      const tokens = asset.manifest?.payload?.tokens || {};
      const vars = { ...tokens, ...(modes[variant] || {}) };
      return {
        background: vars['--color-bg'] || vars['--color-primary'] || (variant === 'dark' ? '#0f1520' : '#e8edeb'),
      };
    },

    isThemeActive(asset) {
      return this.themeStore.activeThemeId === `marketplace:${asset.slug}`;
    },

    isWallpaperActive(asset) {
      return this.tabStore.background?.assetSlug === asset.slug;
    },

    isWidgetActive(asset) {
      const record = this.catalogStore.installedRecord(asset.slug);
      if (!record?.builtinWidgetKey) return false;
      return Boolean(this.widgetsStore.enabled[record.builtinWidgetKey]);
    },

    isActionDisabled(asset) {
      if (asset.type !== 'widget') return false;
      const record = this.catalogStore.installedRecord(asset.slug);
      return Boolean(record && !record.builtinWidgetKey);
    },

    actionLabel(asset) {
      if (asset.type === 'theme') {
        if (this.isThemeActive(asset)) return this.i18n.$t('marketplace.active');
        if (this.installed(asset.slug)) return this.i18n.$t('marketplace.apply');
        return this.i18n.$t('marketplace.install');
      }

      if (asset.type === 'wallpaper') {
        if (this.isWallpaperActive(asset)) return this.i18n.$t('marketplace.active');
        if (this.installed(asset.slug)) return this.i18n.$t('marketplace.apply');
        return this.i18n.$t('marketplace.install');
      }

      if (asset.type === 'widget') {
        const record = this.catalogStore.installedRecord(asset.slug);
        if (this.isWidgetActive(asset)) return this.i18n.$t('marketplace.active');
        if (record?.builtinWidgetKey) return this.i18n.$t('marketplace.enable');
        if (this.installed(asset.slug)) return this.i18n.$t('marketplace.installed');
        return this.i18n.$t('marketplace.install');
      }

      return this.i18n.$t('marketplace.install');
    },

    async handleAction(asset) {
      if (!asset.isCompatible) return;

      if (!this.installed(asset.slug)) {
        await this.catalogStore.installAsset(asset, { apply: true });
        return;
      }

      await this.catalogStore.applyInstalledAsset(asset);
    },
  },
};
</script>

<style scoped>
.marketplace-browser {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.marketplace-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}

.marketplace-title {
  margin: 0;
  font-size: 1rem;
  color: var(--color-text, #fff);
}

.marketplace-subtitle {
  margin: 0.2rem 0 0;
  color: var(--color-text-muted, #7a9b8d);
  font-size: 0.82rem;
}

.marketplace-refresh {
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0f1520);
  color: var(--color-text-secondary, #7ec4a8);
  border-radius: 999px;
  width: 34px;
  height: 34px;
  cursor: pointer;
}

.marketplace-tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.marketplace-tab {
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0f1520);
  color: var(--color-text-secondary, #7ec4a8);
  border-radius: 999px;
  padding: 0.45rem 0.8rem;
  cursor: pointer;
}

.marketplace-tab.active {
  background: var(--color-primary-subtle, rgba(4, 164, 105, 0.1));
  color: var(--color-text, #fff);
  border-color: var(--color-primary, #04a469);
}

.marketplace-toolbar {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.marketplace-search {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0f1520);
  color: var(--color-text, #fff);
  border-radius: 10px;
  padding: 0.8rem 0.9rem;
}

.marketplace-count {
  min-width: 2rem;
  text-align: center;
  color: var(--color-text-muted, #7a9b8d);
}

.marketplace-state {
  padding: 1rem;
  border-radius: 12px;
  background: var(--surface-raised, #0f1520);
  color: var(--color-text-secondary, #7ec4a8);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
}

.marketplace-state--warning {
  color: #f6c767;
}

.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 0.85rem;
}

.asset-card {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.8rem;
  border-radius: 14px;
  background: var(--surface-raised, #0f1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
}

.asset-card.incompatible {
  opacity: 0.72;
}

.asset-preview {
  min-height: 88px;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(4, 164, 105, 0.18), rgba(15, 21, 32, 0.6));
  display: flex;
  align-items: stretch;
  justify-content: center;
  background-size: cover;
  background-position: center;
}

.asset-preview--widget {
  align-items: center;
}

.theme-swatch {
  flex: 1;
}

.asset-preview-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 1rem;
  color: rgba(255, 255, 255, 0.92);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.75rem;
}

.asset-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.asset-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}

.asset-name {
  font-weight: 600;
  color: var(--color-text, #fff);
}

.asset-pill {
  border-radius: 999px;
  padding: 0.18rem 0.5rem;
  background: var(--color-primary-subtle, rgba(4, 164, 105, 0.1));
  color: var(--color-primary, #04a469);
  font-size: 0.72rem;
}

.asset-description {
  margin: 0;
  color: var(--color-text-secondary, #7ec4a8);
  line-height: 1.45;
  font-size: 0.82rem;
}

.asset-meta {
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
  color: var(--color-text-muted, #7a9b8d);
  font-size: 0.74rem;
}

.asset-warning {
  color: #f6c767;
}

.asset-action {
  border: none;
  background: var(--color-primary, #04a469);
  color: #fff;
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
  cursor: pointer;
  font-weight: 600;
}

.asset-action:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
</style>