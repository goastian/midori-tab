<template>
  <div v-if="showSpeedDials || showAds" class="bookmark-grid" :style="containerStyle">
    <nav v-if="showSpeedDials" class="tabs-bar" :aria-label="i18n.$t('bookmarks.categories')">
      <div
        v-for="category in categories"
        :key="category"
        class="tab-item"
        :class="{ active: category === activeTab }"
      >
        <button class="tab-btn" type="button" @click="activeTab = category">{{ category }}</button>
        <button
          v-if="categories.length > 1 && showDeleteButton"
          class="tab-delete"
          type="button"
          :title="i18n.$t('bookmarks.deleteCategory')"
          :aria-label="`${i18n.$t('bookmarks.deleteCategory')}: ${category}`"
          @click.stop="pendingCategoryDelete = category"
        >
          <DashboardIcon name="close" :size="11" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <button
        v-if="showAddButton"
        class="tab-add"
        type="button"
        :title="i18n.$t('bookmarks.addCategory')"
        :aria-label="i18n.$t('bookmarks.addCategory')"
        @click="openCategoryEditor"
      >+</button>
    </nav>

    <div v-if="pendingCategoryDelete" class="delete-confirmation" role="alert">
      <span>{{ formatCopy('bookmarks.deleteCategoryConfirm', { category: pendingCategoryDelete }) }}</span>
      <div>
        <button type="button" @click="pendingCategoryDelete = ''">{{ i18n.$t('bookmarks.cancel') }}</button>
        <button type="button" class="is-danger" @click="confirmDeleteCategory">{{ i18n.$t('bookmarks.delete') }}</button>
      </div>
    </div>

    <div
      class="speed-dial-grid"
      :class="[
        `speed-dial-grid--${speedDialSize}`,
        `speed-dial-grid--title-${titleMode}`,
      ]"
      :style="gridStyle"
      :aria-busy="showAds && !adRequestComplete"
    >
      <article
        v-for="(bookmark, index) in visibleBookmarks"
        :key="`${activeTab}-${bookmark.url}-${index}`"
        class="speed-dial-card"
      >
        <div v-if="showDeleteButton" class="card-actions">
          <button
            class="card-action-btn"
            type="button"
            :title="i18n.$t('bookmarks.edit')"
            :aria-label="`${i18n.$t('bookmarks.edit')}: ${bookmark.title}`"
            @click="openBookmarkEditor(index)"
          >
            <DashboardIcon name="edit" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button
            class="card-action-btn card-action-btn--danger"
            type="button"
            :title="i18n.$t('bookmarks.delete')"
            :aria-label="`${i18n.$t('bookmarks.delete')}: ${bookmark.title}`"
            @click="pendingBookmarkDelete = index"
          >
            <DashboardIcon name="trash" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>

        <a
          :href="bookmark.url"
          class="speed-dial-link"
          :target="openTarget === 'Self Tab' ? '_self' : '_blank'"
          :rel="openTarget === 'Self Tab' ? undefined : 'noopener noreferrer'"
        >
          <span class="speed-dial-icon" aria-hidden="true">
            <img
              v-if="!faviconFailed(bookmark)"
              :src="getFaviconUrl(bookmark)"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="markFaviconFailed(bookmark)"
            />
            <span v-else class="speed-dial-initial">{{ bookmarkInitial(bookmark) }}</span>
          </span>
          <span class="speed-dial-title" :title="bookmark.title">{{ bookmark.title }}</span>
        </a>

        <div v-if="pendingBookmarkDelete === index" class="card-confirmation" role="alert">
          <span>{{ i18n.$t('bookmarks.deleteConfirm') }}</span>
          <div>
            <button type="button" @click="pendingBookmarkDelete = -1">{{ i18n.$t('bookmarks.cancel') }}</button>
            <button type="button" class="is-danger" @click="confirmDeleteBookmark(index)">{{ i18n.$t('bookmarks.delete') }}</button>
          </div>
        </div>
      </article>

      <article
        v-if="showAds && (!adRequestComplete || adsStore.hasAd)"
        ref="sponsoredCard"
        class="speed-dial-card sponsored-card"
        :class="{
          'sponsored-card--pending': !adsStore.hasAd,
          'sponsored-card--disclosed': requiresDisclosure,
        }"
        :role="requiresDisclosure ? 'complementary' : undefined"
        :aria-label="sponsoredAriaLabel"
        :aria-hidden="!adsStore.hasAd"
      >
        <template v-if="adsStore.hasAd">
          <span v-if="requiresDisclosure" class="sponsored-badge" :title="sponsoredBadge">{{ sponsoredBadge }}</span>
          <button
            v-if="requiresDisclosure"
            type="button"
            class="sponsored-info"
            :title="i18n.$t('ads.whyTitle')"
            :aria-label="i18n.$t('ads.whyTitle')"
            :aria-expanded="showTransparency"
            @click.prevent.stop="showTransparency = !showTransparency"
          >i</button>
          <button
            v-else-if="showDeleteButton"
            type="button"
            class="house-dismiss"
            :title="i18n.$t('bookmarks.removeShortcut')"
            :aria-label="i18n.$t('bookmarks.removeShortcut')"
            @click.prevent.stop="dismissSponsored"
          >
            <DashboardIcon name="close" :size="12" :stroke-width="2" aria-hidden="true" />
          </button>

          <a
            :href="ad.destination_url"
            class="speed-dial-link sponsored-link"
            target="_blank"
            :rel="sponsoredRel"
            @click.prevent="openSponsored"
          >
            <span
              class="speed-dial-icon sponsored-icon"
              :class="{ 'sponsored-icon--fallback': iconFailed }"
              aria-hidden="true"
            >
              <img
                v-if="!iconFailed"
                :src="adIconUrl"
                alt=""
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                @error="iconFailed = true"
              />
              <span v-else>{{ sponsoredInitial }}</span>
            </span>
            <span class="speed-dial-title" :title="ad.title">{{ ad.title }}</span>
          </a>

          <div
            v-if="requiresDisclosure && showTransparency"
            class="transparency-panel"
            role="dialog"
            :aria-label="i18n.$t('ads.whyTitle')"
            @click.stop
          >
            <strong>{{ i18n.$t('ads.whyTitle') }}</strong>
            <p>{{ i18n.$t('ads.whyCopy') }}</p>
            <p v-if="frequencyCap > 0" class="frequency-copy">{{ frequencyCopy }}</p>

            <div v-if="ad.transparency?.feedback_enabled" class="feedback-actions">
              <span>{{ i18n.$t('ads.feedbackPrompt') }}</span>
              <div>
                <button type="button" :disabled="feedbackPending" @click="submitFeedback(true)">
                  {{ i18n.$t('ads.relevant') }}
                </button>
                <button type="button" :disabled="feedbackPending" @click="submitFeedback(false)">
                  {{ i18n.$t('ads.notRelevant') }}
                </button>
              </div>
              <small v-if="feedbackMessage" role="status">{{ feedbackMessage }}</small>
            </div>

            <button type="button" class="dismiss-action" @click="dismissSponsored">
              {{ i18n.$t('ads.dismiss') }}
            </button>
          </div>
        </template>

        <div v-else class="sponsored-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
        </div>
      </article>

      <article
        v-if="showSpeedDials && showAddButton && currentBookmarks.length < speedDialLimit"
        class="speed-dial-card speed-dial-card--add"
      >
        <button class="speed-dial-link add-link" type="button" @click="openBookmarkEditor()">
          <span class="speed-dial-icon add-icon" aria-hidden="true">+</span>
          <span class="speed-dial-title">{{ i18n.$t('bookmarks.add') }}</span>
        </button>
      </article>
    </div>

    <Teleport to="body">
      <Transition name="editor-fade">
        <div v-if="editorMode" class="editor-overlay" @click="closeEditor">
          <form class="dial-editor" @click.stop @submit.prevent="saveEditor">
            <header>
              <div>
                <span class="editor-eyebrow">Speed Dial</span>
                <h3>{{ editorTitle }}</h3>
              </div>
              <button type="button" class="editor-close" :aria-label="i18n.$t('bookmarks.cancel')" @click="closeEditor">
                <DashboardIcon name="close" :size="16" :stroke-width="1.8" aria-hidden="true" />
              </button>
            </header>

            <label v-if="editorMode === 'category'">
              <span>{{ i18n.$t('bookmarks.categoryName') }}</span>
              <input v-model.trim="draft.category" type="text" maxlength="40" required autofocus />
            </label>
            <template v-else>
              <label>
                <span>{{ i18n.$t('dashboard.shortcutsDialog.name') }}</span>
                <input v-model.trim="draft.title" type="text" maxlength="80" required autofocus />
              </label>
              <label>
                <span>{{ i18n.$t('dashboard.shortcutsDialog.address') }}</span>
                <input v-model.trim="draft.url" type="text" inputmode="url" maxlength="2048" placeholder="https://" required />
              </label>
            </template>

            <p v-if="editorError" class="editor-error" role="alert">{{ editorError }}</p>
            <footer>
              <button type="button" class="editor-button editor-button--secondary" @click="closeEditor">
                {{ i18n.$t('bookmarks.cancel') }}
              </button>
              <button type="submit" class="editor-button editor-button--primary">
                {{ i18n.$t('bookmarks.save') }}
              </button>
            </footer>
          </form>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import useAdsStore from '../stores/useAdsStore.js';
