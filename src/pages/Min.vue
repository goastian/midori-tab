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

    <section v-if="widgetsStore.enabled.bookmarks" class="dash-bookmarks">
      <Suspense>
        <BookmarkGrid ref="bookmarkGrid" :openTarget="tab.openLink" />
        <template #fallback>
          <div class="async-placeholder async-placeholder--bookmarks"></div>
        </template>
      </Suspense>
    </section>

    <section v-if="tab.showAds" class="dash-ad-slot">
      <VAdSlot />
    </section>

    <section v-if="activeGridWidgets.length" class="dash-widgets">
      <div v-for="key in activeGridWidgets" :key="key" class="widget-card">
        <button class="widget-close" @click="widgetsStore.toggle(key)" title="Close widget">x</button>
        <component :is="widgetComponentMap[key]" />
      </div>
    </section>

    <DashboardActions
      :i18n="i18n"
      :show-widget-sheet="showWidgetSheet"
      @open-shortcut="showShortcutDialog = true"
      @toggle-widgets="showWidgetSheet = !showWidgetSheet"
      @open-marketplace="openMarketplace()"
    />

    <WidgetPicker
      :visible="showWidgetSheet"
      :widgets="availableWidgets"
      :enabled="widgetsStore.enabled"
      :i18n="i18n"
      @close="showWidgetSheet = false"
      @toggle="toggleWidget"
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

    <ShortcutDialog
      :visible="showShortcutDialog"
      :i18n="i18n"
      @close="showShortcutDialog = false"
      @submit-shortcut="submitShortcut"
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
import DashboardShell from '../components/dashboard/DashboardShell.vue';
import MarketplaceSheet from '../components/dashboard/MarketplaceSheet.vue';
import QuickSettingsPanel from '../components/dashboard/QuickSettingsPanel.vue';
import ShortcutDialog from '../components/dashboard/ShortcutDialog.vue';
import WidgetPicker from '../components/WidgetPicker.vue';
import { useWidgetManagement } from '../composables/useWidgetManagement.js';

export default {
  name: 'MinimalistDashboard',

  components: {
    AstianAppsMenu,
    BookmarkGrid: defineAsyncComponent(() => import('../components/BookmarkGrid.vue')),
    BrowserBookmarksWidget: defineAsyncComponent(() => import('../components/BrowserBookmarksWidget.vue')),
    CalendarWidget: defineAsyncComponent(() => import('../components/CalendarWidget.vue')),
    CurrencyWidget: defineAsyncComponent(() => import('../components/CurrencyWidget.vue')),
    DashboardActions,
    DashboardShell,
    MarketplaceSheet,
    NotesWidget: defineAsyncComponent(() => import('../components/NotesWidget.vue')),
    PrivacyWidget: defineAsyncComponent(() => import('../components/PrivacyWidget.vue')),
    QuickSettingsPanel,
    RssWidget: defineAsyncComponent(() => import('../components/RssWidget.vue')),
    SearchBox: defineAsyncComponent(() => import('../components/SearchBox.vue')),
    ShortcutDialog,
    TodoWidget: defineAsyncComponent(() => import('../components/TodoWidget.vue')),
    VAdSlot: defineAsyncComponent(() => import('../components/VAdSlot.vue')),
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
      showShortcutDialog: false,
      showQuickSettings: false,
      showAppsMenu: false,
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

    openMarketplace(type = 'wallpaper') {
      this.activeMarketplaceType = type;
      this.showMarketplaceSheet = true;
    },

    handleOpenMarketplace(event) {
      const requestedType = event?.detail?.type || 'wallpaper';
      this.openMarketplace(requestedType);
    },

    submitShortcut({ url, title }) {
      if (!url || !url.trim()) return;
      const finalTitle = title && title.trim() ? title.trim() : url;
      let finalUrl = url.trim();
      if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
      }
      const grid = this.$refs.bookmarkGrid;
      if (grid && grid.addBookmarkExternal) {
        grid.addBookmarkExternal(finalTitle, finalUrl);
      }
      this.showShortcutDialog = false;
    },
  },
};
</script>

<style scoped>
.dash-search {
  width: 100%;
  max-width: 640px;
}

.dash-bookmarks {
  width: 100%;
  max-width: 720px;
}

:global([data-density='compact']) .dash-bookmarks {
  max-width: 680px;
}

.dash-widgets {
  width: 100%;
  max-width: 720px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  align-items: start;
}

.widget-card {
  position: relative;
  border-radius: var(--radius-md, 10px);
}

.widget-close {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 10;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-overlay, rgba(30,45,61,0.85));
  border: none;
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.7rem;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.widget-card:hover .widget-close {
  opacity: 1;
}

.widget-close:hover {
  background: var(--accent-danger, #e17055);
  color: white;
}

.async-placeholder {
  width: 100%;
  background: var(--surface-raised, rgba(15,21,32,0.76));
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
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

.async-placeholder--bookmarks {
  min-height: 138px;
}

@keyframes placeholder-sheen {
  100% {
    transform: translateX(100%);
  }
}

@media (max-width: 600px) {
  .dash-widgets {
    grid-template-columns: 1fr;
  }
}
</style>
