<template>
  <DashboardShell
    :i18n="i18n"
    :apps-menu-open="showAppsMenu"
    @open-settings="openSettings"
    @toggle-quick-settings="showQuickSettings = !showQuickSettings"
    @toggle-apps-menu="showAppsMenu = !showAppsMenu"
  >
    <section v-if="widgetsStore.enabled.search" class="dash-search">
      <Suspense>
        <SearchBox :searchTarget="tab.openLink" />
        <template #fallback>
          <div class="async-placeholder async-placeholder--search"></div>
        </template>
      </Suspense>
    </section>

    <section v-if="tab.showAds" class="dash-sponsored">
      <Suspense>
        <BookmarkGrid
          :showAds="tab.showAds"
        />
        <template #fallback>
          <div class="async-placeholder async-placeholder--sponsored"></div>
        </template>
      </Suspense>
    </section>

    <section
      v-if="activeGridWidgets.length"
      :class="['widget-board', `widget-board--${widgetBoardMode}`]"
      :aria-labelledby="activeGridWidgets.length > 1 ? 'widget-board-title' : undefined"
      :aria-label="activeGridWidgets.length === 1 ? i18n.$t('dashboard.widgetBoard.title') : undefined"
    >

      <div
        class="dash-widgets"
        role="list"
        :aria-describedby="activeGridWidgets.length > 1 ? 'widget-board-hint' : undefined"
      >
        <article
          v-for="key in activeGridWidgets"
          :key="key"
          :class="[
            'widget-card',
            `widget-card--${widgetMetaMap[key]?.layout || 'compact'}`,
            {
              'is-dragging': draggedWidgetKey === key,
              'is-drop-target': dropTargetKey === key,
              'is-drop-before': dropTargetKey === key && dropPlacement === 'before',
              'is-drop-after': dropTargetKey === key && dropPlacement === 'after',
            },
          ]"
          :data-widget="key"
          role="listitem"
          @dragover.prevent="handleDragOver(key, $event)"
          @dragleave="handleDragLeave(key, $event)"
          @drop.prevent.stop="handleDrop(key, $event)"
        >
          <header class="widget-card__toolbar">
            <button
              v-if="activeGridWidgets.length > 1"
              class="widget-drag-handle"
              type="button"
              draggable="true"
              :aria-label="dragHandleLabel(key)"
              aria-describedby="widget-board-hint"
              @dragstart="handleDragStart(key, $event)"
              @dragend="finishWidgetDrag"
              @keydown="handleReorderKey(key, $event)"
            >
              <DashboardIcon name="grip" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
            <span class="widget-card__icon" aria-hidden="true">
              <DashboardIcon :name="widgetMetaMap[key]?.icon" :size="15" :stroke-width="1.7" />
            </span>
            <h2 class="widget-card__title">{{ widgetMetaMap[key]?.label || key }}</h2>
            <button
              class="widget-close"
              type="button"
              :title="closeWidgetLabel(key)"
              :aria-label="closeWidgetLabel(key)"
              @click="removeWidget(key)"
            >
              <DashboardIcon name="close" :size="15" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>
          <div class="widget-card__body">
            <component :is="widgetComponentMap[key]" :managed="true" />
          </div>
        </article>
      </div>

      <p class="sr-only" role="status" aria-live="polite">{{ reorderAnnouncement }}</p>
    </section>

    <DashboardActions
      :i18n="i18n"
      :show-widget-sheet="showWidgetSheet"
      @toggle-widgets="showWidgetSheet = !showWidgetSheet"
      @open-marketplace="openMarketplace()"
    />

    <WidgetPicker
      :visible="showWidgetSheet"
      :widgets="availableWidgets"
      :enabled="widgetsStore.enabled"
      :active-count="activeGridWidgets.length"
      :i18n="i18n"
      @close="showWidgetSheet = false"
      @toggle="toggleWidget"
      @reset-order="resetWidgetOrder"
    />

    <MarketplaceSheet
      v-if="showMarketplaceSheet"
      :visible="showMarketplaceSheet"
      :active-type="activeMarketplaceType"
      :i18n="i18n"
      @close="showMarketplaceSheet = false"
    />

    <QuickSettingsPanel
      :visible="showQuickSettings"
      :tab="tab"
      :widgets-store="widgetsStore"
      :i18n="i18n"
      @close="showQuickSettings = false"
      @toggle-density="toggleDensity"
      @toggle-section="toggleSection"
      @refresh-wallpaper="refreshWallpaper"
      @open-settings="openSettingsAndCloseQuick"
    />

    <AstianAppsMenu
      :visible="showAppsMenu"
      @close="showAppsMenu = false"
    />
  </DashboardShell>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useTabStore from '../stores/useTabStore';