import {
  AD_VIEWABILITY_THRESHOLD,
  createAdViewabilityTracker,
} from '../services/AdViewability.js';
import { createAdInteractionGuard } from '../services/AdInteractionGuard.js';
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';
import {
  getSpeedDialMetrics,
  requiresPaidDisclosure,
  resolveResponsiveSpeedDialColumns,
} from '../utils/startPageSettings.js';
import DashboardIcon from './icons/DashboardIcon.vue';

const STORAGE_KEY = 'midori_bookmarks';
const CATEGORIES_KEY = 'midori_bookmark_categories';
const DEFAULT_CATEGORIES = ['Personal', 'Travel', 'Web3'];
const DEFAULT_BOOKMARKS = {
  Personal: [
    { title: 'Support Midori', url: 'https://astian.org/community', domain: 'astian.org' },
    { title: 'Amazon', url: 'https://amzn.to/47IiNIO', domain: 'amazon.com' },
    { title: 'Kayak', url: 'https://www.kayak.com/flights', domain: 'kayak.com' },
    { title: 'AliExpress', url: 'https://www.aliexpress.com', domain: 'aliexpress.com' },
    { title: 'eBay', url: 'https://www.ebay.com', domain: 'ebay.com' },
  ],
  Travel: [
    { title: 'Kayak Hotels', url: 'https://www.kayak.com/hotels', domain: 'kayak.com' },
    { title: 'Kayak Cars', url: 'https://www.kayak.com/cars', domain: 'kayak.com' },
  ],
  Web3: [
    { title: 'Midori Wallet', url: 'https://wallet.astian.org', domain: 'wallet.astian.org' },
    { title: 'Astian', url: 'https://astian.org', domain: 'astian.org' },
  ],
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_BOOKMARKS));
}

