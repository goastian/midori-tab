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
                    <ZMarkedWidget theme="dark" :small="true" useStorage />
                </div>
            </div>
        </div>

        <div class="news">
            <h2>Latest News</h2>
            <div class="containerNewsCard">
                <template v-for="(item, index) in news">
                    <a class="news-item" @click="openLink(item.link)">
                        <div class="news-background">
                            <img :src="item.thumbnail" />
                        </div>
                        <div class="news-info">
                            <span class="news-date">{{ item.pubDate }}</span>
                            <h3 class="news-title">{{ item.title }}</h3>
                            <p class="news-description">{{ item.description }}</p>
                        </div>
                    </a>
                </template>
            </div>
        </div>
    </div>
</template>

<script>
import img from '../assets/favicon.png';
import { defineAsyncComponent } from 'vue';
import useTabStore from '../stores/useTabStore';
export default {
    data() {
        return {
            news: [],
            tab: useTabStore(),
            img,
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
            if (this.feedTitle == 'BBC News') {
                this.news = feedData.items.map(it => {
                    const updatedUrl = it.thumbnail.replace(/\/(\d{2,4})\//, `/1920/`);

                    console.log("Original:", it.thumbnail);
                    console.log("Mejorado:", updatedUrl);
                    return {
                        ...it,
                        thumbnail: updatedUrl
                    };
                });
            }
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
    min-width: 480px;
    max-width: 900px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: start;
    gap: 1rem;
    margin-bottom: 4rem;
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
    backdrop-filter: blur(10px) saturate(180%);
    -webkit-backdrop-filter: blur(10px) saturate(180%);
    background-color: var(--bg-glass);
    border: 1px solid rgba(255, 255, 255, 0.3);
    padding: 2rem;
    border-radius: 1rem;
    color: var(--text-color);
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

.containerNewsCard {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
}

.news-item {
    padding: .8rem;
    backdrop-filter: blur(10px) saturate(180%);
    -webkit-backdrop-filter: blur(10px) saturate(180%);
    background-color: var(--bg-glass);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: var(--text-color);
    text-decoration: none;
    border-radius: 1rem;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    gap: .4rem;
    transition: .8s;
}

.news-item:hover {
    background-color: var(--bg-blur);
    transform: scale(1.03);
}

.news-background > img {
    width: 100%;
    border-radius: .8rem;
}

.news-info {
    display: flex;
    flex-direction: column;
    gap: .4rem;
}

.news-date {
    font-size: .7rem;
    color: var(--text-color-secondary);
}

.news-title {
    font-size: 1rem;
}

.news-description {
    width: 100%;
    font-size: .8rem;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;  
    overflow: hidden;
    text-overflow: ellipsis;
}

</style>