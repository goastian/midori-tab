<template>
  <div v-if="showSpeedDials || showAds" class="bookmark-grid" :style="containerStyle">
    <nav v-if="showSpeedDials" class="tabs-bar" :aria-label="i18n.$t('bookmarks.categories')">
      <div
        v-for="category in categories"
        :key="category"
        class="tab-item"
        :class="{ active: category === activeTab }"
      >
        <button class="tab-btn" type="button" :disabled="!bookmarksReady" @click="activeTab = category">{{ category }}</button>
        <button
          v-if="categories.length > 1 && showDeleteButton"
          :disabled="!bookmarksReady"
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
        :disabled="!bookmarksReady"
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
        :key="bookmark.id"
        class="speed-dial-card"
        :class="{ 'speed-dial-card--conflict': bookmark.conflictOf }"
      >
        <div v-if="showDeleteButton" class="card-actions">
          <button
            class="card-action-btn"
            :disabled="!bookmarksReady"
            type="button"
            :title="i18n.$t('bookmarks.edit')"
            :aria-label="`${i18n.$t('bookmarks.edit')}: ${bookmark.title}`"
            @click="openBookmarkEditor(bookmark.id)"
          >
            <DashboardIcon name="edit" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button
            class="card-action-btn card-action-btn--danger"
            :disabled="!bookmarksReady"
            type="button"
            :title="i18n.$t('bookmarks.delete')"
            :aria-label="`${i18n.$t('bookmarks.delete')}: ${bookmark.title}`"
            @click="pendingBookmarkDelete = bookmark.id"
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
              v-if="faviconUrls[bookmarkDomain(bookmark)]"
              :src="faviconUrls[bookmarkDomain(bookmark)]"
              alt=""
              loading="eager"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="markFaviconFailed(bookmark)"
            />
            <span v-else class="speed-dial-initial">{{ bookmarkInitial(bookmark) }}</span>
          </span>
          <span class="speed-dial-title" :title="bookmark.title">{{ bookmark.title }}</span>
        </a>

        <div v-if="pendingBookmarkDelete === bookmark.id" class="card-confirmation" role="alert">
          <span>{{ i18n.$t('bookmarks.deleteConfirm') }}</span>
          <div>
            <button type="button" @click="pendingBookmarkDelete = ''">{{ i18n.$t('bookmarks.cancel') }}</button>
            <button type="button" class="is-danger" @click="confirmDeleteBookmark(bookmark.id)">{{ i18n.$t('bookmarks.delete') }}</button>
          </div>
        </div>
      </article>

      <article
        v-if="showAds && (!adRequestComplete || hasAd)"
        ref="sponsoredCard"
        class="speed-dial-card sponsored-card"
        :class="{
          'sponsored-card--pending': !hasAd,
          'sponsored-card--disclosed': requiresDisclosure,
        }"
        :role="requiresDisclosure ? 'complementary' : undefined"
        :aria-label="sponsoredAriaLabel"
        :aria-hidden="!hasAd"
      >
        <template v-if="hasAd">
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

          <SponsoredTransparency
            v-if="requiresDisclosure && showTransparency"
            :transparency="ad.transparency"
            :feedback-pending="feedbackPending"
            :feedback-state="feedbackState"
            @feedback="submitFeedback"
            @dismiss="dismissSponsored"
          />
        </template>

        <div v-else class="sponsored-skeleton" aria-hidden="true">
          <span></span>
          <span></span>
        </div>
      </article>

      <div v-else-if="showAds && reserveAdSlot" class="sponsored-empty-slot" aria-hidden="true"></div>

      <article
        v-if="showSpeedDials && showAddButton && currentBookmarks.length < speedDialLimit"
        class="speed-dial-card speed-dial-card--add"
      >
        <button class="speed-dial-link add-link" type="button" :disabled="!bookmarksReady" @click="openBookmarkEditor()">
          <span class="speed-dial-icon add-icon" aria-hidden="true">+</span>
          <span class="speed-dial-title">{{ i18n.$t('bookmarks.add') }}</span>
        </button>
      </article>
    </div>

    <BookmarkEditor
      v-if="editorMode"
      :mode="editorMode"
      :bookmark="currentBookmarks.find(bookmark => bookmark.id === editingId) || null"
      :categories="categories"
      :normalize-url="normalizeBookmarkUrl"
      @close="closeEditor"
      @save="saveEditor"
    />
    <BookmarkUndoToast v-if="undo" :entry="undo" @undo="undo.undo()" @dismiss="undo.dismiss()" />
  </div>
