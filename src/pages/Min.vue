<template>
    <div class="dashboard">
        <!-- ═══ Top bar: settings icon top-right ═══ -->
        <header class="dash-topbar">
            <div class="topbar-left"></div>
            <Logo />
            <div class="topbar-right">
                <button class="settings-btn" @click="openSettings" title="Settings">
                    <Settings :size="20" :stroke-width="1.5" />
                </button>
            </div>
        </header>

        <!-- ═══ Search (always first, not draggable) ═══ -->
        <section v-if="widgetsStore.enabled.search" class="dash-search">
            <SearchBox :searchTarget="tab.openLink" />
        </section>

        <!-- ═══ Bookmarks row (always second, not draggable) ═══ -->
        <section v-if="widgetsStore.enabled.bookmarks" class="dash-bookmarks">
            <BookmarkGrid :openTarget="tab.openLink" />
        </section>

        <!-- ═══ Optional widgets grid — draggable ═══ -->
        <section v-if="gridWidgets.length" class="dash-grid">
            <div
                v-for="(key, index) in gridWidgets"
                :key="key"
                :ref="el => setSlotRef(el, index)"
                class="grid-slot"
                :class="{
                    dragging: drag.active && drag.fromIndex === index,
                    'drop-before': drag.active && drag.overIndex === index && drag.fromIndex > index,
                    'drop-after': drag.active && drag.overIndex === index && drag.fromIndex < index,
                    'span-full': key === 'rss',
                }"
            >
                <div
                    class="drag-handle"
                    @pointerdown.prevent="onPointerDown(index, $event)"
                >
                    <span class="handle-dots">⋮⋮</span>
                </div>
                <component
                    :is="widgetComponentMap[key]"
                    v-bind="widgetProps[key] || {}"
                />
            </div>
        </section>

        <!-- ═══ Fixed UI ═══ -->
        <div class="bottom-bar">
            <b-login />
        </div>

        <div class="cmd-hint">
            <kbd>{{ cmdKey }}</kbd> {{ cmdLabel }}
        </div>

        <!-- Drag ghost overlay -->
        <Teleport to="body">
            <div
                v-if="drag.active"
                class="drag-ghost"
                :style="ghostStyle"
            >
                <div class="ghost-label">{{ dragLabel }}</div>
            </div>
        </Teleport>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import { Settings } from 'lucide-vue-next';
import useTabStore from '../stores/useTabStore';
import useCommandsStore from '../stores/useCommandsStore';
import useWidgetsStore from '../stores/useWidgetsStore';

/** Widget keys that live in the grid (everything except search & bookmarks). */
const GRID_KEYS = ['rss', 'calendar', 'notes', 'todo'];

/** Human-readable labels for drag ghost. */
const LABELS = {
    rss: 'RSS',
    calendar: 'Calendario',
    notes: 'Notas',
    todo: 'Tareas',
};

