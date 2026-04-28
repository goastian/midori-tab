<template>
  <Teleport to="body">
    <Transition name="omni-anim">
      <div
        v-if="omniStore.isOpen"
        class="omni-backdrop"
        @click.self="omniStore.close()"
        @keydown.esc.capture="omniStore.close()"
      >
        <div
          ref="dialogRef"
          class="omni-dialog"
          role="dialog"
          aria-modal="true"
          :aria-label="i18n.$t('omni.label')"
        >
          <!-- ── Search row ── -->
          <div class="omni-search-row">
            <span class="omni-search-icon" aria-hidden="true">🔍</span>
            <input
              ref="inputRef"
              v-model="query"
              class="omni-input"
              type="text"
              :placeholder="i18n.$t('omni.placeholder')"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              :aria-activedescendant="activeDescendantId"
              aria-controls="omni-listbox"
              @keydown="onKeydown"
            />
          </div>

          <!-- ── Results list ── -->
          <ul
            id="omni-listbox"
            ref="listRef"
            class="omni-list"
            role="listbox"
            :aria-label="i18n.$t('omni.resultsLabel')"
          >
            <OmniResultItem
              v-for="(item, idx) in visibleResults"
              :key="itemKey(item, idx)"
              :id="`omni-option-${idx}`"
              :item="item"
              :index="idx"
              :selected="idx === omniStore.selectedIndex"
              @select="executeItem"
              @hover="omniStore.selectedIndex = $event"
            />
            <li
              v-if="showEmpty"
              class="omni-empty"
              role="status"
              aria-live="polite"
            >
              {{ i18n.$t('omni.noResults') }}
            </li>
          </ul>

          <!-- ── Footer ── -->
          <div class="omni-footer" aria-hidden="true">
            <span
              id="omni-count"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              class="omni-count"
            >
              {{ visibleResults.length }} {{ i18n.$t('omni.results') }}
            </span>
            <span class="omni-hint">
              <kbd>↑</kbd><kbd>↓</kbd> {{ i18n.$t('omni.navigate') }}
              · <kbd>↵</kbd> {{ i18n.$t('omni.select') }}
              · <kbd>{{ openInNewTabHint }}</kbd> {{ i18n.$t('omni.openInNewTab') }}
              · <kbd>Esc</kbd> {{ i18n.$t('omni.dismiss') }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { useOmniStore } from '../../stores/useOmniStore.js';
import useI18nStore from '../../stores/useI18nStore.js';
import { useOmniSearch } from '../composables/useOmniSearch.js';
import OmniResultItem from './OmniResultItem.vue';

export default {
  name: 'OmniLauncher',
  components: { OmniResultItem },

  setup() {
    const omniStore = useOmniStore();
    const i18n = useI18nStore();
    const { search } = useOmniSearch();

    const inputRef = ref(null);
    const dialogRef = ref(null);
    const listRef = ref(null);
    const query = ref('');
    const maxVisible = ref(100);
    const openInNewTabHint = ref('Ctrl+↵');

    // ── Derived ────────────────────────────────────────────────────────────
    const visibleResults = computed(() => omniStore.results.slice(0, maxVisible.value));
    const showEmpty = computed(() => !visibleResults.value.length && query.value.trim().length > 0);
    const activeDescendantId = computed(() =>
      omniStore.results.length ? `omni-option-${omniStore.selectedIndex}` : undefined
    );

    function itemKey(item, idx) {
      return `${item.type}-${item.id ?? item.action ?? item.title}-${idx}`;
    }

    // ── Sync store query ───────────────────────────────────────────────────
    watch(query, (val) => {
      omniStore.query = val;
      search(val);
    });

    // ── Focus & reset on open ──────────────────────────────────────────────
    watch(() => omniStore.isOpen, async (open) => {
      if (!open) return;
      query.value = '';
      omniStore.setResults([]);
      search('', { immediate: true });
      await nextTick();
      inputRef.value?.focus();
    });

    // ── Scroll selected item into view ────────────────────────────────────
    let scrollRaf = null;
    watch(() => omniStore.selectedIndex, (idx) => {
      cancelAnimationFrame(scrollRaf);
      scrollRaf = requestAnimationFrame(() => {
        document.getElementById(`omni-option-${idx}`)
          ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    });

    // ── Keyboard handler ──────────────────────────────────────────────────
    function onKeydown(e) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          omniStore.moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          omniStore.moveSelection(-1);
          break;
        case 'Escape':
          e.preventDefault();
          omniStore.close();
          break;
        case 'Enter':
          e.preventDefault();
          executeItem(omniStore.results[omniStore.selectedIndex], e.ctrlKey || e.metaKey);
          break;
        case 'Tab':
          // Trap focus within dialog
          e.preventDefault();
          break;
      }
    }

    // ── Execute selected result ────────────────────────────────────────────
    function executeItem(item, newTab = false) {
      if (!item) return;

      const q = query.value;
      const qLower = q.toLowerCase();
      const isRemoveMode = qLower.startsWith('/remove');

      omniStore.close();

      chrome.runtime.sendMessage(
        {
          request: 'execute-omni-item',
          item,
          query: q,
          newTab,
          removeMode: isRemoveMode,
        },
        (response) => {
          if (chrome.runtime.lastError) return;

          switch (response?.localAction) {
            case 'print':
              window.print();
              break;
            case 'fullscreen':
              document.documentElement.requestFullscreen?.();
              break;
            case 'scroll-top':
              window.scrollTo(0, 0);
              break;
            case 'scroll-bottom':
              window.scrollTo(0, document.body.scrollHeight);
              break;
            default:
              break;
          }
        }
      );
    }

    // ── Global keyboard shortcut for new-tab context ───────────────────────
    // (Ctrl+K on the new tab page, before the background sends a message)
    function onGlobalKeydown(e) {
      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        omniStore.toggle();
      }
    }

    // ── Background message listener (for messages from the service worker) ─
    function onRuntimeMessage(message) {
      if (message?.request === 'open-omni') {
        omniStore.toggle();
      }
    }

    onMounted(() => {
      window.addEventListener('keydown', onGlobalKeydown);

      try {
        chrome.runtime.sendMessage({ request: 'get-omni-config' }, (config) => {
          if (chrome.runtime.lastError || !config) return;
          if (Number.isFinite(config.maxResults) && config.maxResults > 0) {
            maxVisible.value = config.maxResults;
          }
          if (config.hints?.openInNewTab) {
            openInNewTabHint.value = config.hints.openInNewTab;
          }
        });
      } catch (_) { /* noop */ }

      try {
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
      } catch (_) { /* not in extension context */ }
    });

    onUnmounted(() => {
      window.removeEventListener('keydown', onGlobalKeydown);
      cancelAnimationFrame(scrollRaf);
      try {
        chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      } catch (_) { /* noop */ }
    });

    return {
      omniStore,
      i18n,
      inputRef,
      dialogRef,
      listRef,
      query,
      visibleResults,
      showEmpty,
      activeDescendantId,
      itemKey,
      onKeydown,
      executeItem,
      openInNewTabHint,
    };
  },
};
</script>