export default {
  name: 'BookmarkGrid',
  components: { DashboardIcon },
  emits: [
    'sponsored-impression',
    'sponsored-click',
    'sponsored-feedback',
    'accidental-click-blocked',
  ],
  props: {
    openTarget: { type: String, default: 'Self Tab' },
    showSpeedDials: { type: Boolean, default: true },
    showAds: { type: Boolean, default: true },
    speedDialSize: { type: String, default: 'tiny' },
    speedDialColumns: { type: Number, default: 7 },
    speedDialLimit: { type: Number, default: 8 },
    titleMode: { type: String, default: 'show' },
    showDeleteButton: { type: Boolean, default: true },
    showAddButton: { type: Boolean, default: true },
  },
  data() {
    return {
      i18n: useI18nStore(),
      adsStore: useAdsStore(),
      bookmarks: cloneDefaults(),
      categories: [...DEFAULT_CATEGORIES],
      activeTab: DEFAULT_CATEGORIES[0],
      failedFavicons: {},
      layoutWidth: typeof window === 'undefined' ? 1080 : Math.max(0, window.innerWidth - 40),
      editorMode: '',
      editingIndex: -1,
      editorError: '',
      draft: { title: '', url: '', category: '' },
      pendingBookmarkDelete: -1,
      pendingCategoryDelete: '',
      adRequested: false,
      adRequestComplete: false,
      adObserver: null,
      adViewability: null,
      clickGuard: createAdInteractionGuard(),
      iconFailed: false,
      showTransparency: false,
      feedbackPending: false,
      feedbackState: '',
      performanceObserver: null,
      layoutShift: 0,
      performanceReportTimer: null,
      performanceReported: false,
      resizeFrame: null,
      layoutObserver: null,
    };
  },
  computed: {
    currentBookmarks() {
      return Array.isArray(this.bookmarks[this.activeTab]) ? this.bookmarks[this.activeTab] : [];
    },
    visibleBookmarks() {
      return this.showSpeedDials ? this.currentBookmarks.slice(0, this.speedDialLimit) : [];
    },
    effectiveColumns() {
      return resolveResponsiveSpeedDialColumns({
        configuredColumns: this.speedDialColumns,
        availableWidth: this.layoutWidth,
        size: this.speedDialSize,
      });
    },
    dialMetrics() {
      return getSpeedDialMetrics(this.speedDialSize);
    },
    containerStyle() {
      const gap = 12;
      const configuredWidth = this.speedDialSize === 'fit'
        ? 1080
        : (this.effectiveColumns * (this.dialMetrics.width + gap)) - gap;
      return { maxWidth: `${Math.min(1080, configuredWidth)}px` };
    },
    gridStyle() {
      return {
        '--dial-height': `${this.dialMetrics.height}px`,
        '--dial-icon-size': `${this.dialMetrics.icon}px`,
        gridTemplateColumns: `repeat(${this.effectiveColumns}, minmax(0, 1fr))`,
      };
    },
    ad() {
      return this.adsStore.currentAd || {};
    },
    requiresDisclosure() {
      return requiresPaidDisclosure(this.ad);
    },
    adIconUrl() {
      return this.ad.icon_url || this.ad.image_url || '';
    },
    sponsoredBadge() {
      return this.ad.sponsor_label || this.i18n.$t('ads.badge') || 'Ad';
    },
    sponsoredInitial() {
      return String(this.ad.title || 'A').trim().charAt(0).toUpperCase() || 'A';
    },
    sponsoredAriaLabel() {
      if (!this.adsStore.hasAd) return undefined;
      if (!this.requiresDisclosure) return this.ad.title || undefined;
      const label = this.i18n.$t('ads.label') || 'Sponsored content';
      return this.ad.title ? `${label}: ${this.ad.title}` : label;
    },
    sponsoredRel() {
      return this.requiresDisclosure
        ? 'noopener noreferrer nofollow sponsored'
        : 'noopener noreferrer';
    },
    frequencyCap() {
      return Number(this.ad.transparency?.frequency_cap_per_day || 0);
    },
    frequencyCopy() {
      return this.formatCopy('ads.frequencyCap', { count: this.frequencyCap });
    },
    feedbackMessage() {
      if (this.feedbackState === 'sent') return this.i18n.$t('ads.feedbackThanks');
      if (this.feedbackState === 'error') return this.i18n.$t('ads.feedbackError');
      return '';
    },
    editorTitle() {
      if (this.editorMode === 'category') return this.i18n.$t('bookmarks.addCategory');
      return this.editingIndex >= 0
        ? this.i18n.$t('bookmarks.edit')
        : this.i18n.$t('dashboard.shortcutsDialog.title');
    },
  },
  watch: {
    showAds(enabled) {
      if (!enabled) {
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
        return;
      }
      if (!this.adsStore.hasAd) {
        this.adRequested = false;
        this.adRequestComplete = false;
      }
      this.$nextTick(() => {
        this.setupPerformanceObserver();
        this.setupAdObserver();
      });
    },
    'adsStore.currentAd'(ad) {
      this.iconFailed = false;
      this.showTransparency = false;
      this.feedbackState = '';
      this.clickGuard.reset();
      if (this.showAds && ad) {
        this.$nextTick(() => {
          this.setupAdObserver();
          this.schedulePerformanceReport();
        });
      } else {
        this.teardownAdObserver();
      }
    },
  },
  mounted() {
    void this.loadBookmarks();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.handleResize, { passive: true });
    }
    this.$nextTick(() => {
      this.setupLayoutObserver();
      this.setupPerformanceObserver();
      this.setupAdObserver();
    });
  },
  beforeUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleResize);
      if (this.resizeFrame) window.cancelAnimationFrame(this.resizeFrame);
    }
    if (this.layoutObserver) {
      this.layoutObserver.disconnect();
      this.layoutObserver = null;
    }
    this.reportPerformance();
    this.teardownAdObserver();
    this.teardownPerformanceObserver();
    void this.flushBookmarks();
  },
  methods: {
    formatCopy(key, replacements = {}) {
      return Object.entries(replacements).reduce(
        (copy, [name, value]) => String(copy).replace(`{${name}}`, String(value)),
        this.i18n.$t(key),
      );
    },
    handleResize() {
      if (this.resizeFrame || typeof window === 'undefined') return;
      this.resizeFrame = window.requestAnimationFrame(() => {
        this.resizeFrame = null;
        this.measureLayoutWidth();
      });
    },
    measureLayoutWidth() {
      const parentWidth = this.$el?.parentElement?.clientWidth;
      this.layoutWidth = Math.max(
        0,
        Number(parentWidth) || (typeof window === 'undefined' ? 1080 : window.innerWidth - 40),
      );
    },
    setupLayoutObserver() {
      this.measureLayoutWidth();
      if (typeof ResizeObserver === 'undefined') return;
      const target = this.$el?.parentElement || this.$el;
      if (!target) return;

      this.layoutObserver = new ResizeObserver((entries) => {
        const width = Number(entries[0]?.contentRect?.width) || 0;
        if (width > 0) this.layoutWidth = width;
      });
      this.layoutObserver.observe(target);
    },
    bookmarkInitial(bookmark) {
      return String(bookmark?.title || '?').trim().charAt(0).toUpperCase() || '?';
    },
    bookmarkDomain(bookmark) {
      try { return bookmark.domain || new URL(bookmark.url).hostname; } catch (_) { return ''; }
    },
    getFaviconUrl(bookmark) {
      return `https://icons.duckduckgo.com/ip3/${encodeURIComponent(this.bookmarkDomain(bookmark))}.ico`;
    },
    faviconFailed(bookmark) {
      return Boolean(this.failedFavicons[this.bookmarkDomain(bookmark)]);
    },
    markFaviconFailed(bookmark) {
      const domain = this.bookmarkDomain(bookmark);
      this.failedFavicons = { ...this.failedFavicons, [domain]: true };
    },
    normalizeBookmarkUrl(rawUrl) {
      const candidate = /^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
      return parsed;
    },
    openBookmarkEditor(index = -1) {
      const bookmark = index >= 0 ? this.currentBookmarks[index] : null;
      this.editingIndex = index;
      this.editorMode = 'bookmark';
      this.editorError = '';
      this.draft = {
        title: bookmark?.title || '',
        url: bookmark?.url || 'https://',
        category: '',
      };
    },
    openCategoryEditor() {
      this.editingIndex = -1;
      this.editorMode = 'category';
      this.editorError = '';
      this.draft = { title: '', url: '', category: '' };
    },
    closeEditor() {
      this.editorMode = '';
      this.editingIndex = -1;
      this.editorError = '';
    },
    saveEditor() {
      if (this.editorMode === 'category') {
        const category = this.draft.category.trim();
        if (!category || this.categories.includes(category)) {
          this.editorError = this.i18n.$t('bookmarks.categoryExists');
          return;
        }
        this.categories.push(category);
        this.bookmarks[category] = [];
        this.activeTab = category;
        this.saveBookmarksDebounced();
        this.closeEditor();
        return;
      }

      try {
        const parsed = this.normalizeBookmarkUrl(this.draft.url.trim());
        const bookmark = {
          title: this.draft.title.trim(),
          url: parsed.toString(),
          domain: parsed.hostname,
        };
        if (!bookmark.title) throw new Error('missing title');
        if (!this.bookmarks[this.activeTab]) this.bookmarks[this.activeTab] = [];
        if (this.editingIndex >= 0) {
          this.bookmarks[this.activeTab][this.editingIndex] = bookmark;
        } else {
          this.bookmarks[this.activeTab].push(bookmark);
        }
        this.saveBookmarksDebounced();
        this.closeEditor();
      } catch (_) {
        this.editorError = this.i18n.$t('bookmarks.invalidUrl');
      }
    },
    addBookmarkExternal(title, url) {
      try {
        const parsed = this.normalizeBookmarkUrl(url);
        if (!this.bookmarks[this.activeTab]) this.bookmarks[this.activeTab] = [];
        this.bookmarks[this.activeTab].push({ title, url: parsed.toString(), domain: parsed.hostname });
        this.saveBookmarksDebounced();
        return true;
      } catch (_) {
        return false;
      }
    },
    confirmDeleteBookmark(index) {
      if (index < 0 || index >= this.currentBookmarks.length) return;
      this.bookmarks[this.activeTab].splice(index, 1);
      this.pendingBookmarkDelete = -1;
      this.saveBookmarksDebounced();
    },
    confirmDeleteCategory() {
      const category = this.pendingCategoryDelete;
      if (!category || this.categories.length <= 1) return;
      this.categories = this.categories.filter(item => item !== category);
      delete this.bookmarks[category];
      if (this.activeTab === category) this.activeTab = this.categories[0];
      this.pendingCategoryDelete = '';
      this.saveBookmarksDebounced();
    },
    async loadBookmarks() {
      const [savedBookmarks, savedCategories] = await Promise.all([
        getJson(STORAGE_KEY, null),
        getJson(CATEGORIES_KEY, null),
      ]);
      if (savedBookmarks && typeof savedBookmarks === 'object' && !Array.isArray(savedBookmarks)) {
        this.bookmarks = savedBookmarks;
      }
      if (Array.isArray(savedCategories) && savedCategories.length) {
        this.categories = savedCategories.filter(category => typeof category === 'string' && category.trim());
      }
      if (!this.categories.length) this.categories = [...DEFAULT_CATEGORIES];
      this.activeTab = this.categories.includes(this.activeTab) ? this.activeTab : this.categories[0];
    },
    saveBookmarksDebounced() {
      setJsonDebounced(STORAGE_KEY, this.bookmarks, { delayMs: 700, maxBytes: 350_000 });
      setJsonDebounced(CATEGORIES_KEY, this.categories, { delayMs: 700, maxBytes: 32_000 });
    },
    async flushBookmarks() {
      await Promise.all([
        flushDebounced(STORAGE_KEY, this.bookmarks, { maxBytes: 350_000 }),
        flushDebounced(CATEGORIES_KEY, this.categories, { maxBytes: 32_000 }),
      ]);
    },
    setupAdObserver() {
      this.teardownAdObserver();
      if (!this.showAds) return;
      const element = this.$refs.sponsoredCard;
      if (!element) return;

      if (this.adsStore.hasAd) {
        this.adViewability = createAdViewabilityTracker({
          onViewable: async () => {
            if (!this.showAds || !this.adsStore.hasAd || this.adsStore.impressionTracked) return;
            const trackedAd = this.adsStore.currentAd;
            const accepted = await this.adsStore.trackImpression();
            if (accepted && this.adsStore.currentAd?.decision_id === trackedAd?.decision_id) {
              this.$emit('sponsored-impression', trackedAd);
            }
          },
        });
        this.adViewability.setPageVisible(
          typeof document === 'undefined' || document.visibilityState === 'visible',
        );
      }

      if (typeof IntersectionObserver === 'undefined') {
        if (!this.adsStore.hasAd) void this.loadAdWhenVisible();
        return;
      }

      this.adObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const isVisible = entry.isIntersecting && entry.intersectionRatio >= AD_VIEWABILITY_THRESHOLD;
        if (!this.adsStore.hasAd) {
          if (isVisible) void this.loadAdWhenVisible();
          return;
        }
        this.adViewability?.update(entry);
      }, { threshold: [0, AD_VIEWABILITY_THRESHOLD, 1] });
      this.adObserver.observe(element);
    },
    teardownAdObserver() {
      if (this.adObserver) {
        try { this.adObserver.disconnect(); } catch (_) { /* noop */ }
        this.adObserver = null;
      }
      if (this.adViewability) {
        this.adViewability.dispose();
        this.adViewability = null;
      }
    },
    handleAdPageVisibility() {
      this.adViewability?.setPageVisible(
        typeof document === 'undefined' || document.visibilityState === 'visible',
      );
    },
    async loadAdWhenVisible() {
      if (!this.showAds || this.adRequested || this.adsStore.hasAd) return;
      this.adRequested = true;
      await this.adsStore.loadAd();
      this.adRequestComplete = true;
      if (!this.adsStore.hasAd) {
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
      }
    },
    dismissSponsored() {
      void this.adsStore.dismiss();
      this.showTransparency = false;
    },
    async submitFeedback(relevant) {
      if (!this.requiresDisclosure || this.feedbackPending || this.feedbackState === 'sent') return;
      this.feedbackPending = true;
      const accepted = await this.adsStore.submitFeedback(relevant);
      this.feedbackPending = false;
      this.feedbackState = accepted ? 'sent' : 'error';
      if (accepted) this.$emit('sponsored-feedback', { ad: this.ad, relevant });
    },
    openSponsored(event) {
      const clickedAd = this.adsStore.currentAd;
      if (!clickedAd) return;
      const intent = this.clickGuard.evaluate({ keyboard: event?.detail === 0 });
      if (!intent.allowed) {
        void this.adsStore.trackClientEvent('accidental_click_guard', {
          interaction_latency_ms: intent.interactionLatencyMs,
        });
        this.$emit('accidental-click-blocked', clickedAd);
        return;
      }
      if (this.adsStore.trackClick(intent.interactionLatencyMs)) {
        this.$emit('sponsored-click', clickedAd);
      }
    },
    setupPerformanceObserver() {
      if (this.performanceObserver || typeof PerformanceObserver === 'undefined') return;
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          const root = this.$refs.sponsoredCard;
          for (const entry of list.getEntries()) {
            if (entry.hadRecentInput || !root) continue;
            const affectsSlot = !Array.isArray(entry.sources)
              || entry.sources.length === 0
              || entry.sources.some(source => (
                source.node === root || (source.node && root.contains(source.node))
              ));
            if (affectsSlot) this.layoutShift += Number(entry.value || 0);
          }
        });
        this.performanceObserver.observe({ type: 'layout-shift', buffered: true });
      } catch (_) {
        this.performanceObserver = null;
      }
    },
    schedulePerformanceReport() {
      if (this.performanceReported || this.performanceReportTimer) return;
      this.performanceReportTimer = setTimeout(() => {
        this.performanceReportTimer = null;
        this.reportPerformance();
      }, 2000);
    },
    reportPerformance() {
      if (this.performanceReported || !this.adsStore.hasAd) return;
      this.performanceReported = true;
      void this.adsStore.trackClientEvent('client_performance', {
        request_latency_ms: Math.max(0, Math.round(this.adsStore.requestLatencyMs || 0)),
        layout_shift_micros: Math.max(0, Math.round(this.layoutShift * 1_000_000)),
      });
    },
    teardownPerformanceObserver() {
      if (this.performanceReportTimer) {
        clearTimeout(this.performanceReportTimer);
        this.performanceReportTimer = null;
      }
      if (this.performanceObserver) {
        try { this.performanceObserver.disconnect(); } catch (_) { /* noop */ }
        this.performanceObserver = null;
      }
    },
  },
};
</script>

