<template>
    <div class="containerInfo">
        <div class="top">
            <b-setting :style="{ color: textColor }" />
        </div>
        <div class="content">
            <div class="contentTop">
                <Logo />
            </div>

            <div class="contentMain">
                <div class="search">
                    <ZSearchWidget searchTarget="same" :logo="img" />
                </div>

                <div class="shortcuts">
                    <ZMarkedWidget theme="dark" :small="false" />
                </div>
            </div>
        </div>
        <div class="news">
            <h2>Latest News</h2>
            <div class="containerNewsCard">
                <template v-for="(item, index) in news">
                    <a class="itemNewCard" @click="openLink(item.link)">
                        <div class="itemTop">
                            <img :src="item.thumbnail" />
                        </div>
                        <div class="itemContainer">
                            <h3 class="itemTitle">{{ item.title }}</h3>
                            <p class="itemDescription">{{ item.description }}</p>
                        </div>
                        <div class="itemFooter">
                            <span>{{ item.pubDate }}</span>
                        </div>
                    </a>
                </template>
            </div>
        </div>
    </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useTabStore from '../stores/useTabStore';
export default {
    data() {
        return {
            news: [],
            tab: useTabStore(),
        }
    },

    components: {
        BSetting: defineAsyncComponent(() => import('../components/BSetting.vue')),
        Logo: defineAsyncComponent(() => import('../components/Logo.vue')),
        ZSearchWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZSearchWidget)),
        ZMarkedWidget: defineAsyncComponent(() => import('zen-wdg').then(m => m.ZMarkedWidget))
    },

    created() {
        this.loadNews()
    },

    methods: {
        async loadNews() {
            const feedData = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/rss.xml`)
                .then(res => res.json())
            this.feedTitle = feedData.feed.title;
            this.news = feedData.items;
        },

        openLink(url) {
            this.tab.openLinkTab(url)
        }
    }
}
</script>

<style scoped>
.containerInfo {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: start;
    padding: 1rem 2rem;
    gap: 2rem;
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
    height: 500px;
    min-width: 480px;
    max-width: 900px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: start;
    gap: 1rem;
    padding: 3rem 0 7rem 0;
}

.contentTop {
    width: 100%;
    height: 35%;
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
    max-width: 900px;
}

.news {
    width: 100%;
    min-width: 200px;
    max-width: 1400px;
    background: var(--bg-glass);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 2rem;
    border-radius: 1rem;
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.containerNewsCard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
    gap: 1rem;
}

.itemNewCard {
    padding: .8rem;
    background-color: var(--bg-color);
    color: var(--text-color);
    text-decoration: none;
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    gap: .7rem;
    cursor: pointer;
}

.itemTop {
    width: 100%;
    border-radius: .7rem;
    overflow: hidden;
    height: 200px;
}

.itemTop>img {
    width: 100%;
    height: 100%;
}

.itemContainer {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: .4rem;
}

.itemContainer>.itemTitle {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    width: 100%;
    display: block;
    font-size: .9rem;
    font-weight: bold;
}

.itemContainer>.itemDescription {
    display: -webkit-box;
    -webkit-line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: normal;
    line-height: 1.5;
    max-height: calc(1.5em * 4);
    /* fuerza altura máxima de 4 líneas */
    color: #ccc;
    font-size: 0.8rem;
}

.itemFooter {
    background-color: var(--bg-secondary);
    padding: 1rem;
    border-radius: .6rem;
    display: flex;
    flex-direction: column;
}
</style>