import useWidgetsStore from '../stores/useWidgetsStore';
import useI18nStore from '../stores/useI18nStore.js';
import AstianAppsMenu from '../components/dashboard/AstianAppsMenu.vue';
import DashboardActions from '../components/dashboard/DashboardActions.vue';
import DashboardIcon from '../components/icons/DashboardIcon.vue';
import DashboardShell from '../components/dashboard/DashboardShell.vue';
import MarketplaceSheet from '../components/dashboard/MarketplaceSheet.vue';
import QuickSettingsPanel from '../components/dashboard/QuickSettingsPanel.vue';
import WidgetPicker from '../components/WidgetPicker.vue';
import { useWidgetManagement } from '../composables/useWidgetManagement.js';
import { moveWidget, resolveWidgetBoardMode } from '../utils/widgetLayout.js';

export default {
  name: 'MinimalistDashboard',

  components: {
    AstianAppsMenu,
    BookmarkGrid: defineAsyncComponent(() => import('../components/BookmarkGrid.vue')),
    BrowserBookmarksWidget: defineAsyncComponent(() => import('../components/BrowserBookmarksWidget.vue')),
    CalendarWidget: defineAsyncComponent(() => import('../components/CalendarWidget.vue')),
    CurrencyWidget: defineAsyncComponent(() => import('../components/CurrencyWidget.vue')),
    DashboardActions,
    DashboardIcon,
    DashboardShell,
    MarketplaceSheet,
    NotesWidget: defineAsyncComponent(() => import('../components/NotesWidget.vue')),
    PrivacyWidget: defineAsyncComponent(() => import('../components/PrivacyWidget.vue')),
    QuickSettingsPanel,
    RssWidget: defineAsyncComponent(() => import('../components/RssWidget.vue')),
    SearchBox: defineAsyncComponent(() => import('../components/SearchBox.vue')),
    TodoWidget: defineAsyncComponent(() => import('../components/TodoWidget.vue')),
    WeatherWidget: defineAsyncComponent(() => import('../components/WeatherWidget.vue')),
    WidgetPicker,
  },

  data() {
    const widgetsStore = useWidgetsStore();
    const i18n = useI18nStore();
    return {
      tab: useTabStore(),
      widgetsStore,
      i18n,
      widgetManagement: useWidgetManagement({ widgetsStore, i18n }),
      showWidgetSheet: false,
      showMarketplaceSheet: false,
      activeMarketplaceType: 'wallpaper',
      showQuickSettings: false,
      showAppsMenu: false,
      draggedWidgetKey: '',
      dropTargetKey: '',
      dropPlacement: 'before',
      reorderAnnouncement: '',
    };
  },

  mounted() {
    window.addEventListener('midori:open-marketplace', this.handleOpenMarketplace);
  },

  beforeUnmount() {
    window.removeEventListener('midori:open-marketplace', this.handleOpenMarketplace);
  },

  computed: {
    activeGridWidgets() {
      return this.widgetManagement.getActiveGridWidgets();
    },
    availableWidgets() {
      return this.widgetManagement.getAvailableWidgets();
    },
    widgetComponentMap() {
      return this.widgetManagement.getWidgetComponentMap();
    },
    widgetMetaMap() {
      return this.widgetManagement.getWidgetMetaMap();
    },
    widgetBoardMode() {
      return resolveWidgetBoardMode(this.activeGridWidgets.length);
    },
    widgetBoardHint() {
      const key = this.widgetBoardMode === 'pair'
        ? 'dashboard.widgetBoard.pairHint'
        : 'dashboard.widgetBoard.gridHint';
      return this.i18n.$t(key);
    },
  },

  methods: {
    openSettings() {
      this.tab.updateState();
    },

    openSettingsAndCloseQuick() {
      this.showQuickSettings = false;
      this.openSettings();
    },

    toggleDensity() {
      this.tab.setDensity(this.tab.density === 'compact' ? 'comfortable' : 'compact');
    },

    toggleSection(key) {
      this.widgetsStore.toggle(key);
    },

    refreshWallpaper() {
      window.dispatchEvent(new CustomEvent('midori:refresh-wallpaper'));
    },

    toggleWidget(key) {
      this.widgetManagement.toggleWidget(key);
    },

    formatCopy(key, replacements = {}) {
      let copy = String(this.i18n.$t(key));
      for (const [name, value] of Object.entries(replacements)) {
        copy = copy.replaceAll(`{${name}}`, String(value));
      }
      return copy;
    },

    dragHandleLabel(key) {
      return this.formatCopy('dashboard.widgetBoard.move', {
        widget: this.widgetMetaMap[key]?.label || key,
      });
    },

    closeWidgetLabel(key) {
      return this.formatCopy('dashboard.widgetBoard.remove', {
        widget: this.widgetMetaMap[key]?.label || key,
      });
    },

    removeWidget(key) {
      const label = this.widgetMetaMap[key]?.label || key;
      this.widgetsStore.toggle(key);
      this.reorderAnnouncement = this.formatCopy('dashboard.widgetBoard.removed', { widget: label });
      this.finishWidgetDrag();
    },

    resetWidgetOrder() {
      this.widgetsStore.resetOrder();
      this.reorderAnnouncement = this.i18n.$t('dashboard.widgetBoard.resetDone');
    },

    handleDragStart(key, event) {
      if (this.activeGridWidgets.length < 2) return;
      this.draggedWidgetKey = key;
      this.dropTargetKey = '';
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', key);

      const card = event.currentTarget.closest('.widget-card');
      if (card && event.dataTransfer.setDragImage) {
        event.dataTransfer.setDragImage(card, Math.min(card.clientWidth / 2, 160), 24);
      }
    },

    handleDragOver(key, event) {
      if (!this.draggedWidgetKey || this.draggedWidgetKey === key) return;
      event.dataTransfer.dropEffect = 'move';

      const rect = event.currentTarget.getBoundingClientRect();
      const stacked = window.matchMedia('(max-width: 700px)').matches;
      const sourceIndex = this.activeGridWidgets.indexOf(this.draggedWidgetKey);
      const targetIndex = this.activeGridWidgets.indexOf(key);
      const after = this.widgetBoardMode === 'pair'
        ? sourceIndex < targetIndex
        : stacked
          ? event.clientY >= rect.top + (rect.height / 2)
          : event.clientX >= rect.left + (rect.width / 2);

      this.dropTargetKey = key;
      this.dropPlacement = after ? 'after' : 'before';
    },

    handleDragLeave(key, event) {
      if (this.dropTargetKey !== key) return;
      if (event.currentTarget.contains(event.relatedTarget)) return;
      this.dropTargetKey = '';
    },

    handleDrop(targetKey, event) {
      const sourceKey = this.draggedWidgetKey || event.dataTransfer.getData('text/plain');
      if (!sourceKey || sourceKey === targetKey) {
        this.finishWidgetDrag();
        return;
      }

      const nextOrder = moveWidget(
        this.activeGridWidgets,
        sourceKey,
        targetKey,
        this.dropPlacement,
      );
      this.widgetsStore.setWidgetSubsetOrder(nextOrder);
      this.announceWidgetPosition(sourceKey, nextOrder);
      this.finishWidgetDrag();
    },

    handleReorderKey(key, event) {
      const currentOrder = this.activeGridWidgets;
      const currentIndex = currentOrder.indexOf(key);
      let nextIndex = currentIndex;

      if (['ArrowLeft', 'ArrowUp'].includes(event.key)) nextIndex -= 1;
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) nextIndex += 1;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = currentOrder.length - 1;
      if (nextIndex === currentIndex || nextIndex < 0 || nextIndex >= currentOrder.length) return;

      event.preventDefault();
      const nextOrder = [...currentOrder];
      const [widget] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(nextIndex, 0, widget);
      this.widgetsStore.setWidgetSubsetOrder(nextOrder);
      this.announceWidgetPosition(key, nextOrder);
    },

    announceWidgetPosition(key, order) {
      const position = order.indexOf(key) + 1;
      this.reorderAnnouncement = this.formatCopy('dashboard.widgetBoard.moved', {
        widget: this.widgetMetaMap[key]?.label || key,
        position,
        total: order.length,
      });
    },

    finishWidgetDrag() {
      this.draggedWidgetKey = '';
      this.dropTargetKey = '';
      this.dropPlacement = 'before';
    },

    openMarketplace(type = 'wallpaper') {
      this.activeMarketplaceType = type;
      this.showMarketplaceSheet = true;
    },

    handleOpenMarketplace(event) {
      const requestedType = event?.detail?.type || 'wallpaper';
      this.openMarketplace(requestedType);
    },

  },
};
</script>

