<template>
    <Teleport to="body">
      <Transition name="update-toast">
        <aside
            v-if="visible"
          class="update-toast"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <div class="update-toast__badge">Midori</div>
          <h3 class="update-toast__title">{{ updateTitle }}</h3>
          <p class="update-toast__message">{{ updateMessage }}</p>
          <div class="update-toast__actions">
            <button type="button" class="update-toast__button update-toast__button--primary" @click="handleDownloadUpdate">
              {{ i18n.$t('updateNotice.download') }}
            </button>
            <button type="button" class="update-toast__button update-toast__button--secondary" @click="$emit('defer')">
              {{ i18n.$t('updateNotice.defer') }}
            </button>
          </div>
        </aside>
      </Transition>
    </Teleport>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

const MIDORI_DOWNLOAD_URL = 'https://astian.org/midori-browser/download';

export default {
  props: { visible: Boolean, version: String },
  emits: ['defer'],
  data() { return { i18n: useI18nStore() }; },
  computed: {
    updateTitle() {
        return this.i18n.$t('updateNotice.title');
      },
    updateMessage() {
        const template = this.i18n.$t('updateNotice.message');
        return String(template).replace('{version}', this.version || '');
      }
  },
  methods: {
    async handleDownloadUpdate() {
        try {
          const extensionApi = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
          if (extensionApi?.tabs?.create) {
            await extensionApi.tabs.create({ url: MIDORI_DOWNLOAD_URL });
          } else {
            window.open(MIDORI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
          }
        } catch (error) {
          window.open(MIDORI_DOWNLOAD_URL, '_blank', 'noopener,noreferrer');
        } finally {
          this.$emit('defer');
        }
      }
  },
};
</script>

<style scoped>
.update-toast {
  position: fixed;
  top: 1rem;
  right: 1rem;
  width: min(92vw, 360px);
  z-index: 50;
  background: var(--surface-island, rgba(0, 61, 47, 0.94));
  border: 1px solid var(--color-border-strong, rgba(126, 196, 168, 0.45));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: var(--shadow-floating, 0 8px 24px rgba(0, 0, 0, 0.18));
  padding: 0.9rem 0.95rem;
  color: #e6fff7;
}

.update-toast__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0.2rem 0.6rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
  background: rgba(0, 184, 148, 0.18);
  border: 1px solid rgba(0, 184, 148, 0.35);
  margin-bottom: 0.55rem;
}

.update-toast__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 650;
}

.update-toast__message {
  margin: 0.5rem 0 0;
  font-size: 0.84rem;
  line-height: 1.35;
  color: rgba(230, 255, 247, 0.92);
}

.update-toast__actions {
  margin-top: 0.8rem;
  display: flex;
  gap: 0.55rem;
}

.update-toast__button {
  flex: 1;
  border-radius: var(--nova-control-radius, 8px);
  border: 1px solid transparent;
  padding: 0.5rem 0.65rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background-color 0.16s ease;
}

.update-toast__button:hover {
  transform: translateY(-1px);
}

.update-toast__button:focus-visible {
  outline: 2px solid var(--midori-300);
  outline-offset: 2px;
}

.update-toast__button--primary {
  background: #00b894;
  border-color: rgba(255, 255, 255, 0.15);
  color: #08261f;
}

.update-toast__button--secondary {
  background: rgba(2, 20, 15, 0.45);
  border-color: rgba(126, 196, 168, 0.45);
  color: #dafbf0;
}

.update-toast-enter-active,
.update-toast-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.update-toast-enter-from,
.update-toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

@media (max-width: 600px) {
  .update-toast {
    top: auto;
    bottom: 0.8rem;
    left: 0.8rem;
    right: 0.8rem;
    width: auto;
  }
}

</style>
