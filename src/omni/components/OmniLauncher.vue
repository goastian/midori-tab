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
          :style="dialogStyleVars"
          role="dialog"
          aria-modal="true"
          :aria-label="dialogLabelText"
        >
          <!-- ── Search row ── -->
          <div class="omni-search-row">
            <span class="omni-search-icon" aria-hidden="true">🔍</span>
            <input
              ref="inputRef"
              v-model="query"
              class="omni-input"
              type="text"
              :placeholder="placeholderText"
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
            :aria-label="resultsLabelText"
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
              {{ noResultsText }}
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
              {{ visibleResults.length }} {{ resultsWordText }}
            </span>
            <span class="omni-hint">
              <kbd>{{ navigateHint }}</kbd> {{ hintNavigateText }}
              · <kbd>{{ selectHint }}</kbd> {{ hintSelectText }}
              · <kbd>{{ openInNewTabHint }}</kbd> {{ hintOpenInNewTabText }}
              · <kbd>{{ dismissHint }}</kbd> {{ hintDismissText }}
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
import omniSharedUi from '../../../shared/omni-ui.shared.json';

function normalizeLocale(code) {
  if (!code) return '';
  return String(code).trim().toLowerCase().split('-')[0];
}

function getSharedLocaleCopy(localeCode) {
  const code = normalizeLocale(localeCode);
  const copyByLocale = omniSharedUi?.copyByLocale || {};
  return copyByLocale[code] || copyByLocale.en || {
    label: 'Command Menu',
    placeholder: 'Type a command or search…',
    resultsLabel: 'Search results',
    results: 'results',
    navigate: 'navigate',
    select: 'select',
    openInNewTab: 'new tab',
    dismiss: 'dismiss',
    noResults: 'No results found',
  };
}

function getSharedDensityPreset(name) {
  const presets = omniSharedUi?.densityPresets || {};
  return presets[name] || presets.cozy || {
    dialogMaxHeight: 560,
    listMaxHeight: 420,
    searchRowHeight: 52,
    searchRowPaddingX: 16,
    itemPaddingX: 16,
    itemPaddingY: 9,
    footerPaddingX: 16,
    footerPaddingY: 8,
  };
}