<style scoped>
.dash-search {
  width: 100%;
  max-width: 640px;
}

.dash-sponsored {
  width: 100%;
  max-width: 720px;
}

:global([data-density='compact']) .dash-sponsored {
  max-width: 680px;
}

.widget-board {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  transition: max-width 220ms ease;
}

.widget-board--single {
  max-width: 720px;
}

.widget-board--pair {
  max-width: 940px;
}

.widget-board--grid {
  max-width: 1180px;
}

.widget-board__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0 0.15rem;
  color: var(--color-text, #1A2B26);
}

.widget-board__heading {
  min-width: 0;
}

.widget-board__eyebrow {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.8rem;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.widget-board__count {
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.35rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
  background: var(--color-accent-bg, rgba(4, 164, 105, 0.08));
  color: var(--color-primary, #04A469);
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}

.widget-board__hint {
  margin: 0.12rem 0 0;
  color: var(--color-text-muted, #5A7B6D);
  font-size: 0.7rem;
  line-height: 1.35;
}

.widget-board__reset {
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.55rem;
  border: 1px solid transparent;
  border-radius: var(--nova-control-radius, 8px);
  background: transparent;
  color: var(--color-text-muted, #5A7B6D);
  font: inherit;
  font-size: 0.7rem;
  font-weight: 550;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.widget-board__reset:hover {
  background: var(--surface-island, rgba(255, 255, 255, 0.9));
  border-color: var(--color-border, rgba(0, 0, 0, 0.1));
  color: var(--color-text, #1A2B26);
}

.dash-widgets {
  width: 100%;
  display: grid;
  gap: 0.85rem;
}

.widget-board--single .dash-widgets {
  grid-template-columns: minmax(0, 1fr);
}

.widget-board--pair .dash-widgets {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.widget-board--grid .dash-widgets {
  grid-template-columns: repeat(12, minmax(0, 1fr));
  align-items: start;
}

.widget-card {
  position: relative;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-island, rgba(244, 247, 246, 0.94));
  border: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 8px 28px rgba(8, 35, 26, 0.1), inset 0 1px rgba(255, 255, 255, 0.16);
  transition: border-color 160ms ease, box-shadow 160ms ease, opacity 160ms ease, transform 160ms ease;
}

.widget-board--single .widget-card--compact {
  height: 240px;
}

.widget-board--single .widget-card--compact-tall {
  height: 330px;
}

.widget-board--single .widget-card--wide {
  height: 390px;
}

.widget-board--single .widget-card--wide-tall {
  height: 500px;
}

.widget-board--pair .widget-card {
  height: clamp(300px, 42vh, 390px);
}

.widget-board--grid .widget-card--compact,
.widget-board--grid .widget-card--compact-tall {
  grid-column: span 4;
}

.widget-board--grid .widget-card--wide,
.widget-board--grid .widget-card--wide-tall {
  grid-column: span 8;
}

.widget-board--grid .widget-card--compact {
  height: 230px;
}

.widget-board--grid .widget-card--compact-tall {
  height: 310px;
}

.widget-board--grid .widget-card--wide {
  height: 340px;
}

.widget-board--grid .widget-card--wide-tall {
  height: 430px;
}

.widget-card:hover,
.widget-card:focus-within {
  border-color: var(--color-border-hover, rgba(0, 0, 0, 0.18));
  box-shadow: 0 12px 34px rgba(8, 35, 26, 0.14), inset 0 1px rgba(255, 255, 255, 0.2);
}

.widget-card.is-dragging {
  opacity: 0.42;
  transform: scale(0.985);
}

.widget-card.is-drop-target {
  border-color: var(--color-primary, #04A469);
  box-shadow: 0 0 0 3px var(--color-accent-border, rgba(4, 164, 105, 0.2));
}

.widget-card.is-drop-target::after {
  content: '';
  position: absolute;
  z-index: 20;
  top: 0.65rem;
  bottom: 0.65rem;
  width: 3px;
  border-radius: 3px;
  background: var(--color-primary, #04A469);
}

.widget-card.is-drop-before::after {
  left: -1px;
}

.widget-card.is-drop-after::after {
  right: -1px;
}

.widget-card__toolbar {
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.38rem 0.48rem 0.38rem 0.55rem;
  border-bottom: 1px solid var(--color-border, rgba(0, 0, 0, 0.1));
  background: var(--surface-island, rgba(244, 247, 246, 0.94));
  flex: 0 0 auto;
}

.widget-drag-handle,
.widget-close {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--color-text-muted, #5A7B6D);
  transition: background 140ms ease, border-color 140ms ease, color 140ms ease, transform 140ms ease;
}

.widget-drag-handle {
  cursor: grab;
  touch-action: none;
}

.widget-drag-handle:active {
  cursor: grabbing;
  transform: scale(0.96);
}

.widget-drag-handle:hover,
.widget-close:hover {
  background: var(--surface-control-hover, #fff);
  border-color: var(--color-border, rgba(0, 0, 0, 0.1));
  color: var(--color-text, #1A2B26);
}

.widget-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary, #04A469);
}

.widget-card__title {
  min-width: 0;
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--color-text, #1A2B26);
  font-size: 0.76rem;
  font-weight: 650;
  letter-spacing: -0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.widget-close {
  cursor: pointer;
}

.widget-close:hover {
  background: rgba(225, 112, 85, 0.12);
  border-color: rgba(225, 112, 85, 0.2);
  color: var(--accent-danger, #e17055);
}

.widget-card__body {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: var(--color-border-hover, rgba(0, 0, 0, 0.18)) transparent;
  scrollbar-width: thin;
}

.widget-card__body :deep(.weather-widget),
.widget-card__body :deep(.currency-widget),
.widget-card__body :deep(.browser-bookmarks-widget),
.widget-card__body :deep(.privacy-widget),
.widget-card__body :deep(.rss-widget),
.widget-card__body :deep(.calendar-widget),
.widget-card__body :deep(.notes-widget),
.widget-card__body :deep(.todo-widget) {
  width: 100%;
  min-height: 100%;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.async-placeholder {
  width: 100%;
  background: var(--surface-island, rgba(15,21,32,0.76));
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--nova-panel-radius, 14px);
  overflow: hidden;
  position: relative;
}

.async-placeholder::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(126,196,168,0.08), transparent);
  animation: placeholder-sheen 1.1s ease-in-out infinite;
}

.async-placeholder--search {
  min-height: 54px;
}

.async-placeholder--sponsored {
  width: 120px;
  min-height: 112px;
}

@keyframes placeholder-sheen {
  100% {
    transform: translateX(100%);
  }
}

@media (max-width: 920px) {
  .widget-board--grid .widget-card--compact,
  .widget-board--grid .widget-card--compact-tall {
    grid-column: span 6;
  }

  .widget-board--grid .widget-card--wide,
  .widget-board--grid .widget-card--wide-tall {
    grid-column: span 12;
  }
}

@media (max-width: 700px) {
  .widget-board__header {
    align-items: center;
  }

  .widget-board__reset span {
    display: none;
  }

  .widget-board--pair .dash-widgets,
  .widget-board--grid .dash-widgets {
    grid-template-columns: 1fr;
  }

  .widget-board--grid .widget-card--compact,
  .widget-board--grid .widget-card--compact-tall,
  .widget-board--grid .widget-card--wide,
  .widget-board--grid .widget-card--wide-tall {
    grid-column: 1;
  }

  .widget-board--pair .widget-card {
    height: 330px;
  }

  .widget-card.is-drop-target::after {
    left: 0.65rem;
    right: 0.65rem;
    width: auto;
    height: 3px;
  }

  .widget-card.is-drop-before::after {
    top: -1px;
    bottom: auto;
  }

  .widget-card.is-drop-after::after {
    top: auto;
    bottom: -1px;
  }
}

@media (max-width: 460px) {
  .widget-board--grid .widget-card--compact,
  .widget-board--grid .widget-card--compact-tall,
  .widget-board--grid .widget-card--wide,
  .widget-board--grid .widget-card--wide-tall {
    height: min(360px, 58vh);
  }

  .widget-card__toolbar {
    min-height: 38px;
  }
}
</style>
