<template>
  <div class="language-selector">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.language.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.language.subtitle }}</p>
    </div>

    <div class="current-lang">
      <span class="current-flag">{{ i18n.currentLanguage.flag }}</span>
      <span class="current-name">{{ i18n.currentLanguage.name }}</span>
    </div>

    <div class="languages-grid">
      <button
        v-for="lang in i18n.languages"
        :key="lang.code"
        class="lang-card"
        :class="{ active: lang.code === i18n.locale }"
        @click="selectLang(lang.code)"
      >
        <span class="lang-flag">{{ lang.flag }}</span>
        <span class="lang-name">{{ lang.name }}</span>
        <span v-if="lang.code === i18n.locale" class="lang-check">✓</span>
      </button>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

export default {
  name: 'LanguageSelector',
  data() {
    return {
      i18n: useI18nStore(),
    };
  },
  methods: {
    selectLang(code) {
      this.i18n.setLocale(code);
    },
  },
};
</script>

<style scoped>
.language-selector {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.section-header { margin-bottom: 0.25rem; }

.section-title-main {
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--color-text, #C4F0E0);
  margin: 0 0 0.3rem 0;
}

.section-subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted, #5A9A82);
  margin: 0;
}

.current-lang {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
}

.current-flag { font-size: 1.5rem; }
.current-name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, #C4F0E0);
}

.languages-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.6rem;
}

.lang-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  background: var(--surface-raised, #0F1520);
  border: 2px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  color: var(--color-text, #C4F0E0);
  text-align: left;
}

.lang-card:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.lang-card.active {
  border-color: var(--color-primary, #04A469);
}

.lang-flag { font-size: 1.25rem; }

.lang-name {
  font-size: 0.85rem;
  font-weight: 500;
}

.lang-check {
  position: absolute;
  top: 0.35rem;
  right: 0.4rem;
  width: 18px;
  height: 18px;
  background: var(--color-primary, #04A469);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  font-weight: 700;
}
</style>
