<template>
  <div class="settings-section">
    <LanguageSelector />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';

export default {
  name: 'SettingsLanguageSection',
  components: {
    LanguageSelector: defineAsyncComponent(() => import('../LanguageSelector.vue')),
  },
};
</script>