export default {
    data() {
        return {
            tab: useTabStore(),
            commandsStore: useCommandsStore(),
            widgetsStore: useWidgetsStore(),
            slotRefs: [],
            drag: {
                active: false,
                fromIndex: -1,
                overIndex: -1,
                x: 0,
                y: 0,
                startX: 0,
                startY: 0,
            },
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
        gridWidgets() {
            return this.widgetsStore.order.filter(
                k => GRID_KEYS.includes(k) && this.widgetsStore.enabled[k]
            );
        },
        widgetComponentMap() {
            return {
                rss: 'RssWidget',
                calendar: 'CalendarWidget',
                notes: 'NotesWidget',
                todo: 'TodoWidget',
            };
        },
        widgetProps() {
            return {};
        },
        ghostStyle() {
            return {
                left: `${this.drag.x - 60}px`,
                top: `${this.drag.y - 20}px`,
            };
        },
        dragLabel() {
            const key = this.gridWidgets[this.drag.fromIndex];
            return LABELS[key] || key;
        },
    },

    methods: {
        setSlotRef(el, index) {
            if (el) this.slotRefs[index] = el;
        },

        /** Pointer-based drag: start tracking on the handle only. */
        onPointerDown(index, event) {
            this.drag.active = true;
            this.drag.fromIndex = index;
            this.drag.overIndex = index;
            this.drag.startX = event.clientX;
            this.drag.startY = event.clientY;
            this.drag.x = event.clientX;
            this.drag.y = event.clientY;

            document.addEventListener('pointermove', this.onPointerMove);
            document.addEventListener('pointerup', this.onPointerUp);
            document.body.style.userSelect = 'none';
        },

        onPointerMove(event) {
            if (!this.drag.active) return;
            this.drag.x = event.clientX;
            this.drag.y = event.clientY;

            // Detect which slot the pointer is over
            for (let i = 0; i < this.slotRefs.length; i++) {
                const el = this.slotRefs[i];
                if (!el) continue;
                const rect = el.getBoundingClientRect();
                if (
                    event.clientX >= rect.left &&
                    event.clientX <= rect.right &&
                    event.clientY >= rect.top &&
                    event.clientY <= rect.bottom
                ) {
                    this.drag.overIndex = i;
                    break;
                }
            }
        },

        onPointerUp() {
            document.removeEventListener('pointermove', this.onPointerMove);
            document.removeEventListener('pointerup', this.onPointerUp);
            document.body.style.userSelect = '';

            const { fromIndex, overIndex } = this.drag;
            if (fromIndex !== overIndex && fromIndex >= 0 && overIndex >= 0) {
                const fromKey = this.gridWidgets[fromIndex];
                const toKey = this.gridWidgets[overIndex];
                const fullOrder = this.widgetsStore.order;
                const fromFull = fullOrder.indexOf(fromKey);
                const toFull = fullOrder.indexOf(toKey);
                if (fromFull >= 0 && toFull >= 0) {
                    this.widgetsStore.reorder(fromFull, toFull);
                }
            }

            this.drag.active = false;
            this.drag.fromIndex = -1;
            this.drag.overIndex = -1;
            this.slotRefs = [];
        },

        /** Opens the settings panel. */
        openSettings() {
            this.tab.updateState();
        },
    },

    beforeUnmount() {
        document.removeEventListener('pointermove', this.onPointerMove);
        document.removeEventListener('pointerup', this.onPointerUp);
    },

    components: {
        Settings,
        BLogin: defineAsyncComponent(() => import('../components/BLogin.vue')),
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
    padding: 2rem 2rem 4rem;
    gap: 1.25rem;
    font-size: 13px;
    box-sizing: border-box;
}

/* ── Top bar: 3-column layout (spacer / logo / settings) ── */
.dash-topbar {
    width: 100%;
    max-width: 720px;
    display: grid;
    grid-template-columns: 48px 1fr 48px;
    align-items: center;
}

.dash-topbar > :nth-child(2) {
    justify-self: center;
}

.topbar-left {
    /* empty spacer to balance the grid */
}

.topbar-right {
    justify-self: end;
}

.settings-btn {
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-muted, #5A9A82);
    cursor: pointer;
    transition: all 0.15s ease;
}

.settings-btn:hover {
    background: var(--surface-overlay, #1E2D3D);
    color: var(--color-text, #C4F0E0);
    border-color: var(--color-border-hover, rgba(126,196,168,0.2));
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

/* ── Widget grid: 2 columnas para widgets opcionales ── */
.dash-grid {
    width: 100%;
    max-width: 720px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
    align-items: start;
}

@media (max-width: 600px) {
    .dash-grid {
        grid-template-columns: 1fr;
    }
}

/* ── Grid slot: contenedor individual de widget ── */
.grid-slot {
    position: relative;
    border-radius: var(--radius-md, 10px);
    transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
}

.grid-slot.span-full {
    grid-column: 1 / -1;
}

.grid-slot.dragging {
    opacity: 0.35;
    transform: scale(0.96);
}

.grid-slot.drop-before,
.grid-slot.drop-after {
    box-shadow: 0 0 0 2px var(--color-primary, #04A469);
    border-radius: var(--radius-md, 10px);
}

/* ── Drag handle: visible on hover ── */
.drag-handle {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm, 6px);
    background: var(--surface-overlay, rgba(30,45,61,0.85));
    cursor: grab;
    opacity: 0;
    transition: opacity 0.15s ease;
    touch-action: none;
}

.grid-slot:hover .drag-handle {
    opacity: 1;
}

.drag-handle:active {
    cursor: grabbing;
    background: var(--color-primary, #04A469);
}

.handle-dots {
    font-size: 0.8rem;
    letter-spacing: 2px;
    color: var(--color-text-muted, #5A9A82);
    user-select: none;
    pointer-events: none;
}

.drag-handle:active .handle-dots {
    color: white;
}

/* ── Drag ghost (follows pointer) ── */
.drag-ghost {
    position: fixed;
    z-index: 99999;
    pointer-events: none;
    padding: 0.4rem 1rem;
    background: var(--color-primary, #04A469);
    color: white;
    font-size: 0.8rem;
    font-weight: 600;
    border-radius: var(--radius-sm, 6px);
    box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    white-space: nowrap;
}

/* ── Fixed bottom bar ── */
.bottom-bar {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 100;
}

/* ── Command palette hint ── */
.cmd-hint {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #5A9A82);
    opacity: 0.5;
    transition: opacity var(--transition-fast, 0.1s ease);
}

.cmd-hint:hover {
    opacity: 0.8;
}

.cmd-hint kbd {
    padding: 0.15rem 0.4rem;
    background: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: monospace;
    color: var(--color-text-secondary, #7EC4A8);
}
</style>