<template>
  <Teleport to="body">
    <Transition name="editor-fade" appear>
      <div class="editor-overlay" @click="$emit('close')">
        <form class="dial-editor" @click.stop @submit.prevent="save">
          <header>
            <div>
              <span class="editor-eyebrow">Speed Dial</span>
              <h3>{{ editorTitle }}</h3>
            </div>
            <button type="button" class="editor-close" :aria-label="i18n.$t('bookmarks.cancel')" @click="$emit('close')">
              <DashboardIcon name="close" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>

          <label v-if="mode === 'category'">
            <span>{{ i18n.$t('bookmarks.categoryName') }}</span>
            <input v-model.trim="draft.category" type="text" maxlength="40" required ref="nameInput" />
          </label>
          <template v-else>
            <label>
              <span>{{ i18n.$t('dashboard.shortcutsDialog.name') }}</span>
              <input v-model.trim="draft.title" type="text" maxlength="80" required ref="nameInput" />
            </label>
            <label>
              <span>{{ i18n.$t('dashboard.shortcutsDialog.address') }}</span>
              <input v-model.trim="draft.url" type="text" inputmode="url" maxlength="2048" placeholder="https://" required />
            </label>
          </template>

          <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
          <footer>
            <button type="button" class="editor-button editor-button--secondary" @click="$emit('close')">
              {{ i18n.$t('bookmarks.cancel') }}
            </button>
            <button type="submit" class="editor-button editor-button--primary">
              {{ i18n.$t('bookmarks.save') }}
            </button>
          </footer>
        </form>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import DashboardIcon from './icons/DashboardIcon.vue';

export default {
  components: { DashboardIcon },
  emits: ['close', 'save'],
  props: {
    mode: { type: String, required: true },
    bookmark: { type: Object, default: null },
    categories: { type: Array, required: true },
    normalizeUrl: { type: Function, required: true },
  },
  data() {
    return {
      i18n: useI18nStore(),
      error: '',
      draft: { title: this.bookmark?.title || '', url: this.bookmark?.url || 'https://', category: '' },
    };
  },
  computed: {
    editorTitle() {
      if (this.mode === 'category') return this.i18n.$t('bookmarks.addCategory');
      return this.i18n.$t(this.bookmark ? 'bookmarks.edit' : 'dashboard.shortcutsDialog.title');
    },
  },
  mounted() { this.$refs.nameInput?.focus(); },
  methods: {
    save() {
      if (this.mode === 'category') {
        const category = this.draft.category.trim();
        if (!category || this.categories.includes(category)) {
          this.error = this.i18n.$t('bookmarks.categoryExists');
          return;
        }
        this.$emit('save', category);
        return;
      }
      try {
        const parsed = this.normalizeUrl(this.draft.url.trim());
        const title = this.draft.title.trim();
        if (!title) throw new Error('missing title');
        this.$emit('save', { title, url: parsed.toString(), domain: parsed.hostname });
      } catch (_) {
        this.error = this.i18n.$t('bookmarks.invalidUrl');
      }
    },
  },
};
</script>

<style scoped>
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 12, 10, 0.42);
  backdrop-filter: blur(4px);
}

.dial-editor {
  width: min(420px, 100%);
  display: grid;
  gap: 0.82rem;
  padding: 1rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-base, #f5f8f7);
  border: 1px solid var(--color-border-hover, rgba(34, 75, 61, 0.2));
  border-radius: 15px;
  box-shadow: 0 24px 64px rgba(8, 35, 26, 0.26);
}

.dial-editor header,
.dial-editor footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.editor-eyebrow {
  display: block;
  margin-bottom: 0.1rem;
  color: var(--color-primary, #047a50);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dial-editor h3 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: -0.012em;
}

.editor-close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.dial-editor label {
  display: grid;
  gap: 0.36rem;
  color: var(--color-text-muted, #4d6c60);
  font-size: 0.72rem;
  font-weight: 650;
}

.dial-editor input {
  width: 100%;
  min-height: 40px;
  padding: 0.55rem 0.68rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.88));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.16));
  border-radius: 9px;
  font: inherit;
  font-size: 0.8rem;
}

.editor-error {
  margin: 0;
  color: var(--accent-danger, #b74534);
  font-size: 0.72rem;
}

.dial-editor footer { justify-content: flex-end; }

.editor-button {
  min-height: 36px;
  padding: 0.48rem 0.72rem;
  border-radius: 8px;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 620;
  cursor: pointer;
}

.editor-button--secondary {
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
}

.editor-button--primary {
  color: white;
  background: var(--color-primary, #047a50);
  border: 1px solid transparent;
}

button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

.editor-fade-enter-active { transition: opacity 170ms ease; }
.editor-fade-enter-from { opacity: 0; }
</style>
