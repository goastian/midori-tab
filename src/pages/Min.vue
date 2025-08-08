<template>
    <div class="containerMin">
        <div class="top">
            <b-setting :style="{ color: textColor }" />
        </div>
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
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import img from '../assets/favicon.png';
import useTabStore from '../stores/useTabStore';
export default {
    data() {
        return {
            img,
            tab: useTabStore()
        }
    },
    components: {
        BSetting: defineAsyncComponent(() => import('../components/BSetting.vue')),
        Logo: defineAsyncComponent(() => import('../components/Logo.vue')),
        ZSearchWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZSearchWidget)),
        ZMarkedWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZMarkedWidget)),
    },

    mounted() {

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

.top {
    width: 100%;
    height: 10%;
    display: flex;
    justify-content: end;
    align-items: center;
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
</style>