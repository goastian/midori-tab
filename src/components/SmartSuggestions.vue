<template>
  <div class="smart-suggestions" v-if="suggestionsStore.enabled && suggestions.length > 0">
    <div class="suggestions-header">
      <span class="suggestions-greeting">{{ greeting }}</span>
      <span class="suggestions-label">{{ i18n.t.suggestions.label }}</span>
    </div>
    <div class="suggestions-list">
      <a
        v-for="item in suggestions"
        :key="item.url"
        :href="item.url"
        class="suggestion-card"
        @click.prevent="openSuggestion(item.url)"
      >
        <img
          :src="getFavicon(item.url)"
          class="suggestion-favicon"
          @error="$event.target.style.display='none'"
        />
        <div class="suggestion-info">
          <span class="suggestion-title">{{ item.title }}</span>
          <span class="suggestion-hint">{{ i18n.t.suggestions.hint }}</span>
        </div>
        <button class="dismiss-btn" @click.stop.prevent="dismiss(item.url)" :title="i18n.t.suggestions.dismiss">✕</button>
      </a>
    </div>
  </div>
</template>

<script>
import useSuggestionsStore from '../stores/useSuggestionsStore.js';
import useTabStore from '../stores/useTabStore.js';
import useI18nStore from '../stores/useI18nStore.js';

export default {
  name: 'SmartSuggestions',

  data() {
    return {
      suggestionsStore: useSuggestionsStore(),
      tabStore: useTabStore(),
      i18n: useI18nStore(),
    };
  },

  computed: {
    suggestions() {
      return this.suggestionsStore.currentSuggestions;
    },
    greeting() {
      return this.suggestionsStore.getTimeGreeting();
    },
  },

  methods: {
    getFavicon(url) {
      try {
        const domain = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
      } catch {
        return '';
      }
    },

    openSuggestion(url) {
      this.tabStore.openLinkTab(url);
    },

    dismiss(url) {
      this.suggestionsStore.dismissSuggestion(url);
    },
  },
};
</script>

<style scoped>
.smart-suggestions {
  width: 100%;
  padding: 0.75rem;
}

.suggestions-header {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.75rem;
  padding: 0 0.25rem;
}

.suggestions-greeting {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.suggestions-label {
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
  font-weight: 400;
}

.suggestions-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.suggestion-card {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  text-decoration: none;
  transition: all var(--transition-fast, 0.1s ease);
  cursor: pointer;
}

.suggestion-card:hover {
  background: var(--surface-overlay, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
  transform: translateX(4px);
}

.suggestion-favicon {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm, 6px);
  flex-shrink: 0;
  background: var(--surface-overlay, #1E2D3D);
}

.suggestion-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.suggestion-title {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-text, white);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.suggestion-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted, #5A9A82);
}

.dismiss-btn {
  background: none;
  border: none;
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
  transition: all var(--transition-fast, 0.1s ease);
  flex-shrink: 0;
}

.dismiss-btn:hover {
  color: var(--accent-danger, #e17055);
  background: rgba(225, 112, 85, 0.1);
}
</style>
