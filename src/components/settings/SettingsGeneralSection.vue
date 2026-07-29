<template>
  <div class="settings-section">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.general.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.general.subtitle }}</p>
    </div>

    <div class="settings-list">
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('spaces.enable') }}</span>
          <span class="setting-description">{{ i18n.$t('spaces.enableDesc') }}</span>
        </div>
        <Switch
          :state="spacesStore.enabled"
          :label="i18n.$t('spaces.enable')"
          @click="$emit('toggle-spaces')"
        />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('general.showAds') }}</span>
          <span class="setting-description">{{ i18n.$t('general.showAdsDesc') }}</span>
        </div>
        <Switch
          :state="settings.showAds"
          :label="i18n.$t('general.showAds')"
          @click="$emit('toggle-ads')"
        />
      </div>
    </div>
  </div>
</template>

<script>
import Switch from '../UI/Switch.vue';

export default {
  name: 'SettingsGeneralSection',
  components: { Switch },
  emits: ['toggle-spaces', 'toggle-ads'],
  props: {
    i18n: {
      type: Object,
      required: true,
    },
    settings: {
      type: Object,
      required: true,
    },
    spacesStore: {
      type: Object,
      required: true,
    },
  },
};
</script>

<style scoped>
.settings-list {
  overflow: hidden;
  background: var(--surface-raised, #fff);
  border: 1px solid var(--color-border, rgba(20, 42, 36, 0.14));
  border-radius: var(--radius-md, 12px);
}

.settings-list :deep(.setting-item) {
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
}

.settings-list :deep(.setting-item:last-child) {
  border-bottom: 0;
}
</style>