<style scoped>
/* ── Backdrop ─────────────────────────────────────────────────────────────── */
.omni-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: var(--omni-z, 9000);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}

/* ── Dialog ───────────────────────────────────────────────────────────────── */
.omni-dialog {
  width: min(700px, 96vw);
  max-height: 560px;
  background: var(--color-bg-elevated, #1e2128);
  border: 1px solid var(--color-border, #35373e);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.4);
  font-family: inherit;
}

/* ── Search row ───────────────────────────────────────────────────────────── */
.omni-search-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 1rem;
  border-bottom: 1px solid var(--color-border, #35373e);
  flex-shrink: 0;
}

.omni-search-icon {
  font-size: 1.1rem;
  flex-shrink: 0;
}

.omni-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  height: 3.25rem;
  font-size: 1.1rem;
  font-weight: 400;
  color: var(--color-text, #f1f1f1);
  caret-color: var(--color-primary, #6068d2);
  font-family: inherit;
}

.omni-input:focus-visible {
  outline: none;
  box-shadow: none;
}

.omni-input::placeholder {
  color: var(--color-text-muted, #63687b);
}

/* ── Results list ─────────────────────────────────────────────────────────── */
.omni-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.25rem 0;
  margin: 0;
  max-height: 420px;
  scrollbar-width: thin;
  scrollbar-color: rgba(127, 127, 127, 0.4) transparent;
}

.omni-list::-webkit-scrollbar {
  width: 6px;
}
.omni-list::-webkit-scrollbar-thumb {
  background: rgba(127, 127, 127, 0.4);
  border-radius: 3px;
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
.omni-empty {
  padding: 1rem 1.25rem;
  font-size: 0.875rem;
  color: var(--color-text-muted, #a5a5ae);
  text-align: center;
  list-style: none;
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.omni-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.45rem 1rem;
  border-top: 1px solid var(--color-border, #35373e);
  flex-shrink: 0;
}

.omni-count {
  font-size: 0.75rem;
  color: var(--color-text-muted, #a5a5ae);
}

.omni-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted, #a5a5ae);
}

.omni-hint kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.2rem;
  height: 1.2rem;
  padding: 0 0.25rem;
  font-size: 0.68rem;
  font-family: inherit;
  background: var(--color-bg, #1e2128);
  color: var(--color-text-secondary, #c5c6ca);
  border: 1px solid var(--color-border, #35373e);
  border-radius: 3px;
}

/* ── Transition ───────────────────────────────────────────────────────────── */
.omni-anim-enter-active,
.omni-anim-leave-active {
  transition: opacity 0.18s ease;
}
.omni-anim-enter-active .omni-dialog,
.omni-anim-leave-active .omni-dialog {
  transition: transform 0.2s cubic-bezier(0.05, 0.03, 0.35, 1), opacity 0.18s ease;
}
.omni-anim-enter-from,
.omni-anim-leave-to {
  opacity: 0;
}
.omni-anim-enter-from .omni-dialog,
.omni-anim-leave-to .omni-dialog {
  transform: scale(0.93);
  opacity: 0;
}

/* ── Reduced motion ───────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .omni-anim-enter-active,
  .omni-anim-leave-active,
  .omni-anim-enter-active .omni-dialog,
  .omni-anim-leave-active .omni-dialog {
    transition: none !important;
  }
}
</style>
