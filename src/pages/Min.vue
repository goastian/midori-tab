<template>
    <div class="dashboard">
        <!-- ═══ Settings button: fixed top-right ═══ -->
        <button class="settings-btn" @click="openSettings" title="Settings">
            <Settings :size="20" :stroke-width="1.5" />
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
                <component :is="widgetComponentMap[key]" />
            </div>
        </section>

        <!-- ═══ Bottom action bar ═══ -->
        <div class="bottom-actions">
            <button class="action-btn" @click="showShortcutDialog = true">
                <Plus :size="14" :stroke-width="2" />
                <span>Shortcut</span>
            </button>
            <button class="action-btn" @click="showWidgetSheet = !showWidgetSheet">
                <Minus v-if="showWidgetSheet" :size="14" :stroke-width="2" />
                <Plus v-else :size="14" :stroke-width="2" />
                <span>Widget</span>
            </button>
        </div>

        <!-- ═══ Command palette hint ═══ -->
        <div class="cmd-hint">
            <kbd>{{ cmdKey }}</kbd> {{ cmdLabel }}
        </div>

        <!-- ═══ Widget bottom sheet ═══ -->
        <Teleport to="body">
            <Transition name="sheet-fade">
                <div v-if="showWidgetSheet" class="sheet-overlay" @click="showWidgetSheet = false"></div>
            </Transition>
            <Transition name="sheet-slide">
                <div v-if="showWidgetSheet" class="widget-sheet">
                    <div class="sheet-header">
                        <span class="sheet-title">Add a New Widget</span>
                        <button class="sheet-close" @click="showWidgetSheet = false">✕</button>
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

        <!-- ═══ Shortcut add dialog ═══ -->
        <Teleport to="body">
            <Transition name="dialog-fade">
                <div v-if="showShortcutDialog" class="dialog-overlay" @click="showShortcutDialog = false">
                    <Transition name="dialog-zoom">
                        <div v-if="showShortcutDialog" class="shortcut-dialog" @click.stop>
                            <div class="dialog-header">
                                <span class="dialog-title">Add Bookmark to Speed Dial</span>
                                <button class="dialog-close" @click="showShortcutDialog = false">✕</button>
                            </div>
                            <div class="dialog-body">
                                <label class="dialog-label">
                                    <span>Address</span>
                                    <input
                                        v-model="shortcutForm.url"
                                        class="dialog-input"
                                        type="url"
                                        placeholder="https://example.com"
                                        @keydown.enter="submitShortcut"
                                        ref="shortcutUrlInput"
                                    />
                                </label>
                                <label class="dialog-label">
                                    <span>Title</span>
                                    <input
                                        v-model="shortcutForm.title"
                                        class="dialog-input"
                                        type="text"
                                        placeholder="My Website"
                                        @keydown.enter="submitShortcut"
                                    />
                                </label>
                            </div>
                            <div class="dialog-footer">
                                <button class="dialog-btn-primary" @click="submitShortcut">Add</button>
                                <button class="dialog-btn-secondary" @click="showShortcutDialog = false">Cancel</button>
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
import { Settings, Plus, Minus } from 'lucide-vue-next';
import useTabStore from '../stores/useTabStore';
import useCommandsStore from '../stores/useCommandsStore';
import useWidgetsStore from '../stores/useWidgetsStore';

/** Widget keys for the bottom sheet (everything except search & bookmarks). */
const GRID_KEYS = ['rss', 'calendar', 'notes', 'todo'];

/** Widget metadata for the bottom sheet picker. */
const WIDGET_META = [
    { key: 'calendar', icon: '📅', label: 'Calendar' },
    { key: 'notes', icon: '📝', label: 'Sticky Note' },
    { key: 'todo', icon: '✅', label: 'Tasks' },
    { key: 'rss', icon: '📰', label: 'Feeds' },
];

export default {
    data() {
        return {
            tab: useTabStore(),
            commandsStore: useCommandsStore(),
            widgetsStore: useWidgetsStore(),
            showWidgetSheet: false,
            showShortcutDialog: false,
            shortcutForm: { url: '', title: '' },
        };
    },

    computed: {
        cmdKey() {
            const s = this.commandsStore.shortcuts?.openCommandPalette;
            if (!s) return '⌘K';
            const parts = [];
            if (s.ctrl) parts.push(navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl');
            if (s.alt) parts.push('Alt');
            if (s.shift) parts.push('Shift');
            parts.push(s.key?.toUpperCase() || 'K');
            return parts.join('+');
        },
        cmdLabel() {
            return 'Command Palette';
        },
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
        Plus,
        Minus,
        Logo: defineAsyncComponent(() => import('../components/Logo.vue')),
        SearchBox: defineAsyncComponent(() => import('../components/SearchBox.vue')),
        BookmarkGrid: defineAsyncComponent(() => import('../components/BookmarkGrid.vue')),
        RssWidget: defineAsyncComponent(() => import('../components/RssWidget.vue')),
        CalendarWidget: defineAsyncComponent(() => import('../components/CalendarWidget.vue')),
        NotesWidget: defineAsyncComponent(() => import('../components/NotesWidget.vue')),
        TodoWidget: defineAsyncComponent(() => import('../components/TodoWidget.vue')),
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

/* ── Command palette hint ── */
.cmd-hint {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.7rem;
    color: var(--color-text-muted, #5A9A82);
    opacity: 0.4;
    transition: opacity 0.12s ease;
    z-index: 10;
}

.cmd-hint:hover {
    opacity: 0.8;
}

.cmd-hint kbd {
    padding: 0.12rem 0.35rem;
    background: var(--surface-raised, rgba(15,21,32,0.7));
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: 4px;
    font-size: 0.65rem;
    font-family: monospace;
    color: var(--color-text-secondary, #7EC4A8);
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
</style>