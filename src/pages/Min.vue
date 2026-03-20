<template>
    <div class="containerMin">
        <div class="content">
            <div class="contentTop">
                <Logo />
            </div>

            <!-- Dynamic widget area with drag & drop -->
            <div class="widgets-area">
                <div
                    v-for="(key, index) in widgetsStore.activeWidgets"
                    :key="key"
                    class="widget-slot"
                    :class="{
                        dragging: dragIndex === index,
                        'drag-over': dragOverIndex === index && dragIndex !== index,
                        'full-width': key === 'search' || key === 'bookmarks' || key === 'rss',
                    }"
                    draggable="true"
                    @dragstart="onDragStart(index, $event)"
                    @dragover.prevent="onDragOver(index)"
                    @dragleave="onDragLeave"
                    @drop="onDrop(index)"
                    @dragend="onDragEnd"
                >
                    <div class="widget-drag-handle" :title="'Arrastra para mover'">⋮⋮</div>
                    <component
                        :is="widgetComponentMap[key]"
                        v-bind="widgetProps[key] || {}"
                    />
                </div>
            </div>
        </div>

        <div class="bottom">
            <v-options />
        </div>

        <div class="cmd-hint">
            <kbd>{{ cmdKey }}</kbd> {{ cmdLabel }}
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useTabStore from '../stores/useTabStore';
import useCommandsStore from '../stores/useCommandsStore';
import useWidgetsStore from '../stores/useWidgetsStore';

export default {
    data() {
        return {
            tab: useTabStore(),
            commandsStore: useCommandsStore(),
            widgetsStore: useWidgetsStore(),
            dragIndex: null,
            dragOverIndex: null,
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
        /** Map of widget key → component name for dynamic rendering. */
        widgetComponentMap() {
            return {
                search: 'SearchBox',
                bookmarks: 'BookmarkGrid',
                rss: 'RssWidget',
                calendar: 'CalendarWidget',
                notes: 'NotesWidget',
                todo: 'TodoWidget',
            };
        },
        /** Props passed to each widget component. */
        widgetProps() {
            return {
                search: { searchTarget: this.tab.openLink },
                bookmarks: { openTarget: this.tab.openLink },
            };
        },
    },

    methods: {
        /** Drag & drop handlers for reordering widgets. */
        onDragStart(index, event) {
            this.dragIndex = index;
            event.dataTransfer.effectAllowed = 'move';
        },
        onDragOver(index) {
            this.dragOverIndex = index;
        },
        onDragLeave() {
            this.dragOverIndex = null;
        },
        onDrop(toIndex) {
            if (this.dragIndex !== null && this.dragIndex !== toIndex) {
                // Convert visible indices to order-array indices
                const activeKeys = this.widgetsStore.activeWidgets;
                const fromKey = activeKeys[this.dragIndex];
                const toKey = activeKeys[toIndex];
                const fullOrder = this.widgetsStore.order;
                const fromFull = fullOrder.indexOf(fromKey);
                const toFull = fullOrder.indexOf(toKey);
                this.widgetsStore.reorder(fromFull, toFull);
            }
            this.dragIndex = null;
            this.dragOverIndex = null;
        },
        onDragEnd() {
            this.dragIndex = null;
            this.dragOverIndex = null;
        },
    },

    components: {
        VOptions: defineAsyncComponent(() => import('../components/VOptions.vue')),
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
.containerMin {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 2rem;
    font-size: 13px;
}

.bottom {
    position: fixed;
    bottom: 1rem;
    left: 1rem;
    z-index: 100;
}

.content {
    width: 100%;
    min-width: 400px;
    max-width: 800px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 3rem;
    gap: 1.5rem;
}

.contentTop {
    width: 100%;
    display: flex;
    justify-content: end;
    align-items: center;
}

/* ── Widgets area with flex-wrap for side-by-side small widgets ── */
.widgets-area {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    width: 100%;
    min-width: 200px;
    max-width: 800px;
    align-items: flex-start;
}

/* ── Individual widget slot (draggable container) ── */
.widget-slot {
    position: relative;
    flex: 1 1 280px;
    min-width: 280px;
    transition: transform 0.15s ease, opacity 0.15s ease;
}

.widget-slot.full-width {
    flex-basis: 100%;
    min-width: 100%;
}

.widget-slot.dragging {
    opacity: 0.4;
    transform: scale(0.97);
}

.widget-slot.drag-over {
    border-radius: var(--radius-md, 10px);
    box-shadow: 0 0 0 2px var(--color-primary, #04A469);
}

/* ── Drag handle ── */
.widget-drag-handle {
    position: absolute;
    top: 6px;
    left: 6px;
    z-index: 5;
    font-size: 0.65rem;
    letter-spacing: 1px;
    color: var(--color-text-dim, #3A5B4D);
    cursor: grab;
    opacity: 0;
    transition: opacity var(--transition-fast, 0.1s ease);
    user-select: none;
    padding: 0.15rem 0.3rem;
    border-radius: 3px;
    background: var(--surface-overlay, #1E2D3D);
}

.widget-slot:hover .widget-drag-handle {
    opacity: 1;
}

.widget-drag-handle:active {
    cursor: grabbing;
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