<template>
  <section
    class="rss-widget news-widget"
    :class="{
      'rss-widget--managed': managed,
      'rss-widget--canvas': canvas,
      'news-widget--ready': articles.length > 0,
      'news-widget--error': Boolean(error),
    }"
    :aria-busy="loading || loadingMore"
  >
    <header class="news-widget__header">
      <div class="news-widget__identity">
        <span class="news-widget__mark" aria-hidden="true"><Icon icon="solar:news-bold" /></span>
        <div>
          <h3>{{ copy.title }}</h3>
          <p>{{ copy.subtitle }}</p>
        </div>
      </div>

      <button
        type="button"
        class="news-icon-button"
        :data-state="refreshState"
        :disabled="loading || loadingMore"
        :aria-label="copy.refresh"
        :title="copy.refresh"
        @click="refreshNews"
      >
        <Icon :icon="loading ? 'svg-spinners:90-ring-with-bg' : 'solar:refresh-bold'" aria-hidden="true" />
      </button>
    </header>

    <div class="news-widget__controls">
      <div class="news-filter-grid">
        <label class="news-filter-field">
          <span>{{ copy.country }}</span>
          <select v-model="filters.country" :data-state="filterState" :aria-invalid="Boolean(error)" aria-describedby="news-filters-help" @change="applyFilters">
            <option value="">{{ copy.allCountries }}</option>
            <option v-for="country in countries" :key="country" :value="country">{{ countryName(country) }}</option>
          </select>
        </label>
        <label class="news-filter-field">
          <span>{{ copy.language }}</span>
          <select v-model="filters.language" :data-state="filterState" :aria-invalid="Boolean(error)" aria-describedby="news-filters-help" @change="applyFilters">
            <option value="">{{ copy.allLanguages }}</option>
            <option v-for="language in languages" :key="language" :value="language">{{ languageName(language) }}</option>
          </select>
        </label>
        <label class="news-filter-field">
          <span>{{ copy.category }}</span>
          <select v-model="filters.topic" :data-state="filterState" :aria-invalid="Boolean(error)" aria-describedby="news-filters-help" @change="applyFilters">
            <option value="">{{ copy.allCategories }}</option>
            <option v-for="topic in topics" :key="topic" :value="topic">{{ topicName(topic) }}</option>
          </select>
        </label>
      </div>
      <p id="news-filters-help" class="news-controls__helper" :class="{ 'is-error': Boolean(error) }" aria-live="polite">{{ error }}</p>
      <p v-if="filterFallback" class="news-filter-fallback" role="status">
        <Icon icon="solar:info-circle-linear" aria-hidden="true" /> {{ copy.filterFallback }}
      </p>
    </div>

    <div v-if="trendTopics.length" class="news-trends" :aria-label="copy.trending">
      <span class="news-trends__label"><Icon icon="solar:fire-bold" aria-hidden="true" /> {{ copy.trending }}</span>
      <div class="news-trends__items">
        <button
          v-for="trend in trendTopics"
          :key="trend.topic"
          type="button"
          class="news-trend"
          :class="{ 'is-active': filters.topic === trend.topic }"
          :aria-pressed="filters.topic === trend.topic"
          @click="selectTrend(trend.topic)"
        >
          {{ topicName(trend.topic) }}
        </button>
      </div>
    </div>

    <p v-if="isStale" class="news-notice" role="status">
      <Icon icon="solar:clock-circle-linear" aria-hidden="true" /> {{ copy.stale }}
    </p>

    <div v-if="loading && !articles.length" class="news-skeleton" aria-hidden="true">
      <div class="news-skeleton__lead"></div>
      <div class="news-skeleton__stack"><i></i><i></i><i></i><i></i></div>
    </div>

    <div v-else-if="error && !articles.length" class="news-empty news-empty--error" role="alert">
      <Icon icon="solar:danger-triangle-bold" aria-hidden="true" />
      <p>{{ error }}</p>
      <button type="button" class="news-action" data-state="error" @click="refreshNews">{{ copy.retry }}</button>
    </div>

    <div v-else-if="!articles.length" class="news-empty">
      <Icon icon="solar:document-text-linear" aria-hidden="true" />
      <strong>{{ copy.emptyTitle }}</strong>
      <p>{{ copy.emptyText }}</p>
      <button type="button" class="news-action" @click="clearFilters">{{ copy.clearFilters }}</button>
    </div>

    <template v-else>
      <div class="news-section-heading">
        <h4>{{ copy.latest }}</h4>
        <span v-if="lastUpdated">{{ copy.updated }} {{ formatDate(lastUpdated) }}</span>
      </div>

      <div class="news-layout">
        <article v-news-image="leadStory" class="news-story news-story--lead">
          <a
            v-if="leadStory.url || leadStory.id"
            class="news-story__link"
            :href="leadStory.url || '#'"
            target="_blank"
            rel="noopener noreferrer"
            @click="handleArticleClick($event, leadStory)"
          >
            <figure class="news-story__visual" :class="{ 'has-image': leadStory.thumbnail, 'is-loading': leadStory.imageRequested && !leadStory.imageFailed && !leadStory.thumbnail, 'is-unavailable': leadStory.imageFailed && !leadStory.thumbnail }">
              <img v-if="leadStory.thumbnail" :src="leadStory.thumbnail" :alt="leadStory.title" loading="eager" fetchpriority="high" decoding="async" @error="clearArticleImage(leadStory)">
              <span v-else class="news-story__fallback" aria-hidden="true"><Icon :icon="imageStateIcon(leadStory)" /></span>
            </figure>
            <div class="news-story__copy">
              <div class="news-story__meta"><span>{{ leadStory.publisher || '—' }}</span><span v-if="leadStory.publishedAt">{{ formatDate(leadStory.publishedAt) }}</span></div>
              <h5 class="news-story__title--lead">{{ leadStory.title }}</h5>
              <p v-if="leadStory.subtitle" class="news-story__summary">{{ leadStory.subtitle }}</p>
              <span v-if="leadStory.topics[0]" class="news-story__topic">{{ topicName(leadStory.topics[0]) }}</span>
            </div>
          </a>
          <div v-else class="news-story__link news-story__link--static">
            <figure class="news-story__visual" :class="{ 'has-image': leadStory.thumbnail, 'is-loading': leadStory.imageRequested && !leadStory.imageFailed && !leadStory.thumbnail, 'is-unavailable': leadStory.imageFailed && !leadStory.thumbnail }">
              <img v-if="leadStory.thumbnail" :src="leadStory.thumbnail" :alt="copy.noImage" loading="eager" fetchpriority="high" decoding="async" @error="clearArticleImage(leadStory)">
              <span v-else class="news-story__fallback" aria-hidden="true"><Icon :icon="imageStateIcon(leadStory)" /></span>
            </figure>
            <div class="news-story__copy">
              <div class="news-story__meta"><span>{{ leadStory.publisher || '—' }}</span><span v-if="leadStory.publishedAt">{{ formatDate(leadStory.publishedAt) }}</span></div>
              <h5 class="news-story__title--lead">{{ leadStory.title }}</h5>
              <p v-if="leadStory.subtitle" class="news-story__summary">{{ leadStory.subtitle }}</p>
              <span v-if="leadStory.topics[0]" class="news-story__topic">{{ topicName(leadStory.topics[0]) }}</span>
            </div>
          </div>
        </article>

        <div class="news-supporting-stories">
          <article v-for="article in supportingStories" :key="article.id" v-news-image="article" class="news-story news-story--supporting">
            <a
              v-if="article.url || article.id"
              class="news-story__link"
              :href="article.url || '#'"
              target="_blank"
              rel="noopener noreferrer"
              @click="handleArticleClick($event, article)"
            >
              <figure class="news-story__visual" :class="{ 'has-image': article.thumbnail, 'is-loading': article.imageRequested && !article.imageFailed && !article.thumbnail, 'is-unavailable': article.imageFailed && !article.thumbnail }">
                <img v-if="article.thumbnail" :src="article.thumbnail" :alt="article.title" loading="lazy" decoding="async" @error="clearArticleImage(article)">
                <span v-else class="news-story__fallback" aria-hidden="true"><Icon :icon="imageStateIcon(article)" /></span>
              </figure>
              <div class="news-story__copy">
                <div class="news-story__meta"><span>{{ article.publisher || '—' }}</span><span v-if="article.publishedAt">{{ formatDate(article.publishedAt) }}</span></div>
                <h5>{{ article.title }}</h5>
                <span v-if="article.topics[0]" class="news-story__topic">{{ topicName(article.topics[0]) }}</span>
              </div>
            </a>
            <div v-else class="news-story__link news-story__link--static">
              <figure class="news-story__visual" :class="{ 'has-image': article.thumbnail, 'is-loading': article.imageRequested && !article.imageFailed && !article.thumbnail, 'is-unavailable': article.imageFailed && !article.thumbnail }">
                <img v-if="article.thumbnail" :src="article.thumbnail" :alt="copy.noImage" loading="lazy" decoding="async" @error="clearArticleImage(article)">
                <span v-else class="news-story__fallback" aria-hidden="true"><Icon :icon="imageStateIcon(article)" /></span>
              </figure>
              <div class="news-story__copy">
                <div class="news-story__meta"><span>{{ article.publisher || '—' }}</span><span v-if="article.publishedAt">{{ formatDate(article.publishedAt) }}</span></div>
                <h5>{{ article.title }}</h5>
                <span v-if="article.topics[0]" class="news-story__topic">{{ topicName(article.topics[0]) }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>

      <div class="news-widget__footer">
        <p v-if="error" class="news-inline-error" role="status"><Icon icon="solar:info-circle-linear" aria-hidden="true" /> {{ error }}</p>
        <button
          v-if="!canvas && meta.hasMore"
          type="button"
          class="news-action news-action--more"
          :data-state="loadingMore ? 'loading' : (lastRequestSucceeded ? 'success' : 'default')"
          :disabled="loadingMore"
          @click="loadMore"
        >
          <Icon v-if="loadingMore" icon="svg-spinners:90-ring-with-bg" aria-hidden="true" />
          <Icon v-else icon="solar:alt-arrow-down-linear" aria-hidden="true" />
          {{ loadingMore ? copy.loadingMore : copy.more }}
        </button>
        <p v-if="canvas && loadingMore" class="news-load-status" role="status">
          <Icon icon="svg-spinners:90-ring-with-bg" aria-hidden="true" /> {{ copy.loadingMore }}
        </p>
      </div>
      <div v-if="canvas && meta.hasMore" ref="loadMoreSentinel" class="news-load-sentinel" aria-hidden="true"></div>
    </template>
  </section>
</template>

<script>
import { Icon } from '@iconify/vue';
import {
  NEWS_COUNTRIES,
  NEWS_LANGUAGES,
  NEWS_TOPICS,
  deriveTrendTopics,
} from '../services/FreeNewsService.js';
import freeNewsService from '../services/FreeNewsService.js';
import useI18nStore from '../stores/useI18nStore.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import { WIDGET_COST, createWidgetRuntime } from '../composables/useWidgetRuntime.js';

const NEWS_REFRESH_MS = 5 * 60 * 1000;
const FILTER_DELAY_MS = 180;
const WIDGET_POLICY = Object.freeze({
  key: 'rss',
  cost: WIDGET_COST.MEDIUM,
  usesNetwork: true,
  ttlMs: NEWS_REFRESH_MS,
  stale: true,
  refresh: 'visible, foreground, manual, filter-change, load-more',
});

export default {
  name: 'RssWidget',
  components: { Icon },
  directives: {
    newsImage: {
      mounted(element, binding) {
        const load = () => binding.instance?.loadArticleImage(binding.value);
        if (typeof IntersectionObserver === 'undefined') {
          load();
          return;
        }
        element.__newsImageObserver = new IntersectionObserver((entries) => {
          if (!entries.some(entry => entry.isIntersecting)) return;
          element.__newsImageObserver?.disconnect();
          load();
        }, { rootMargin: '240px 0px' });
        element.__newsImageObserver.observe(element);
      },
      beforeUnmount(element) {
        element.__newsImageObserver?.disconnect();
        delete element.__newsImageObserver;
      },
    },
  },
  props: {
    managed: { type: Boolean, default: false },
    canvas: { type: Boolean, default: false },
  },
  data() {
    const i18n = useI18nStore();
    const locale = this.normalizeLocale(i18n.locale);
    return {
      i18n,
      countries: NEWS_COUNTRIES,
      languages: NEWS_LANGUAGES,
      topics: NEWS_TOPICS,
      filters: {
        country: '',
        language: NEWS_LANGUAGES.includes(locale) ? locale : '',
        topic: '',
      },
      articles: [],
      trendTopics: [],
      meta: { hasMore: false, nextCursor: '' },
      loading: false,
      loadingMore: false,
      error: '',
      filterFallback: false,
      isStale: false,
      lastUpdated: '',
      lastRequestSucceeded: false,
      requestController: null,
      requestSequence: 0,
      widgetRuntime: null,
      loadMoreObserver: null,
      loadedCursors: new Set(),
      filterTimer: null,
      imageGeneration: 0,
      widgetPolicy: WIDGET_POLICY,
    };
  },
  computed: {
    copy() {
      return getWidgetCopy(this.i18n.locale).rssWidget;
    },
    leadStory() {
      return this.articles[0] || {};
    },
    supportingStories() {
      return this.canvas ? this.articles.slice(1) : this.articles.slice(1, 5);
    },
    refreshState() {
      if (this.loading) return 'loading';
      if (this.error) return 'error';
      return this.lastRequestSucceeded ? 'success' : 'default';
    },
    filterState() {
      return this.error ? 'error' : (this.lastRequestSucceeded ? 'success' : 'default');
    },
  },
  mounted() {
    this.widgetRuntime = createWidgetRuntime(this, WIDGET_POLICY, {
      onVisible: () => this.loadNewsWhenVisible(),
      onFocus: () => this.loadNewsWhenVisible(),
      onHidden: () => this.abortRequest(),
    });
    this.$nextTick(() => this.widgetRuntime?.mount());
    this.$nextTick(() => this.setupLoadMoreObserver());
  },
  beforeUnmount() {
    if (this.filterTimer) clearTimeout(this.filterTimer);
    this.abortRequest();
    freeNewsService.cancelQueuedArticleDetails();
    this.widgetRuntime?.dispose();
    this.loadMoreObserver?.disconnect();
    this.loadMoreObserver = null;
  },
  methods: {
    normalizeLocale(locale) {
      return String(locale || '').toLowerCase().split('-')[0];
    },
    loadNewsWhenVisible(options = {}) {
      if (!this.widgetRuntime?.canRun()) return false;
      return this.widgetRuntime.runWhenVisible(
        () => this.loadNews({ force: Boolean(options.force) }),
        // A filter change must bypass the widget visibility TTL, but it does
        // not need to bypass the FreeNews result cache. Keeping those two
        // decisions separate makes switching back to a recent filter instant.
        { force: Boolean(options.runtimeForce ?? options.force) },
      );
    },
    async loadNews({ force = false, append = false } = {}) {
      if (document.visibilityState === 'hidden') return;
      const cursor = append ? this.meta.nextCursor : '';
      if (append && (!cursor || this.loadedCursors.has(cursor))) return;
      if (append) this.loadedCursors.add(cursor);
      else {
        this.loadedCursors.clear();
        this.imageGeneration += 1;
        freeNewsService.cancelQueuedArticleDetails();
      }
      const requestId = ++this.requestSequence;
      this.abortRequest();
      this.requestController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      if (append) this.loadingMore = true;
      else this.loading = true;
      this.error = '';
      if (!append) this.filterFallback = false;

      try {
        const result = await freeNewsService.fetchNews({
          ...this.filters,
          cursor,
        }, {
          force,
          signal: this.requestController?.signal,
        });
        if (requestId !== this.requestSequence) return;

        const nextArticles = append
          ? [...this.articles, ...result.articles.filter(article => !this.articles.some(item => item.id === article.id))]
          : result.articles;
        this.articles = nextArticles;
        this.trendTopics = deriveTrendTopics(nextArticles);
        this.meta = result.meta;
        this.isStale = result.isStale;
        if (!append) this.filterFallback = Boolean(result.filterFallback);
        this.lastUpdated = new Date().toISOString();
        this.lastRequestSucceeded = true;
        if (!append) this.loadArticleImage(nextArticles[0]);
        this.$nextTick(() => this.setupLoadMoreObserver());
      } catch (error) {
        if (append) this.loadedCursors.delete(cursor);
        if (error?.name === 'AbortError') return;
        if (requestId !== this.requestSequence) return;
        this.error = error instanceof Error ? error.message : String(error || 'No se pudieron cargar las noticias.');
        this.lastRequestSucceeded = false;
      } finally {
        if (requestId === this.requestSequence) {
          this.requestController = null;
          this.loading = false;
          this.loadingMore = false;
        }
      }
    },
    abortRequest() {
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
    },
    refreshNews() {
      this.loadNewsWhenVisible({ force: true });
    },
    loadMore() {
      if (!this.meta.hasMore || !this.meta.nextCursor || this.loadingMore) return;
      this.loadNews({ append: true });
    },
    setupLoadMoreObserver() {
      if (!this.canvas || !this.$refs.loadMoreSentinel || typeof IntersectionObserver === 'undefined') return;
      this.loadMoreObserver?.disconnect();
      this.loadMoreObserver = new IntersectionObserver((entries) => {
        if (entries.some(entry => entry.isIntersecting)) this.loadMore();
      }, { rootMargin: '0px' });
      this.loadMoreObserver.observe(this.$refs.loadMoreSentinel);
    },
    applyFilters() {
      if (this.filterTimer) clearTimeout(this.filterTimer);
      this.filterTimer = setTimeout(() => {
        this.filterTimer = null;
        this.loadNewsWhenVisible({ runtimeForce: true });
      }, FILTER_DELAY_MS);
    },
    selectTrend(topic) {
      this.filters.topic = this.filters.topic === topic ? '' : topic;
      this.applyFilters();
    },
    clearFilters() {
      this.filters = { country: '', language: '', topic: '' };
      this.loadNewsWhenVisible({ force: true });
    },
    async handleArticleClick(event, article) {
      // Listing responses may omit original_url. Keep the card interactive and
      // resolve the URL on demand instead of rendering a dead news item.
      if (article?.url) return;
      event.preventDefault();
      if (!article?.id || article.opening) return;

      article.opening = true;
      try {
        const detail = await freeNewsService.fetchArticleDetails(article.id);
        if (!detail?.url) {
          this.error = 'La fuente no proporcionó un enlace para esta noticia.';
          return;
        }
        article.url = detail.url;
        await this.openResolvedArticle(detail.url);
      } catch (error) {
        if (error?.name !== 'AbortError') this.error = 'No se pudo abrir esta noticia. Inténtalo de nuevo.';
      } finally {
        article.opening = false;
      }
    },
    async openResolvedArticle(url) {
      const tabs = globalThis.browser?.tabs || globalThis.chrome?.tabs;
      if (typeof tabs?.create === 'function') {
        try {
          await tabs.create({ url });
          return;
        } catch (_) {
          // Fall through to same-tab navigation when an extension API is unavailable.
        }
      }
      globalThis.location.assign(url);
    },
    async loadArticleImage(article) {
      if (!article?.id || article.thumbnail || article.imageRequested) return;
      article.imageRequested = true;
      const generation = this.imageGeneration;
      try {
        const detail = await freeNewsService.fetchArticleDetails(article.id);
        if (generation !== this.imageGeneration) return;
        if (detail?.url) article.url = detail.url;
        if (detail?.thumbnail) article.thumbnail = detail.thumbnail;
        else article.imageFailed = true;
      } catch (_) {
        // A missing image must not prevent the article itself from rendering.
        if (generation === this.imageGeneration) article.imageFailed = true;
      }
    },
    clearArticleImage(article) {
      if (!article) return;
      article.thumbnail = '';
      article.imageFailed = true;
    },
    countryName(country) {
      try {
        return new Intl.DisplayNames([this.i18n.locale || 'en'], { type: 'region' }).of(country) || country;
      } catch (_) {
        return country;
      }
    },
    languageName(language) {
      try {
        return new Intl.DisplayNames([this.i18n.locale || 'en'], { type: 'language' }).of(language) || language;
      } catch (_) {
        return language;
      }
    },
    topicName(topic) {
      return String(topic || '').replace(/-/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
    },
    imageStateIcon(article) {
      return article?.imageRequested && !article?.imageFailed
        ? 'svg-spinners:90-ring-with-bg'
        : 'solar:gallery-remove-linear';
    },
    formatDate(value) {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return new Intl.DateTimeFormat(this.i18n.locale || 'en', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(date);
    },
  },
};
</script>

<style scoped>
/* Hallmark · component: news feed · genre: editorial · theme: Midori News
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (46–50)
 * pre-emit critique: P5 H4 E5 S5 R4 V4
 */
.news-widget {
  color: var(--news-ink);
  font-family: var(--font-news-display);
  min-width: 0;
  padding: var(--news-space-4);
  background: var(--news-surface);
}

.rss-widget--managed { min-height: 0; }
.rss-widget--canvas { max-width: none; margin-inline: auto; }
.news-widget--ready { min-height: 0; }

.news-widget__header,
.news-widget__identity,
.news-filter-grid,
.news-trends,
.news-trends__items,
.news-section-heading,
.news-widget__footer,
.news-story__meta,
.news-action,
.news-icon-button {
  display: flex;
  align-items: center;
}

.news-widget__header { justify-content: space-between; gap: var(--news-space-3); }
.news-widget__identity { min-width: 0; gap: var(--news-space-2); }
.news-widget__identity h3,
.news-widget__identity p,
.news-section-heading h4,
.news-story h5,
.news-story p { margin: 0; }
.news-widget__identity h3 { font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.02em; overflow-wrap: anywhere; }
.news-widget__identity p { color: var(--news-ink-muted); font-size: var(--font-size-xs); line-height: var(--line-height-normal); }
.news-widget__mark,
.news-icon-button { width: 2.75rem; height: 2.75rem; flex: 0 0 auto; justify-content: center; }
.news-widget__mark { display: grid; place-items: center; border-radius: var(--news-radius-sm); color: var(--news-accent-ink); background: var(--news-accent); }

.news-icon-button,
.news-action,
.news-trend {
  border: 1px solid var(--news-rule);
  border-radius: var(--news-radius-sm);
  background: var(--news-surface-strong);
  color: var(--news-ink);
  cursor: pointer;
  font-family: var(--font-news-display);
  font-weight: var(--font-weight-medium);
  transition: background-color var(--news-dur-short) var(--news-ease-out), border-color var(--news-dur-short) var(--news-ease-out), color var(--news-dur-short) var(--news-ease-out), transform var(--news-dur-fast) var(--news-ease-out);
}

.news-icon-button:focus-visible,
.news-action:focus-visible,
.news-trend:focus-visible,
.news-search-field input:focus-visible,
.news-filter-field select:focus-visible,
.news-story__link:focus-visible { outline: 2px solid var(--news-focus); outline-offset: 2px; }
.news-icon-button:active,
.news-action:active,
.news-trend:active { transform: translateY(1px); }
.news-icon-button:disabled,
.news-action:disabled { cursor: not-allowed; opacity: 0.55; }
.news-icon-button[data-state='loading'],
.news-action[data-state='loading'] { color: var(--news-accent); }
.news-icon-button[data-state='error'],
.news-action[data-state='error'] { border-color: var(--news-danger); color: var(--news-danger); }
.news-icon-button[data-state='success'],
.news-action[data-state='success'] { border-color: var(--news-success); }

.news-widget__controls { display: grid; gap: var(--news-space-2); margin-block: var(--news-space-4); }
.news-search-field { min-height: 2.75rem; display: flex; align-items: center; gap: var(--news-space-2); padding-inline: var(--news-space-3); border: 1px solid var(--news-rule); border-radius: var(--news-radius-sm); background: var(--news-surface-strong); color: var(--news-ink-muted); }
.news-search-field:focus-within { border-color: var(--news-rule-strong); }
.news-search-field.is-error { border-color: var(--news-danger); background: var(--news-danger-soft); }
.news-search-field input { min-width: 0; width: 100%; border: 0; outline: 2px solid transparent; outline-offset: 1px; background: transparent; color: var(--news-ink); font: inherit; }
.news-search-field input::placeholder { color: var(--news-ink-muted); }
.news-search-field input[data-state='loading'] { color: var(--news-ink-muted); }
.news-search-field input[data-state='success'] { color: var(--news-ink); }
.news-search-field__spinner { display: grid; place-items: center; color: var(--news-accent); }

.news-filter-grid { align-items: stretch; gap: var(--news-space-2); }
.news-controls__helper { min-height: 1lh; margin: 0; color: var(--news-ink-muted); font-size: var(--font-size-xs); }
.news-controls__helper.is-error { color: var(--news-danger); }
.news-filter-field { min-width: 0; flex: 1 1 0; display: grid; gap: var(--news-space-1); color: var(--news-ink-muted); font-family: var(--font-news-meta); font-size: var(--font-size-xs); }
.news-filter-field select { min-width: 0; min-height: 2.75rem; padding-inline: var(--news-space-2); border: 1px solid var(--news-rule); outline: 2px solid transparent; outline-offset: 1px; border-radius: var(--news-radius-sm); background: var(--news-surface-strong); color: var(--news-ink); font: inherit; }
.news-filter-field select[data-state='error'] { border-color: var(--news-danger); }
.news-filter-field select[data-state='success'] { border-color: var(--news-rule-strong); }
.news-search-field input:disabled,
.news-filter-field select:disabled { cursor: not-allowed; opacity: 0.55; }

.news-trends { gap: var(--news-space-2); padding-block: var(--news-space-2); border-block: 1px solid var(--news-rule); overflow: auto; }
.news-trends__label { display: inline-flex; align-items: center; gap: var(--news-space-1); flex: 0 0 auto; color: var(--news-ink-muted); font-family: var(--font-news-meta); font-size: var(--font-size-xs); white-space: nowrap; }
.news-trends__items { gap: var(--news-space-1); }
.news-trend { min-height: 2rem; padding-inline: var(--news-space-2); font-size: var(--font-size-xs); white-space: nowrap; }
.news-trend.is-active { border-color: var(--news-accent); background: var(--news-accent-soft); color: var(--news-accent-ink); }

.news-notice,
.news-filter-fallback,
.news-inline-error { display: flex; align-items: center; gap: var(--news-space-1); margin: var(--news-space-2) 0 0; color: var(--news-ink-muted); font-size: var(--font-size-xs); }
.news-inline-error { color: var(--news-danger); }
.news-section-heading { justify-content: space-between; gap: var(--news-space-2); margin-block: var(--news-space-4) var(--news-space-2); }
.news-section-heading h4 { font-size: var(--font-size-sm); letter-spacing: -0.01em; }
.news-section-heading span { color: var(--news-ink-muted); font-family: var(--font-news-meta); font-size: var(--font-size-xs); text-align: end; }

.news-layout { display: grid; align-items: start; gap: var(--news-space-2); }
.news-supporting-stories { display: grid; gap: var(--news-space-2); }
.news-story { align-self: start; min-width: 0; border: 1px solid var(--news-rule); border-radius: var(--news-radius); background: var(--news-surface-strong); overflow: clip; }
.news-story--supporting { content-visibility: visible; }
.news-story__link { display: block; min-width: 0; height: auto; color: inherit; text-decoration: none; }
.news-story__link--static { cursor: default; }
.news-story__visual { display: grid; place-items: center; min-width: 0; aspect-ratio: 16 / 8; margin: 0; overflow: clip; background: var(--news-art); color: var(--news-accent-ink); }
.news-story__visual.is-unavailable { block-size: 4.25rem; aspect-ratio: auto; background: var(--news-surface-muted); }
.news-story__visual img { width: 100%; height: 100%; object-fit: cover; }
.news-story__fallback { display: grid; place-items: center; inline-size: 2.5rem; block-size: 2.5rem; border: 1px solid var(--news-rule); border-radius: 50%; color: var(--news-ink-muted); }
.news-story__fallback svg { inline-size: 1.25rem; block-size: 1.25rem; }
.news-story__visual.is-loading .news-story__fallback { color: var(--news-accent); }
.news-story__copy { align-content: start; min-width: 0; display: grid; gap: var(--news-space-2); padding: var(--news-space-3); }
.news-story__meta { justify-content: space-between; gap: var(--news-space-2); color: var(--news-ink-muted); font-family: var(--font-news-meta); font-size: var(--font-size-xs); }
.news-story__meta span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.news-story__meta span:last-child { flex: 0 0 auto; }
.news-story h5 { color: var(--news-ink); font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); line-height: var(--line-height-tight); letter-spacing: -0.015em; overflow-wrap: anywhere; }
.news-story__title--lead { font-size: var(--font-size-xl); }
.news-story__summary { display: -webkit-box; overflow: hidden; color: var(--news-ink-muted); font-size: var(--font-size-sm); line-height: var(--line-height-normal); -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.news-story__topic { width: fit-content; max-width: 100%; overflow: hidden; color: var(--news-ink-muted); font-family: var(--font-news-meta); font-size: var(--font-size-xs); text-overflow: ellipsis; white-space: nowrap; }

.news-widget__footer { justify-content: flex-end; min-height: 2.75rem; gap: var(--news-space-2); margin-top: var(--news-space-3); }
.news-load-status { display: inline-flex; align-items: center; gap: var(--news-space-1); margin: 0; color: var(--news-ink-muted); font-size: var(--font-size-xs); }
.news-load-sentinel { block-size: 1px; inline-size: 100%; }
.news-action { min-height: 2.75rem; gap: var(--news-space-1); justify-content: center; padding-inline: var(--news-space-3); white-space: nowrap; }
.news-action--more { background: var(--news-accent); border-color: var(--news-accent); color: var(--news-accent-ink); }

.news-skeleton { display: grid; gap: var(--news-space-2); margin-top: var(--news-space-4); }
.news-skeleton__lead,
.news-skeleton__stack i { display: block; border-radius: var(--news-radius-sm); background: var(--news-surface-muted); }
.news-skeleton__lead { min-height: 16rem; }
.news-skeleton__stack { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--news-space-2); }
.news-skeleton__stack i { min-height: 5.5rem; }
.news-empty { min-height: 9rem; display: grid; place-content: center; justify-items: center; gap: var(--news-space-2); padding: var(--news-space-4); color: var(--news-ink-muted); text-align: center; }
.news-empty strong { color: var(--news-ink); }
.news-empty p { max-width: 38ch; margin: 0; font-size: var(--font-size-sm); }
.news-empty--error { color: var(--news-danger); }

@media (hover: hover) and (pointer: fine) {
  .news-icon-button:hover,
  .news-action:hover,
  .news-trend:hover { border-color: var(--news-rule-strong); background: var(--news-surface-muted); }
  .news-search-field:hover { background: var(--news-surface-muted); }
  .news-filter-field select:hover:not(:disabled) { background: var(--news-surface-muted); }
  .news-action--more:hover { background: var(--news-accent); border-color: var(--news-accent); transform: translateY(-1px); }
  .news-story__link:not(.news-story__link--static):hover h5 { color: var(--news-accent); }
}

@media (min-width: 40rem) {
  .news-layout { grid-template-columns: minmax(0, 1.08fr) minmax(0, 1fr); }
  .news-supporting-stories { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .news-story--lead .news-story__visual { aspect-ratio: 16 / 10; }
  .news-story--supporting .news-story__visual { aspect-ratio: 16 / 7; }
  .news-story--supporting .news-story__copy { padding: var(--news-space-2); gap: var(--news-space-1); }
  .news-story--supporting h5 { font-size: var(--font-size-sm); }
}

@media (min-width: 58rem) {
  .rss-widget--canvas { padding: var(--news-space-5); }
  .rss-widget--canvas .news-layout { display: block; column-count: 4; column-gap: var(--news-space-2); }
  .rss-widget--canvas .news-supporting-stories { display: contents; }
  .rss-widget--canvas .news-story { display: inline-block; inline-size: 100%; break-inside: avoid-column; margin-block-end: var(--news-space-2); }
  .rss-widget--canvas .news-story--lead .news-story__visual { aspect-ratio: 16 / 9; }
  .rss-widget--canvas .news-story--supporting .news-story__visual { aspect-ratio: 16 / 9; }
  .rss-widget--canvas .news-story--supporting .news-story__copy { padding: var(--news-space-3); gap: var(--news-space-2); }
  .rss-widget--canvas .news-story--supporting h5 { font-size: var(--font-size-base); }
}

@media (max-width: 26rem) {
  .news-widget { padding: var(--news-space-3); }
  .news-filter-grid { display: grid; grid-template-columns: minmax(0, 1fr); }
  .news-widget__identity p { display: none; }
  .news-section-heading { align-items: flex-start; flex-direction: column; }
  .news-section-heading span { text-align: start; }
}

@media (max-width: 42rem) {
  .rss-widget--canvas { padding: var(--news-space-3); }
  .rss-widget--canvas .news-filter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .rss-widget--canvas .news-filter-field:last-child { grid-column: span 2; }
  .rss-widget--canvas .news-widget__header { align-items: flex-start; }
  .rss-widget--canvas .news-story__visual { aspect-ratio: 16 / 9; }
  .rss-widget--canvas .news-story__copy { padding: var(--news-space-3); }
}

@media (max-width: 26rem) {
  .rss-widget--canvas .news-filter-grid { grid-template-columns: minmax(0, 1fr); }
  .rss-widget--canvas .news-filter-field:last-child { grid-column: auto; }
}

@media (prefers-reduced-motion: reduce) {
  .news-icon-button,
  .news-action,
  .news-trend { transition-duration: 0.01ms; }
}
</style>