<style scoped>
.bookmark-grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.72rem;
  transition: max-width 220ms ease;
}

.tabs-bar {
  align-self: flex-start;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
  padding: 4px;
  background: var(--surface-island, rgba(255, 255, 255, 0.84));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0, 0, 0, 0.12));
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
}

.tab-btn,
.tab-add {
  min-height: 30px;
  padding: 0.36rem 0.78rem;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--nova-control-radius, 8px);
  font: inherit;
  font-size: 0.76rem;
  font-weight: 550;
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.tab-item.active .tab-btn {
  color: var(--color-text, #1a2b26);
  background: var(--surface-control-hover, rgba(4, 164, 105, 0.08));
  border-color: var(--color-border, rgba(34, 75, 61, 0.12));
}

.tab-btn:hover,
.tab-btn:focus-visible {
  color: var(--color-text, #1a2b26);
}

.tab-add {
  min-width: 30px;
  padding-inline: 0.55rem;
  color: white;
  background: var(--color-primary, #04a469);
  font-size: 1rem;
}

.tab-delete {
  width: 18px;
  height: 18px;
  position: absolute;
  top: -7px;
  right: -7px;
  z-index: 4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: white;
  background: var(--accent-danger, #d75d49);
  border: 2px solid var(--surface-island, white);
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transform: scale(0.85);
  transition: opacity 150ms ease, transform 150ms ease;
}

.tab-item:hover .tab-delete,
.tab-item:focus-within .tab-delete {
  opacity: 1;
  transform: scale(1);
}

.delete-confirmation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.62rem 0.72rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.94));
  border: 1px solid rgba(215, 93, 73, 0.28);
  border-radius: 10px;
  font-size: 0.75rem;
}

.delete-confirmation div,
.card-confirmation div {
  display: flex;
  gap: 0.35rem;
}

.delete-confirmation button,
.card-confirmation button {
  min-height: 27px;
  padding: 0.25rem 0.5rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-control, rgba(255, 255, 255, 0.72));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
  border-radius: 7px;
  font: inherit;
  font-size: 0.68rem;
  cursor: pointer;
}