</template>

<script>
import { defineAsyncComponent } from 'vue';
import useI18nStore from '../stores/useI18nStore.js';
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';
import { cancelRemoteTask, scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';
import faviconService from '../services/FaviconService.js';
import { faviconDisplayUrl, readFaviconSnapshot, writeFaviconSnapshot } from '../services/faviconSnapshot.js';
import { readBookmarkSnapshot, writeBookmarkSnapshot } from '../bootstrap/bookmarkSnapshot.js';
import {
  getSpeedDialMetrics,
  requiresPaidDisclosure,
  speedDialLayoutStyles,
} from '../utils/startPageSettings.js';
import DashboardIcon from './icons/DashboardIcon.vue';
import { DEFAULT_CATEGORIES, cloneDefaults } from '../services/bookmarkDefaults.js';
import '../styles/bookmark-layout.css';

const STORAGE_KEY = 'midori_bookmarks';
const CATEGORIES_KEY = 'midori_bookmark_categories';

/** Timestamp of the newest write to the bookmarks by any New Tab, read from the shared mirror. */
function mirrorAt() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY))?.updatedAt || 0; } catch { return 0; }
}

export default {
  name: 'BookmarkGrid',
  components: {
    DashboardIcon,
    BookmarkEditor: defineAsyncComponent(() => import('./BookmarkEditor.vue')),
    SponsoredTransparency: defineAsyncComponent(() => import('./SponsoredTransparency.vue')),
    BookmarkUndoToast: defineAsyncComponent(() => import('./BookmarkUndoToast.vue')),
  },
  emits: [
    'ready',
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
    const snapshot = readBookmarkSnapshot();
    const favicons = readFaviconSnapshot();
    return {
      i18n: useI18nStore(),
      adsStore: null,
      adRuntime: null,
      adRuntimeLoading: false,
      bookmarks: snapshot ? { [snapshot.activeTab]: snapshot.items } : cloneDefaults(),
      bookmarksReady: false,
      bookmarkSaveGeneration: 0,
      bookmarkSavePending: false,
      remoteImagesReady: Boolean(window.__midoriPerf?.marks?.['interaction-ready']),
      perfMarkListener: null,
      categories: snapshot?.categories || [...DEFAULT_CATEGORIES],
      activeTab: snapshot?.activeTab || DEFAULT_CATEGORIES[0],
      failedFavicons: {},
      faviconUrls: favicons.urls,
      staleFavicons: favicons.stale,
      faviconGeneration: 0,
      faviconCacheLoading: false,
      faviconsDisposed: false,
      faviconTaskKeys: new Set(),
      editorMode: '',
      editingId: '',
      pendingBookmarkDelete: '',
      undo: null,
      pendingCategoryDelete: '',
      adRequested: false,
      adRequestComplete: false,
      reserveAdSlot: true,
      adObserver: null,
      adViewability: null,
      clickGuard: null,
      iconFailed: false,
      showTransparency: false,
      feedbackPending: false,
      feedbackState: '',
      performanceObserver: null,
      layoutShift: 0,
      performanceReportTimer: null,
      performanceReported: false,
    };
  },
  computed: {
    currentBookmarks() {
      return Array.isArray(this.bookmarks[this.activeTab]) ? this.bookmarks[this.activeTab] : [];
    },
    visibleBookmarks() {
      return this.showSpeedDials ? this.currentBookmarks.slice(0, this.speedDialLimit) : [];
    },
    layoutStyles() {
      return speedDialLayoutStyles({ size: this.speedDialSize, columns: this.speedDialColumns });
    },
    containerStyle() {
      return this.layoutStyles.container;
    },
    gridStyle() {
      return this.layoutStyles.grid;
    },
    hasAd() { return Boolean(this.adsStore?.hasAd); },
    ad() { return this.adsStore?.currentAd || {}; },
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
      if (!this.hasAd) return undefined;
      if (!this.requiresDisclosure) return this.ad.title || undefined;
      const label = this.i18n.$t('ads.label') || 'Sponsored content';
      return this.ad.title ? `${label}: ${this.ad.title}` : label;
    },
    sponsoredRel() {
      return this.requiresDisclosure
        ? 'noopener noreferrer nofollow sponsored'
        : 'noopener noreferrer';
    },
  },
  watch: {
    visibleBookmarks() { void this.primeFavicons(); },
    activeTab() {
      if (this.bookmarksReady && !this.bookmarkSavePending) writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
    },
    showAds(enabled) {
      if (!enabled) {
        cancelRemoteTask('ads-decision');
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
        return;
      }
      this.reserveAdSlot = true;
      if (!this.hasAd) {
        this.adRequested = false;
        this.adRequestComplete = false;
      }
      void this.ensureAdRuntime();
    },
    'adsStore.currentAd'(ad) {
      this.iconFailed = false;
      this.showTransparency = false;
      this.feedbackState = '';
      this.clickGuard?.reset();
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
  created() {
    this.syncedAt = 0;
    this.bookmarksUnsaved = false;
  },
  mounted() {
    this.perfMarkListener = event => {
      if (event.detail?.name === 'interaction-ready') {
        this.remoteImagesReady = true;
        this.queueFavicons();
        void this.ensureAdRuntime();
      }
    };
    window.addEventListener('midori:perf-mark', this.perfMarkListener);
    this.remoteImagesReady = Boolean(window.__midoriPerf?.marks?.['interaction-ready']);
    void this.loadBookmarks().catch(() => undefined).then(async () => {
      const favicons = this.primeFavicons();
      await this.$nextTick();
      if (!this.faviconsDisposed) this.$emit('ready');
      await favicons;
    }).catch(error => console.warn('[Midori] Could not restore cached favicons', error));
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.$nextTick(() => {
      void this.ensureAdRuntime();
    });
  },
  beforeUnmount() {
    this.faviconsDisposed = true;
    this.faviconGeneration += 1;
    window.removeEventListener('midori:perf-mark', this.perfMarkListener);
    for (const key of this.faviconTaskKeys) cancelRemoteTask(key);
    this.faviconTaskKeys.clear();
    for (const url of Object.values(this.faviconUrls)) URL.revokeObjectURL(url);
    cancelRemoteTask('ads-decision');
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.reportPerformance();
    this.teardownAdObserver();
    this.teardownPerformanceObserver();
    void this.flushBookmarks().catch(() => undefined);
    clearTimeout(this.remoteSyncTimer);
    window.removeEventListener('storage', this.storageListener);
    this.undoBuffer?.clear();
  },
  methods: {
    formatCopy(key, replacements = {}) {
      return Object.entries(replacements).reduce(
        (copy, [name, value]) => String(copy).replace(`{${name}}`, String(value)),
        this.i18n.$t(key),
      );
    },
    bookmarkInitial(bookmark) {
      return String(bookmark?.title || '?').trim().charAt(0).toUpperCase() || '?';
    },
    bookmarkDomain(bookmark) {
      try { return new URL(`https://${bookmark.domain || new URL(bookmark.url).hostname}`).hostname.toLowerCase(); } catch (_) { return ''; }
    },
    async primeFavicons() {
      if (!this.bookmarksReady || this.faviconsDisposed) return;
      const generation = ++this.faviconGeneration;
      this.faviconCacheLoading = true;
      const domains = new Set(this.visibleBookmarks.map(bookmark => this.bookmarkDomain(bookmark)).filter(Boolean));
      const retained = Object.keys(this.faviconUrls).filter(domain => !domains.has(domain));
      while (retained.length && retained.length + domains.size > 32) {
        const domain = retained.shift();
        if (domain) {
          const url = this.faviconUrls[domain];
          URL.revokeObjectURL(url);
          delete this.faviconUrls[domain];
          delete this.staleFavicons[domain];
        }
      }
      for (const key of this.faviconTaskKeys) {
        if (!domains.has(key.slice('favicon:'.length))) cancelRemoteTask(key);
      }
      await Promise.all([...domains].map(async domain => {
        if (this.faviconUrls[domain]) return;
        const cached = await faviconService.readCached(domain);
        if (!cached || this.faviconsDisposed || generation !== this.faviconGeneration || this.faviconUrls[domain]) return;
        const url = await faviconDisplayUrl(cached.blob).catch(() => null);
        if (!url || this.faviconsDisposed || generation !== this.faviconGeneration || this.faviconUrls[domain]) return;
        this.faviconUrls[domain] = url;
        this.staleFavicons[domain] = cached.stale;
        writeFaviconSnapshot(domain, url, cached.fetchedAt);
      }));
      if (generation === this.faviconGeneration) {
        this.faviconCacheLoading = false;
        this.queueFavicons();
      }
    },
    queueFavicons() {
      if (this.faviconsDisposed || this.faviconCacheLoading || !this.bookmarksReady || !this.remoteImagesReady || document.visibilityState === 'hidden') return;
      for (const bookmark of this.visibleBookmarks) {
        const domain = this.bookmarkDomain(bookmark);
        const key = `favicon:${domain}`;
        if (!domain || (this.faviconUrls[domain] && !this.staleFavicons[domain]) || this.failedFavicons[domain] || this.faviconTaskKeys.has(key)) continue;
        this.faviconTaskKeys.add(key);
        void scheduleRemoteTask(key, async signal => {
          try {
            const icon = await faviconService.loadIcon(domain, { signal });
            const url = icon.blob ? await faviconDisplayUrl(icon.blob) : icon.url;
            const decoded = new Image();
            decoded.src = url;
            await decoded.decode();
            if (signal.aborted || this.faviconsDisposed || !this.visibleBookmarks.some(item => this.bookmarkDomain(item) === domain)) return false;
            const previous = this.faviconUrls[domain];
            this.faviconUrls[domain] = url;
            this.staleFavicons[domain] = false;
            if (icon.blob) writeFaviconSnapshot(domain, url, Date.now());
            if (previous) URL.revokeObjectURL(previous);
            return true;
          } catch (error) {
            if (!signal.aborted && error?.name !== 'AbortError') this.failedFavicons[domain] = true;
            return false;
          }
        }, { priority: 3 }).then(completed => {
          this.faviconTaskKeys.delete(key);
          // Android may hide and restore the tab before the cancelled request
          // settles. Retry once the coordinator has released its running slot.
          if (!completed && !this.failedFavicons[domain]) this.queueFavicons();
        });
      }
    },
    markFaviconFailed(bookmark) {
      const domain = this.bookmarkDomain(bookmark);
      URL.revokeObjectURL(this.faviconUrls[domain]);
      delete this.faviconUrls[domain];
      this.failedFavicons[domain] = true;
      writeFaviconSnapshot(domain, null);
      void faviconService.remove(domain);
    },
    normalizeBookmarkUrl(rawUrl) {
      const candidate = /^[a-z][a-z\d+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
      return parsed;
    },
    openBookmarkEditor(id = '') {
      if (!this.bookmarksReady) return;
      this.editingId = id;
      this.editorMode = 'bookmark';
    },
    openCategoryEditor() {
      if (!this.bookmarksReady) return;
      this.editingId = '';
      this.editorMode = 'category';
    },
    closeEditor() {
      this.editorMode = '';
      this.editingId = '';
    },
    saveEditor(value) {
      if (!this.bookmarksReady) return;
      if (this.editorMode === 'category') {
        this.categories.push(value);
        this.bookmarks[value] = [];
        this.activeTab = value;
      } else {
        if (!this.bookmarks[this.activeTab]) this.bookmarks[this.activeTab] = [];
        const list = this.bookmarks[this.activeTab];
        const index = this.editingId ? list.findIndex(bookmark => bookmark.id === this.editingId) : -1;
        if (index >= 0) list.splice(index, 1, { ...list[index], ...value, rev: (list[index].rev || 0) + 1, updatedAt: Date.now() });
        else list.push({ id: crypto.randomUUID(), rev: 1, updatedAt: Date.now(), ...value });
      }
      this.saveBookmarksDebounced();
      this.closeEditor();
    },
    confirmDeleteBookmark(id) {
      const category = this.activeTab;
      const index = this.currentBookmarks.findIndex(bookmark => bookmark.id === id);
      this.pendingBookmarkDelete = '';
      if (!this.bookmarksReady || index < 0) return;
      const [removed] = this.bookmarks[category].splice(index, 1);
      void this.remember(removed.title, sync => () => sync.restoreBookmark(this, category, removed, index));
      this.saveBookmarksDebounced();
    },
    confirmDeleteCategory() {
      if (!this.bookmarksReady) return;
      const category = this.pendingCategoryDelete;
      if (!category || this.categories.length <= 1) return;
      const index = this.categories.indexOf(category);
      const items = this.bookmarks[category] || [];
      this.categories = this.categories.filter(item => item !== category);
      delete this.bookmarks[category];
      if (this.activeTab === category) this.activeTab = this.categories[0];
      this.pendingCategoryDelete = '';
      void this.remember(category, sync => () => sync.restoreCategory(this, category, items, index));
      this.saveBookmarksDebounced();
    },
    /** Undo is loaded with the first deletion, not at startup. */
    async remember(label, restoreFor) {
      const sync = await import('../services/bookmarkSync.js');
      await sync.remember(this, label, restoreFor(sync));
    },
    bookmarkState() {
      return JSON.parse(JSON.stringify({ bookmarks: this.bookmarks, categories: this.categories }));
    },
    async loadBookmarks() {
      const [savedBookmarks, savedCategories] = await Promise.all([
        getJson(STORAGE_KEY, null, { strictRead: true }),
        getJson(CATEGORIES_KEY, null, { strictRead: true }),
      ]);
      const stored = savedBookmarks && typeof savedBookmarks === 'object' && !Array.isArray(savedBookmarks);
      const needsIds = stored && Object.values(savedBookmarks).some(list => Array.isArray(list) && list.some(item => !item?.id));
      // Only shortcuts saved before ids existed need the upgrade code; the result is saved once.
      this.bookmarks = needsIds ? (await import('../services/bookmarkData.js')).normalizeBookmarks(savedBookmarks)
        : (stored ? savedBookmarks : cloneDefaults());
      this.categories = Array.isArray(savedCategories) && savedCategories.length
        ? savedCategories.filter(category => typeof category === 'string' && category.trim()) : [...DEFAULT_CATEGORIES];
      if (!this.categories.length) this.categories = [...DEFAULT_CATEGORIES];
      this.activeTab = this.categories.includes(this.activeTab) ? this.activeTab : this.categories[0];
      this.syncedState = this.bookmarkState();
      this.syncedAt = mirrorAt();
      this.bookmarksReady = true;
      this.storageListener = event => {
        if (event.key === STORAGE_KEY || event.key === CATEGORIES_KEY) this.requestRemoteSync();
      };
      window.addEventListener('storage', this.storageListener);
      writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
      // Ids must reach storage or each tab would invent its own.
      if (needsIds) this.saveBookmarksDebounced();
    },
    requestRemoteSync() {
      void import('../services/bookmarkSync.js').then(sync => sync.requestSync(this, mirrorAt));
    },
    saveBookmarksDebounced() {
      if (!this.bookmarksReady) return;
      this.bookmarkSavePending = true;
      this.bookmarksUnsaved = true;
      // Another tab saved since this one last synchronised: merge it first, then save the result.
      if (mirrorAt() > this.syncedAt && !this.remoteSyncing) { this.requestRemoteSync(); return; }
      const generation = ++this.bookmarkSaveGeneration;
      const writes = Promise.all([
        setJsonDebounced(STORAGE_KEY, this.bookmarks, { delayMs: 700, maxBytes: 350_000, userData: true }),
        setJsonDebounced(CATEGORIES_KEY, this.categories, { delayMs: 700, maxBytes: 32_000, userData: true }),
      ]);
      this.syncedAt = mirrorAt();
      void writes.then(() => {
        if (generation !== this.bookmarkSaveGeneration) return;
        this.bookmarkSavePending = false;
        this.bookmarksUnsaved = false;
        this.syncedState = this.bookmarkState();
        writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
      }).catch(() => { if (generation === this.bookmarkSaveGeneration) this.bookmarkSavePending = false; });
    },
    async flushBookmarks() {
      if (!this.bookmarksReady || !this.bookmarksUnsaved) return;
      await Promise.all([
        flushDebounced(STORAGE_KEY, this.bookmarks, { maxBytes: 350_000, userData: true }),
        flushDebounced(CATEGORIES_KEY, this.categories, { maxBytes: 32_000, userData: true }),
      ]);
      writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
    },
    async ensureAdRuntime() {
      if (!this.showAds || !this.remoteImagesReady || this.adRuntimeLoading || this.faviconsDisposed || document.visibilityState === 'hidden') return;
      this.adRuntimeLoading = true;
      try {
        if (!this.adRuntime) {
          const runtime = await import('../services/bookmarkAdsRuntime.js');
          if (this.faviconsDisposed) return;
          this.adRuntime = runtime;
          this.clickGuard = runtime.createAdInteractionGuard();
          this.adsStore = runtime.useAdsStore();
        }
        await this.$nextTick();
        if (!this.showAds || this.faviconsDisposed) return;
        this.setupPerformanceObserver();
        this.setupAdObserver();
      } catch (error) {
        this.adRequestComplete = true;
        console.warn('[Midori] Could not load sponsored shortcuts', error);
      } finally { this.adRuntimeLoading = false; }
    },
    setupAdObserver() {
      this.teardownAdObserver();
      if (!this.showAds || !this.adRuntime || !this.adsStore) return;
      const { AD_VIEWABILITY_THRESHOLD, createAdViewabilityTracker } = this.adRuntime;
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
      if (document.visibilityState === 'visible') {
        this.failedFavicons = {};
        void this.primeFavicons();
        void this.ensureAdRuntime();
      }
      this.adViewability?.setPageVisible(
        typeof document === 'undefined' || document.visibilityState === 'visible',
      );
    },
    async loadAdWhenVisible() {
      if (!this.showAds || !this.adsStore || this.adRequested || this.hasAd) return;
      this.adRequested = true;
      const completed = await scheduleRemoteTask('ads-decision', signal => this.adsStore.loadAd(false, { signal }), { priority: 1 });
      if (!completed) this.adRequested = false;
      if (!this.$el?.isConnected) return;
      // A decision interrupted by hiding the tab stays pending and is asked again on return;
      // closing the slot here would drop the sponsored shortcut for the rest of the page.
      if (!completed) return;
      this.adRequestComplete = true;
      if (!this.adsStore.hasAd) {
        this.teardownAdObserver();
        this.teardownPerformanceObserver();
      }
    },
    dismissSponsored() {
      this.reserveAdSlot = false;
      void this.adsStore?.dismiss();
      this.showTransparency = false;
    },
    async submitFeedback(relevant) {
      if (!this.adsStore || !this.requiresDisclosure || this.feedbackPending || this.feedbackState === 'sent') return;
      this.feedbackPending = true;
      const accepted = await this.adsStore.submitFeedback(relevant);
      this.feedbackPending = false;
      this.feedbackState = accepted ? 'sent' : 'error';
      if (accepted) this.$emit('sponsored-feedback', { ad: this.ad, relevant });
    },
    openSponsored(event) {
      const clickedAd = this.adsStore?.currentAd;
      if (!clickedAd || !this.clickGuard) return;
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
      if (!this.showAds || !this.adRuntime || this.performanceObserver || typeof PerformanceObserver === 'undefined') return;
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
      if (this.performanceReported || !this.hasAd) return;
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
.tabs-bar {
  background: var(--surface-island, rgba(255, 255, 255, 0.84));
  border-color: var(--color-border, rgba(34, 75, 61, 0.12));
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0, 0, 0, 0.12));
}

.tab-btn,
.tab-add {
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border-color: transparent;
  border-radius: var(--nova-control-radius, 8px);
  cursor: pointer;
  transition: background 150ms ease, border-color 150ms ease, color 150ms ease;
}

.tab-item.active .tab-btn {
  color: var(--color-text, #1a2b26);
  background: var(--surface-control-hover, rgba(4, 164, 105, 0.08));
  border-color: var(--color-border, rgba(34, 75, 61, 0.12));
}

.tab-add {
  color: white;
  background: var(--color-primary, #04a469);
}

.speed-dial-card {
  border-radius: var(--nova-panel-radius, 14px);
}

.speed-dial-link {
  color: var(--color-text, #1a2b26);
  background: var(--surface-island, rgba(255, 255, 255, 0.86));
  border-color: var(--color-border, rgba(34, 75, 61, 0.12));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 5px 18px rgba(8, 35, 26, 0.07), inset 0 1px rgba(255, 255, 255, 0.18);
  text-decoration: none;
  cursor: pointer;
  transition: background 170ms ease, border-color 170ms ease, box-shadow 170ms ease, transform 170ms ease;
}

.tab-btn:hover,
.tab-btn:focus-visible {
  color: var(--color-text, #1a2b26);
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

.sponsored-empty-slot {
  min-height: var(--dial-height);
  pointer-events: none;
}

.sponsored-skeleton {
  min-height: calc(var(--dial-height) - 2px);
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
}

.sponsored-skeleton span + span {
  width: 58%;
  height: 7px;
  border-radius: 5px;
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

button:focus-visible,
a:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .delete-confirmation { align-items: flex-start; flex-direction: column; }
}
</style>