export default {
  name: 'OmniLauncher',
  components: { OmniResultItem },
  props: {
    enableGlobalTriggers: {
      type: Boolean,
      default: true,
    },
  },

  setup(props) {
    const omniStore = useOmniStore();
    const i18n = useI18nStore();
    const { search } = useOmniSearch();

    const inputRef = ref(null);
    const dialogRef = ref(null);
    const listRef = ref(null);
    const query = ref('');
    const maxVisible = ref(100);

    const sharedCopy = getSharedLocaleCopy(i18n.locale);

    const dialogLabelText = ref(sharedCopy.label);
    const placeholderText = ref(sharedCopy.placeholder);
    const resultsLabelText = ref(sharedCopy.resultsLabel);
    const noResultsText = ref(sharedCopy.noResults);
    const resultsWordText = ref(sharedCopy.results);

    const navigateHint = ref('↑↓');
    const selectHint = ref('↵');
    const openInNewTabHint = ref('Ctrl+↵');
    const dismissHint = ref('Esc');

    const hintNavigateText = ref(sharedCopy.navigate);
    const hintSelectText = ref(sharedCopy.select);
    const hintOpenInNewTabText = ref(sharedCopy.openInNewTab);
    const hintDismissText = ref(sharedCopy.dismiss);

    const density = ref(getSharedDensityPreset('cozy'));

    const dialogStyleVars = computed(() => ({
      '--omni-dialog-max-height': `${density.value.dialogMaxHeight}px`,
      '--omni-list-max-height': `${density.value.listMaxHeight}px`,
      '--omni-search-row-height': `${density.value.searchRowHeight}px`,
      '--omni-search-row-padding-x': `${density.value.searchRowPaddingX}px`,
      '--omni-footer-padding-x': `${density.value.footerPaddingX}px`,
      '--omni-footer-padding-y': `${density.value.footerPaddingY}px`,
    }));

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
      loadOmniConfig();
      search('', { immediate: true });
      await nextTick();
      inputRef.value?.focus();
    });

    watch(() => i18n.locale, () => {
      try {
        loadOmniConfig();
      } catch (_) { /* noop */ }
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

    function resolveDensityVariant() {
      return window.innerHeight < 760 || window.innerWidth < 1024 ? 'compact' : 'cozy';
    }

    function loadOmniConfig() {
      chrome.runtime.sendMessage(
        {
          request: 'get-omni-config',
          locale: i18n.locale,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
          },
          densityVariant: resolveDensityVariant(),
        },
        (config) => {
          if (chrome.runtime.lastError || !config) return;

          if (Number.isFinite(config.maxResults) && config.maxResults > 0) {
            maxVisible.value = config.maxResults;
          }

          if (config.copy) {
            dialogLabelText.value = config.copy.dialogLabel || dialogLabelText.value;
            placeholderText.value = config.copy.placeholder || placeholderText.value;
            resultsLabelText.value = config.copy.resultsLabel || resultsLabelText.value;
            noResultsText.value = config.copy.noResults || noResultsText.value;
            resultsWordText.value = config.copy.resultsWord || resultsWordText.value;

            hintNavigateText.value = config.copy.hintNavigateLabel || hintNavigateText.value;
            hintSelectText.value = config.copy.hintSelectLabel || hintSelectText.value;
            hintOpenInNewTabText.value = config.copy.hintOpenInNewTabLabel || hintOpenInNewTabText.value;
            hintDismissText.value = config.copy.hintDismissLabel || hintDismissText.value;
          }

          if (config.hints) {
            navigateHint.value = config.hints.navigate || navigateHint.value;
            selectHint.value = config.hints.select || selectHint.value;
            openInNewTabHint.value = config.hints.openInNewTab || openInNewTabHint.value;
            dismissHint.value = config.hints.dismiss || dismissHint.value;
          }

          if (config.density && typeof config.density === 'object') {
            density.value = {
              ...density.value,
              ...config.density,
            };
          }
        }
      );
    }

    let configResizeRaf = null;

    function onResize() {
      if (!omniStore.isOpen) return;
      cancelAnimationFrame(configResizeRaf);
      configResizeRaf = requestAnimationFrame(() => {
        try {
          loadOmniConfig();
        } catch (_) { /* noop */ }
      });
    }

    onMounted(() => {
      if (props.enableGlobalTriggers) {
        window.addEventListener('keydown', onGlobalKeydown);
      }
      window.addEventListener('resize', onResize);

      try {
        loadOmniConfig();
      } catch (_) { /* noop */ }

      try {
        if (props.enableGlobalTriggers) {
          chrome.runtime.onMessage.addListener(onRuntimeMessage);
        }
      } catch (_) { /* not in extension context */ }
    });

    onUnmounted(() => {
      if (props.enableGlobalTriggers) {
        window.removeEventListener('keydown', onGlobalKeydown);
      }
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(scrollRaf);
      cancelAnimationFrame(configResizeRaf);
      try {
        if (props.enableGlobalTriggers) {
          chrome.runtime.onMessage.removeListener(onRuntimeMessage);
        }
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
      dialogStyleVars,

      dialogLabelText,
      placeholderText,
      resultsLabelText,
      noResultsText,
      resultsWordText,

      navigateHint,
      selectHint,
      openInNewTabHint,
      dismissHint,

      hintNavigateText,
      hintSelectText,
      hintOpenInNewTabText,
      hintDismissText,
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
  max-height: var(--omni-dialog-max-height, 560px);
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
  padding: 0 var(--omni-search-row-padding-x, 16px);
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
  height: var(--omni-search-row-height, 52px);
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
  max-height: var(--omni-list-max-height, 420px);
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
  padding: var(--omni-footer-padding-y, 8px) var(--omni-footer-padding-x, 16px);
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
