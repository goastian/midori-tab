<template>
    <div class="dashboard">
        <!-- ═══ Settings button: fixed top-right ═══ -->
        <button class="settings-btn" type="button" @click="openSettings" :title="i18n.t.settings.title" :aria-label="i18n.t.settings.title">
            <Settings :size="20" :stroke-width="1.5" />
        </button>
        <button class="quick-btn" type="button" @click="showQuickSettings = !showQuickSettings" :title="i18n.$t('dashboard.quickSettings.title')" :aria-label="i18n.$t('dashboard.quickSettings.title')">
            <SlidersHorizontal :size="20" :stroke-width="1.5" />
        </button>

        <!-- ═══ Logo centered ═══ -->
        <header class="dash-header">
            <Logo />
        </header>

        <!-- ═══ Search ═══ -->
        <section v-if="widgetsStore.enabled.search" class="dash-search">
            <SearchBox :searchTarget="tab.openLink" />
        </section>

        <!-- ═══ Bookmarks row ═══ -->
        <section v-if="widgetsStore.enabled.bookmarks" class="dash-bookmarks">
            <BookmarkGrid ref="bookmarkGrid" :openTarget="tab.openLink" />
        </section>

        <!-- ═══ Active widgets area (rendered when toggled from bottom sheet) ═══ -->
        <section v-if="activeGridWidgets.length" class="dash-widgets">
            <div v-for="key in activeGridWidgets" :key="key" class="widget-card">
                <button class="widget-close" @click="widgetsStore.toggle(key)" title="Close widget">✕</button>
                <LazyMount>
                    <component :is="widgetComponentMap[key]" />
                </LazyMount>
            </div>
        </section>

        <!-- ═══ Bottom action bar ═══ -->
        <div class="bottom-actions">
            <button class="action-btn" type="button" @click="showShortcutDialog = true" :aria-label="i18n.$t('dashboard.actions.shortcut')">
                <Plus :size="14" :stroke-width="2" />
                <span>{{ i18n.$t('dashboard.actions.shortcut') }}</span>
            </button>
            <button class="action-btn" type="button" @click="showWidgetSheet = !showWidgetSheet" :aria-label="i18n.$t('dashboard.actions.widget')">
                <Minus v-if="showWidgetSheet" :size="14" :stroke-width="2" />
                <Plus v-else :size="14" :stroke-width="2" />
                <span>{{ i18n.$t('dashboard.actions.widget') }}</span>
            </button>
        </div>

        <!-- ═══ Widget bottom sheet ═══ -->
        <Teleport to="body">
            <Transition name="sheet-fade">
                <div v-if="showWidgetSheet" class="sheet-overlay" @click="showWidgetSheet = false"></div>
            </Transition>
            <Transition name="sheet-slide">
                <div v-if="showWidgetSheet" class="widget-sheet">
                    <div class="sheet-header">
                        <span class="sheet-title">{{ i18n.$t('dashboard.widgetsSheet.title') }}</span>
                        <button class="sheet-close" type="button" @click="showWidgetSheet = false" :aria-label="i18n.$t('dashboard.widgetsSheet.close')">✕</button>
                    </div>
                    <div class="sheet-grid">
                        <button
                            v-for="w in availableWidgets"
                            :key="w.key"
                            class="sheet-item"
                            :class="{ active: widgetsStore.enabled[w.key] }"
                            @click="toggleWidget(w.key)"
                        >
                            <span class="sheet-item-icon">{{ w.icon }}</span>
                            <span class="sheet-item-label">{{ w.label }}</span>
                        </button>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <Teleport to="body">
            <Transition name="dialog-fade">
                <div v-if="showQuickSettings" class="quick-overlay" @click="showQuickSettings = false">
                    <div class="quick-panel" @click.stop>
                        <div class="quick-header">
                            <span class="quick-title">{{ i18n.$t('dashboard.quickSettings.title') }}</span>
                            <button class="quick-close" type="button" @click="showQuickSettings = false" :aria-label="i18n.$t('dashboard.quickSettings.close')">✕</button>
                        </div>
                        <div class="quick-grid">
                            <button class="quick-item" type="button" @click="tab.setTheme()">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.theme') }}</span>
                                <span class="quick-item-value">{{ tab.theme === 'light' ? i18n.$t('dashboard.quickSettings.themeLight') : i18n.$t('dashboard.quickSettings.themeDark') }}</span>
                            </button>
                            <button class="quick-item" type="button" @click="toggleDensity">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.density') }}</span>
                                <span class="quick-item-value">{{ tab.density === 'compact' ? i18n.$t('dashboard.quickSettings.densityCompact') : i18n.$t('dashboard.quickSettings.densityComfortable') }}</span>
                            </button>
                            <button class="quick-item" type="button" @click="toggleSection('search')">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.search') }}</span>
                                <span class="quick-item-value">{{ widgetsStore.enabled.search ? i18n.$t('common.on') : i18n.$t('common.off') }}</span>
                            </button>
                            <button class="quick-item" type="button" @click="toggleSection('bookmarks')">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.bookmarks') }}</span>
                                <span class="quick-item-value">{{ widgetsStore.enabled.bookmarks ? i18n.$t('common.on') : i18n.$t('common.off') }}</span>
                            </button>
                            <button class="quick-item" type="button" @click="refreshWallpaper">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.wallpaper') }}</span>
                                <span class="quick-item-value">{{ i18n.$t('dashboard.quickSettings.refresh') }}</span>
                            </button>
                            <button class="quick-item" type="button" @click="openSettingsAndCloseQuick">
                                <span class="quick-item-title">{{ i18n.$t('dashboard.quickSettings.settings') }}</span>
                                <span class="quick-item-value">{{ i18n.$t('dashboard.quickSettings.open') }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </Teleport>

        <!-- ═══ Shortcut add dialog ═══ -->
        <Teleport to="body">
            <Transition name="dialog-fade">
                <div v-if="showShortcutDialog" class="dialog-overlay" @click="showShortcutDialog = false">
                    <Transition name="dialog-zoom">
                        <div v-if="showShortcutDialog" class="shortcut-dialog" @click.stop>
                            <div class="dialog-header">
                                <span class="dialog-title">{{ i18n.$t('dashboard.shortcutsDialog.title') }}</span>
                                <button class="dialog-close" type="button" @click="showShortcutDialog = false" :aria-label="i18n.$t('dashboard.shortcutsDialog.close')">✕</button>
                            </div>
                            <div class="dialog-body">
                                <label class="dialog-label">
                                    <span>{{ i18n.$t('dashboard.shortcutsDialog.address') }}</span>
                                    <input
                                        v-model="shortcutForm.url"
                                        class="dialog-input"
                                        type="url"
                                        :placeholder="i18n.$t('dashboard.shortcutsDialog.addressPlaceholder')"
                                        @keydown.enter="submitShortcut"
                                        ref="shortcutUrlInput"
                                    />
                                </label>
                                <label class="dialog-label">
                                    <span>{{ i18n.$t('dashboard.shortcutsDialog.name') }}</span>
                                    <input
                                        v-model="shortcutForm.title"
                                        class="dialog-input"
                                        type="text"
                                        :placeholder="i18n.$t('dashboard.shortcutsDialog.namePlaceholder')"
                                        @keydown.enter="submitShortcut"
                                    />
                                </label>
                            </div>
                            <div class="dialog-footer">
                                <button class="dialog-btn-primary" type="button" @click="submitShortcut">{{ i18n.$t('dashboard.shortcutsDialog.add') }}</button>
                                <button class="dialog-btn-secondary" type="button" @click="showShortcutDialog = false">{{ i18n.$t('dashboard.shortcutsDialog.cancel') }}</button>
                            </div>
                        </div>
                    </Transition>
                </div>
            </Transition>
        </Teleport>
    </div>
</template>

<script>
import { defineAsyncComponent, nextTick } from 'vue';
import { Settings, SlidersHorizontal, Plus, Minus } from 'lucide-vue-next';
import useTabStore from '../stores/useTabStore';
import useWidgetsStore from '../stores/useWidgetsStore';
import useI18nStore from '../stores/useI18nStore.js';

/** Widget keys for the bottom sheet (everything except search & bookmarks). */
const GRID_KEYS = ['privacy', 'rss', 'calendar', 'notes', 'todo'];

/** Widget metadata for the bottom sheet picker. */
const WIDGET_META = [
    { key: 'privacy', icon: '🛡️', label: 'Privacy' },
    { key: 'calendar', icon: '📅', label: 'Calendar' },
    { key: 'notes', icon: '📝', label: 'Sticky Note' },
    { key: 'todo', icon: '✅', label: 'Tasks' },
    { key: 'rss', icon: '📰', label: 'Feeds' },
];

export default {
    data() {
        return {
            tab: useTabStore(),
            widgetsStore: useWidgetsStore(),
            i18n: useI18nStore(),
            showWidgetSheet: false,
            showShortcutDialog: false,
            showQuickSettings: false,
            shortcutForm: { url: '', title: '' },
        };
    },

    computed: {
        /** Returns the grid widgets that are enabled, in configured order. */
        activeGridWidgets() {
            return this.widgetsStore.order.filter(
                k => GRID_KEYS.includes(k) && this.widgetsStore.enabled[k]
            );
        },
        availableWidgets() {
            return WIDGET_META;
        },
        widgetComponentMap() {
            return {
                privacy: 'PrivacyWidget',
                rss: 'RssWidget',
                calendar: 'CalendarWidget',
                notes: 'NotesWidget',
                todo: 'TodoWidget',
            };
        },
    },

    watch: {
        showShortcutDialog(val) {
            if (val) {
                this.shortcutForm = { url: '', title: '' };
                nextTick(() => {
                    this.$refs.shortcutUrlInput?.focus();
                });
            }
        },
    },

    methods: {
        /** Opens the settings panel. */
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

        /** Toggles a widget on/off from the bottom sheet. */
        toggleWidget(key) {
            this.widgetsStore.toggle(key);
        },

        /** Submits the shortcut form and adds a bookmark to BookmarkGrid. */
        submitShortcut() {
            const { url, title } = this.shortcutForm;
            if (!url || !url.trim()) return;
            const finalTitle = (title && title.trim()) ? title.trim() : url;
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

    components: {
        Settings,
        SlidersHorizontal,
        Plus,
        Minus,
        Logo: defineAsyncComponent(() => import('../components/Logo.vue')),
        SearchBox: defineAsyncComponent(() => import('../components/SearchBox.vue')),
        BookmarkGrid: defineAsyncComponent(() => import('../components/BookmarkGrid.vue')),
        PrivacyWidget: defineAsyncComponent(() => import('../components/PrivacyWidget.vue')),
        RssWidget: defineAsyncComponent(() => import('../components/RssWidget.vue')),
        CalendarWidget: defineAsyncComponent(() => import('../components/CalendarWidget.vue')),
        NotesWidget: defineAsyncComponent(() => import('../components/NotesWidget.vue')),
        TodoWidget: defineAsyncComponent(() => import('../components/TodoWidget.vue')),
        LazyMount: defineAsyncComponent(() => import('../components/LazyMount.vue')),
    },
};
</script>

<style scoped>
/* ═══════════════════════════════════════
   Dashboard layout — Flat Design
   ═══════════════════════════════════════ */
.dashboard {
    width: 100%;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem 2rem 5rem;
    gap: 1.25rem;
    font-size: 13px;
    box-sizing: border-box;
}

/* ── Settings button: fixed top-right of viewport ── */
.settings-btn {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 50;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-raised, rgba(15,21,32,0.75));
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    cursor: pointer;
    transition: all 0.15s ease;
    backdrop-filter: blur(8px);
}

.quick-btn {
    position: fixed;
    top: 1rem;
    right: 3.75rem;
    z-index: 50;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-raised, rgba(15,21,32,0.75));
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    cursor: pointer;
    transition: all 0.15s ease;
    backdrop-filter: blur(8px);
}

.quick-btn:hover {
    background: var(--surface-overlay, #1E2D3D);
    color: var(--color-text, #C4F0E0);
    border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.settings-btn:hover {
    background: var(--surface-overlay, #1E2D3D);
    color: var(--color-text, #C4F0E0);
    border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

/* ── Header: logo centered ── */
.dash-header {
    padding-top: 0.5rem;
    display: flex;
    justify-content: center;
}

/* ── Search bar ── */
.dash-search {
    width: 100%;
    max-width: 640px;
}

/* ── Bookmarks row ── */
.dash-bookmarks {
    width: 100%;
    max-width: 720px;
}

/* ── Active widgets area (2-col grid) ── */
.dash-widgets {
    width: 100%;
    max-width: 720px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    align-items: start;
}

@media (max-width: 600px) {
    .dash-widgets {
        grid-template-columns: 1fr;
    }
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

/* ═══ Bottom action bar ═══ */
.bottom-actions {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    z-index: 80;
    display: flex;
    gap: 0.5rem;
    padding: 0.35rem;
    background: var(--surface-raised, rgba(15,21,32,0.8));
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-md, 10px);
    backdrop-filter: blur(12px);
}

.action-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
    white-space: nowrap;
}

.action-btn:hover {
    background: var(--surface-overlay, #1E2D3D);
    color: var(--color-text, #C4F0E0);
}

/* ═══ Widget bottom sheet ═══ */
.sheet-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 8000;
}

.widget-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 8001;
    background: var(--surface-base, #080D14);
    border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-lg, 16px) var(--radius-lg, 16px) 0 0;
    padding: 1.25rem 2rem 2rem;
    box-shadow: 0 -4px 24px rgba(0,0,0,0.2);
}

.sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1rem;
}

.sheet-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text, white);
}

.sheet-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-overlay, #1E2D3D);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.12s ease;
}

.sheet-close:hover {
    color: var(--color-text, white);
    background: var(--color-border-hover, rgba(126,196,168,0.2));
}

.sheet-grid {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    padding-bottom: 0.5rem;
}

.sheet-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 1.25rem;
    min-width: 80px;
    background: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-md, 10px);
    color: var(--color-text-muted, #5A9A82);
    cursor: pointer;
    transition: all 0.12s ease;
    flex-shrink: 0;
}

.sheet-item:hover {
    background: var(--surface-overlay, #1E2D3D);
    border-color: var(--color-border-hover, rgba(126,196,168,0.2));
    color: var(--color-text, #C4F0E0);
}

.sheet-item.active {
    border-color: var(--color-primary, #04A469);
    background: rgba(4, 164, 105, 0.08);
    color: var(--color-primary, #04A469);
}

.sheet-item-icon {
    font-size: 1.8rem;
}

.sheet-item-label {
    font-size: 0.72rem;
    font-weight: 500;
    white-space: nowrap;
}

/* ═══ Shortcut add dialog ═══ */
.dialog-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 9000;
    display: flex;
    align-items: center;
    justify-content: center;
}

.shortcut-dialog {
    width: 380px;
    max-width: 90vw;
    background: var(--surface-base, #080D14);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
    overflow: hidden;
}

.dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
    background: var(--surface-raised, #0F1520);
}

.dialog-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text, white);
}

.dialog-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-overlay, #1E2D3D);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.12s ease;
}

.dialog-close:hover {
    color: var(--color-text, white);
}

.dialog-body {
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.dialog-label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--color-text-muted, #5A9A82);
}

.dialog-input {
    padding: 0.6rem 0.75rem;
    background: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text, #C4F0E0);
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.12s ease;
}

.dialog-input:focus {
    border-color: var(--color-primary, #04A469);
}

.dialog-input::placeholder {
    color: var(--color-text-dim, #3A5B4D);
}

.dialog-footer {
    display: flex;
    gap: 0.5rem;
    padding: 0.85rem 1.25rem;
    border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
    background: var(--surface-sunken, #060A10);
}

.dialog-btn-primary {
    padding: 0.5rem 1.25rem;
    background: var(--color-primary, #04A469);
    color: white;
    border: none;
    border-radius: var(--radius-sm, 6px);
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s ease;
}

.dialog-btn-primary:hover {
    background: var(--color-primary-hover, #059b62);
}

.dialog-btn-secondary {
    padding: 0.5rem 1.25rem;
    background: var(--surface-overlay, #1E2D3D);
    color: var(--color-text-muted, #5A9A82);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    font-size: 0.82rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.12s ease;
}

.dialog-btn-secondary:hover {
    background: var(--surface-raised, #0F1520);
    color: var(--color-text, white);
}

/* ═══ Transitions ═══ */

/* Bottom sheet */
.sheet-fade-enter-active { transition: opacity 0.15s ease; }
.sheet-fade-leave-active { transition: opacity 0.12s ease; }
.sheet-fade-enter-from,
.sheet-fade-leave-to { opacity: 0; }

.sheet-slide-enter-active { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.sheet-slide-leave-active { transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.sheet-slide-enter-from { transform: translateY(100%); }
.sheet-slide-leave-to { transform: translateY(100%); }

/* Dialog */
.dialog-fade-enter-active { transition: opacity 0.15s ease; }
.dialog-fade-leave-active { transition: opacity 0.12s ease; }
.dialog-fade-enter-from,
.dialog-fade-leave-to { opacity: 0; }

.dialog-zoom-enter-active { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease; }
.dialog-zoom-leave-active { transition: transform 0.15s ease, opacity 0.12s ease; }
.dialog-zoom-enter-from { transform: scale(0.95); opacity: 0; }
.dialog-zoom-leave-to { transform: scale(0.95); opacity: 0; }

.quick-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.25);
    z-index: 8500;
    display: flex;
    align-items: flex-start;
    justify-content: flex-end;
    padding: 1rem;
}

.quick-panel {
    width: 340px;
    max-width: calc(100vw - 2rem);
    background: var(--surface-base, #080D14);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-lg, 16px);
    box-shadow: var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.3));
    overflow: hidden;
}

.quick-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
    background: var(--surface-raised, #0F1520);
}

.quick-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--color-text, white);
}

.quick-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-overlay, #1E2D3D);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    font-size: 0.9rem;
    cursor: pointer;
}

.quick-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
    padding: 1rem;
}

.quick-item {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.85rem;
    background: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-md, 10px);
    color: var(--color-text, #C4F0E0);
    cursor: pointer;
    transition: all 0.12s ease;
    text-align: left;
}

.quick-item:hover {
    background: var(--surface-overlay, #1E2D3D);
    border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.quick-item-title {
    font-size: 0.85rem;
    font-weight: 600;
}

.quick-item-value {
    font-size: 0.8rem;
    color: var(--color-text-muted, #5A9A82);
}

:global([data-density='compact']) .dashboard {
    padding: 1rem 1.25rem 4.25rem;
    gap: 0.9rem;
}

:global([data-density='compact']) .dash-bookmarks {
    max-width: 680px;
}
</style>
