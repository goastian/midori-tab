<template>
  <div class="settings-section">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.general.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.general.subtitle }}</p>
    </div>

    <div class="setting-item setting-item--stacked">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.general.openSearchIn }}</span>
        <span class="setting-description">{{ i18n.t.general.openSearchInDesc }}</span>
      </div>
      <Dropdown v-model="settings.openLink" :options="openLinks" />
    </div>

    <div class="setting-item setting-item--stacked">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.general.tabName }}</span>
        <span class="setting-description">{{ i18n.t.general.tabNameDesc }}</span>
      </div>
      <Input
        :modelValue="title"
        placeholder="New Tab"
        round
        full
        @update:modelValue="$emit('update:title', $event)"
      />
    </div>

    <div class="setting-item">
      <div class="setting-info">
        <span class="setting-label">{{ i18n.t.spaces?.enable || 'Activar Spaces' }}</span>
        <span class="setting-description">{{ i18n.t.spaces?.enableDesc || 'Cambia entre espacios de trabajo personalizados' }}</span>
      </div>
      <Switch :state="spacesStore.enabled" @click="$emit('toggle-spaces')" />
    </div>
  </div>
</template>

<script>
import Switch from '../UI/Switch.vue';
import Dropdown from '../UI/Dropdown.vue';
import Input from '../UI/Input.vue';

export default {
  name: 'SettingsGeneralSection',
  components: {
    Switch,
    Dropdown,
    Input,
  },
  emits: ['update:title', 'toggle-spaces'],
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
    openLinks: {
      type: Array,
      default: () => [],
    },
    title: {
      type: String,
      default: '',
    },
  },
};
</script>
