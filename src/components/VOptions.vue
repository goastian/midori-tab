<template>
    <div class="container-options">
        <div class="options">
            <b-setting />
            <b-login />
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
export default {
    components: {
        BSetting: defineAsyncComponent(() => import('../components/BSetting.vue')),
        BLogin: defineAsyncComponent(() => import('../components/BLogin.vue')),
    }
}
</script>

<style scoped>
.container-options {
    display: flex;
    gap: 1rem;
    /* Eliminado backdrop-filter - componente pequeño */
    background-color: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    color: white;
    box-shadow: 0 8px 32px 0 rgba(31, 38, 135, 0.2);
    padding: .3rem;
    border-radius: .6rem;
}

.options {
    width: 100%;
    background-color: var(--bg-blur);
    display: flex;
    gap: 1rem;
    align-items: center;
    padding: .3rem .8rem;
    border-radius: .5rem;
    box-shadow: 0 0 .4rem var(--border-color);
}
</style>