.delete-confirmation .is-danger,
.card-confirmation .is-danger {
  color: white;
  background: var(--accent-danger, #d75d49);
  border-color: transparent;
}

.speed-dial-grid {
  width: 100%;
  position: relative;
  display: grid;
  gap: 0.75rem;
  align-items: stretch;
}

.speed-dial-card {
  min-width: 0;
  position: relative;
  border-radius: var(--nova-panel-radius, 14px);
}

.speed-dial-link {
  width: 100%;
  min-height: var(--dial-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(0.36rem, 1vw, 0.56rem);
  padding: 0.72rem 0.46rem 0.62rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.86));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 5px 18px rgba(8, 35, 26, 0.07), inset 0 1px rgba(255, 255, 255, 0.18);
  text-decoration: none;
  cursor: pointer;
  transition: background 170ms ease, border-color 170ms ease, box-shadow 170ms ease, transform 170ms ease;
}

.speed-dial-link:hover,
.speed-dial-link:focus-visible {
  background: var(--surface-control-hover, rgba(255, 255, 255, 0.96));
  border-color: var(--color-primary, #04a469);
  box-shadow: 0 10px 24px rgba(8, 35, 26, 0.12), inset 0 1px rgba(255, 255, 255, 0.22);
  transform: translateY(-2px);
}

.speed-dial-link:active {
  transform: translateY(0) scale(0.985);
}

.speed-dial-icon {
  width: var(--dial-icon-size);
  height: var(--dial-icon-size);
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: white;
  background: var(--surface-control, #e5ece9);
  border-radius: clamp(8px, 22%, 16px);
}

.speed-dial-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.speed-dial-initial {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: white;
  background: var(--color-primary, #04a469);
  font-size: clamp(1rem, 2vw, 1.65rem);
  font-weight: 720;
}

.speed-dial-title {
  max-width: 100%;
  overflow: hidden;
  font-size: clamp(0.68rem, 1vw, 0.8rem);
  font-weight: 550;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: opacity 160ms ease, transform 160ms ease;
}

.speed-dial-grid--title-hover .speed-dial-title {
  opacity: 0;
  transform: translateY(3px);
}

.speed-dial-grid--title-hover .speed-dial-card:hover .speed-dial-title,
.speed-dial-grid--title-hover .speed-dial-card:focus-within .speed-dial-title {
  opacity: 1;
  transform: translateY(0);
}

.speed-dial-grid--title-hide .speed-dial-title,
.speed-dial-grid--icon .speed-dial-title {
  display: none;
}

.speed-dial-grid--icon .speed-dial-link {
  padding: 0.42rem;
  background: transparent;
  border-color: transparent;
  box-shadow: none;
}

.card-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 5;
  display: flex;
  gap: 0.22rem;
  opacity: 0;
  transform: translateY(-3px);
  transition: opacity 150ms ease, transform 150ms ease;
}

.speed-dial-card:hover .card-actions,
.speed-dial-card:focus-within .card-actions {
  opacity: 1;
  transform: translateY(0);
}

.card-action-btn,
.house-dismiss,
.sponsored-info {
  width: 23px;
  height: 23px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted, #5a7b6d);
  background: var(--surface-control, rgba(255, 255, 255, 0.9));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
  border-radius: 7px;
  cursor: pointer;
}

.card-action-btn--danger:hover,
.house-dismiss:hover {
  color: white;
  background: var(--accent-danger, #d75d49);
  border-color: transparent;
}

.card-confirmation {
  position: absolute;
  inset: auto 5px 5px;
  z-index: 7;
  display: grid;
  gap: 0.36rem;
  padding: 0.5rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.98));
  border: 1px solid rgba(215, 93, 73, 0.3);
  border-radius: 9px;
  box-shadow: 0 8px 24px rgba(8, 35, 26, 0.16);
  font-size: 0.66rem;
}

.sponsored-card--disclosed .sponsored-link {
  padding-top: 1.32rem;
}

.sponsored-badge {
  position: absolute;
  top: 7px;
  left: 8px;
  z-index: 4;
  max-width: calc(100% - 40px);
  padding: 2px 5px;
  overflow: hidden;
  color: var(--color-text-muted, #5a7b6d);
  background: var(--surface-control, rgba(255, 255, 255, 0.88));
  border-radius: 4px;
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}

.sponsored-info,
.house-dismiss {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 6;
  border-radius: 50%;
}

.sponsored-info {
  font: 700 0.68rem/1 sans-serif;
}

.sponsored-info:hover,
.sponsored-info:focus-visible {
  color: white;
  background: var(--color-primary, #04a469);
  border-color: transparent;
}

.sponsored-icon--fallback {
  color: white;
  background: var(--color-primary, #04a469);
  font-size: clamp(1rem, 2vw, 1.65rem);
  font-weight: 720;
}

.sponsored-card--pending {
  min-height: var(--dial-height);
  overflow: hidden;
  background: var(--surface-island, rgba(255, 255, 255, 0.58));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.1));
}

.sponsored-skeleton {
  min-height: var(--dial-height);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.58rem;
}

.sponsored-skeleton span {
  width: var(--dial-icon-size);
  height: var(--dial-icon-size);
  background: var(--surface-control, rgba(34, 75, 61, 0.1));
  border-radius: 10px;
  animation: skeleton-pulse 1.2s ease-in-out infinite alternate;
}

.sponsored-skeleton span + span {
  width: 58%;
  height: 7px;
  border-radius: 5px;
}

.transparency-panel {
  width: min(330px, calc(100vw - 2rem));
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  padding: 0.88rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-base, #f5f8f7);
  border: 1px solid var(--color-border-hover, rgba(34, 75, 61, 0.22));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 18px 46px rgba(8, 35, 26, 0.22);
  font-size: 0.74rem;
}

.transparency-panel p {
  margin: 0.45rem 0 0;
  color: var(--color-text-muted, #5a7b6d);
  line-height: 1.45;
}

.frequency-copy { font-weight: 600; }

.feedback-actions {
  display: grid;
  gap: 0.44rem;
  margin-top: 0.72rem;
  padding-top: 0.62rem;
  border-top: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
}

.feedback-actions div { display: flex; gap: 0.38rem; }

.feedback-actions button,
.dismiss-action {
  min-height: 29px;
  padding: 0.32rem 0.5rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-control, rgba(255, 255, 255, 0.78));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
  border-radius: 7px;
  font: inherit;
  font-size: 0.69rem;
  cursor: pointer;
}

.feedback-actions button:disabled { cursor: wait; opacity: 0.6; }
.feedback-actions small { color: var(--color-primary, #047a50); }

.dismiss-action {
  width: 100%;
  margin-top: 0.62rem;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
}

.add-link {
  border-style: dashed;
  box-shadow: none;
}

.add-icon {
  color: white;
  background: var(--color-primary, #04a469);
  font-size: clamp(1.4rem, 3vw, 2.2rem);
  font-weight: 350;
}

.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 9200;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgba(4, 12, 10, 0.42);
  backdrop-filter: blur(4px);
}

.dial-editor {
  width: min(420px, 100%);
  display: grid;
  gap: 0.82rem;
  padding: 1rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-base, #f5f8f7);
  border: 1px solid var(--color-border-hover, rgba(34, 75, 61, 0.2));
  border-radius: 15px;
  box-shadow: 0 24px 64px rgba(8, 35, 26, 0.26);
}

.dial-editor header,
.dial-editor footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
}

.editor-eyebrow {
  display: block;
  margin-bottom: 0.1rem;
  color: var(--color-primary, #047a50);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.dial-editor h3 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: -0.012em;
}

.editor-close {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
}

.dial-editor label {
  display: grid;
  gap: 0.36rem;
  color: var(--color-text-muted, #4d6c60);
  font-size: 0.72rem;
  font-weight: 650;
}

.dial-editor input {
  width: 100%;
  min-height: 40px;
  padding: 0.55rem 0.68rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.88));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.16));
  border-radius: 9px;
  font: inherit;
  font-size: 0.8rem;
}

.editor-error {
  margin: 0;
  color: var(--accent-danger, #b74534);
  font-size: 0.72rem;
}

.dial-editor footer { justify-content: flex-end; }

.editor-button {
  min-height: 36px;
  padding: 0.48rem 0.72rem;
  border-radius: 8px;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 620;
  cursor: pointer;
}

.editor-button--secondary {
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
}

.editor-button--primary {
  color: white;
  background: var(--color-primary, #047a50);
  border: 1px solid transparent;
}

button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

.editor-fade-enter-active,
.editor-fade-leave-active { transition: opacity 170ms ease; }
.editor-fade-enter-from,
.editor-fade-leave-to { opacity: 0; }

@keyframes skeleton-pulse {
  to { opacity: 0.45; }
}

@media (max-width: 600px) {
  .bookmark-grid {
    gap: 0.6rem;
  }

  .tabs-bar {
    max-width: 100%;
    flex-wrap: nowrap;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    scrollbar-width: none;
  }

  .tabs-bar::-webkit-scrollbar {
    display: none;
  }

  .speed-dial-grid { gap: 0.58rem; }
  .delete-confirmation { align-items: flex-start; flex-direction: column; }
  .transparency-panel {
    position: fixed;
    top: auto;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: auto;
  }
}
</style>
