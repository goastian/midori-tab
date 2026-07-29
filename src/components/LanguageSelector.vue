<template>
  <div class="language-selector">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.t.language.title }}</h3>
      <p class="section-subtitle">{{ i18n.t.language.subtitle }}</p>
    </div>

    <div class="languages-grid" role="radiogroup" :aria-label="i18n.t.language.title">
      <button
        v-for="lang in i18n.languages"
        :key="lang.code"
        type="button"
        role="radio"
        class="lang-card"
        :class="{ active: lang.code === i18n.locale }"
        :aria-checked="lang.code === i18n.locale"
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

.languages-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  overflow: hidden;
  background: var(--surface-raised, #fff);
  border: 1px solid var(--color-border, rgba(20, 42, 36, 0.14));
  border-radius: var(--radius-md, 12px);
}

.lang-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 54px;
  padding: 0.72rem 0.85rem;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  border-radius: 0;
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  color: var(--color-text, #C4F0E0);
  text-align: left;
}

.lang-card:hover {
  background: color-mix(in srgb, var(--color-primary, #0eae5b) 5%, transparent);
}

.lang-card.active {
  color: var(--color-text, #142a24);
  background: color-mix(in srgb, var(--color-primary, #0eae5b) 9%, transparent);
}

.lang-card:nth-child(odd) {
  border-right: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
}

.lang-card:last-child,
.lang-card:nth-last-child(2):nth-child(odd) {
  border-bottom: 0;
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
  width: 17px;
  height: 17px;
  background: var(--color-primary, #0eae5b);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.6rem;
  color: white;
  font-weight: 700;
}

.lang-card:active {
  transform: translateY(1px);
}

.lang-card:focus-visible {
  z-index: 1;
  outline: 2px solid color-mix(in srgb, var(--color-primary, #0eae5b), transparent 28%);
  outline-offset: -2px;
}

@media (max-width: 460px) {
  .languages-grid {
    grid-template-columns: 1fr;
  }

  .lang-card,
  .lang-card:nth-child(odd),
  .lang-card:nth-last-child(-n + 2) {
    border-right: 0;
    border-bottom: 1px solid var(--color-border, rgba(20, 42, 36, 0.12));
  }

  .lang-card:last-child {
    border-bottom: 0;
  }
}
</style>
