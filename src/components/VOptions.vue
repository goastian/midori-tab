<template>
    <div class="container-options">
        <div class="options">
            <b-setting />
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
export default {
    components: {
        BSetting: defineAsyncComponent(() => import('../components/BSetting.vue')),
    }
}
</script>

<style scoped>
.container-options {
    display: flex;
    gap: 1rem;
    background-color: var(--surface-raised, #0F1520);
    border: 1px solid var(--color-border, rgba(126,196,168,0.1));
    color: var(--color-text, white);
    padding: .3rem;
    border-radius: var(--radius-md, 10px);
}

.options {
    width: 100%;
    background-color: var(--surface-overlay, #1E2D3D);
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: .3rem .8rem;
    border-radius: var(--radius-sm, 6px);
}
</style>