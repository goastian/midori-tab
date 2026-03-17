<template>
    <div class="containerMin">
        <div class="content">
            <div class="contentTop">
                <Logo />
            </div>
            
            <div class="contentMain">
                <div class="search">
                    <ZSearchWidget :searchTarget="tab.openLink" />
                </div>

                <div class="shortcuts">
                    <ZMarkedWidget :theme="tab.theme" small useStorage :open="tab.openLink"/>
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
import img from '../assets/favicon.png';
import useTabStore from '../stores/useTabStore';
import useCommandsStore from '../stores/useCommandsStore';
export default {
    data() {
        return {
            img,
            tab: useTabStore(),
            commandsStore: useCommandsStore(),
        }
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
    },
    components: {
        VOptions: defineAsyncComponent(() => import('../components/VOptions.vue')),
        Logo: defineAsyncComponent(() => import('../components/Logo.vue')),
        ZSearchWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZSearchWidget)),
        ZMarkedWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZMarkedWidget)),
    },

    created() {
    },
}
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
    height: 90%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 5rem;
    gap: 3rem;
}

.contentTop {
    width: 100%;
    height: 10%;
    display: flex;
    justify-content: end;
    align-items: center;
}

.contentMain {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    min-width: 200px;
    max-width: 800px;
}

.contentMain > .search {
    width: 100%;
    z-index: 2;
}

.contentMain > .shortcuts {
    max-width: 800px;
    display: flex;
    justify-content: start;
    align-items: start;
}

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