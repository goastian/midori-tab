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
          v-if="categories.length > 1 && showDeleteButton && !defaultCategories.includes(category)"
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
      :aria-busy="showAds && catalogLoading && !adCatalog"
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
        v-for="slot in visibleAds"
        :key="slot.key"
        :data-ads-bookmark="slot.key"
        :ref="adRefFor(slot.key)"
        class="speed-dial-card sponsored-card"
        :class="{
          'sponsored-card--disclosed': slot.disclosure,
          'sponsored-card--info-open': infoKey === slot.key,
        }"
        :role="slot.disclosure ? 'complementary' : undefined"
        :aria-label="slot.disclosure ? `${i18n.$t('ads.label')}: ${slot.ad.title}` : slot.ad.title"
      >
        <div v-if="showDeleteButton && slot.ad.bookmark_url" class="card-actions sponsored-edit">
          <button type="button" class="card-action-btn" :aria-label="`${i18n.$t('bookmarks.edit')}: ${slot.ad.title}`"
            :title="i18n.$t('bookmarks.edit')" @click.prevent.stop="openSponsoredEditor(slot)">
            <DashboardIcon name="edit" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
        <button
          v-if="slot.disclosure"
          type="button"
          :ref="infoRefFor(slot.key)"
          class="sponsored-info"
          :aria-label="i18n.$t('ads.whyTitle')"
          :aria-expanded="infoKey === slot.key"
          :aria-controls="infoKey === slot.key ? `sponsored-privacy-${slot.key}` : undefined"
          :aria-describedby="infoKey === slot.key ? `sponsored-privacy-${slot.key}` : undefined"
          @click.prevent.stop="infoKey = infoKey === slot.key ? '' : slot.key"
        >
          <DashboardIcon name="help" :size="15" :stroke-width="1.7" aria-hidden="true" />
        </button>
        <button
          v-if="showDeleteButton"
          type="button"
          class="house-dismiss"
          :class="{ 'paid-dismiss': slot.disclosure }"
          :title="i18n.$t(slot.disclosure ? 'ads.dismiss' : 'bookmarks.removeShortcut')"
          :aria-label="i18n.$t(slot.disclosure ? 'ads.dismiss' : 'bookmarks.removeShortcut')"
          @click.prevent.stop="dismissSponsored(slot)"
        >
          <DashboardIcon name="close" :size="12" :stroke-width="2" aria-hidden="true" />
        </button>

        <a
          :href="slot.ad.destination_url || undefined"
          :tabindex="slot.ad.destination_url ? undefined : 0"
          role="link"
          @keydown.enter.prevent="openSponsored(slot, $event)"
          class="speed-dial-link sponsored-link"
          target="_blank"
          :rel="slot.disclosure ? 'noopener noreferrer nofollow sponsored' : 'noopener noreferrer'"
          @click.prevent="openSponsored(slot, $event)"
        >
          <span
            class="speed-dial-icon sponsored-icon"
            :class="{ 'sponsored-icon--fallback': failedAdIcons[slot.key] }"
            aria-hidden="true"
          >
            <img
              v-if="!failedAdIcons[slot.key]"
              :src="slot.ad.icon_url || slot.ad.image_url"
              alt=""
              loading="eager"
              decoding="async"
              referrerpolicy="no-referrer"
              @error="failedAdIcons[slot.key] = true"
            />
            <span v-else>{{ bookmarkInitial(slot.ad) }}</span>
          </span>
          <span class="speed-dial-title" :title="slot.ad.title">{{ slot.ad.title }}</span>
        </a>

        <SponsoredTransparency
          v-if="slot.disclosure && infoKey === slot.key"
          :id="`sponsored-privacy-${slot.key}`"
          :anchor="infoElements[slot.key]"
          @close="infoKey = ''"
        />

      </article>


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
      :bookmark="sponsoredEdit?.bookmark || currentBookmarks.find(bookmark => bookmark.id === editingId) || null"
      :categories="categories"
      :normalize-url="normalizeBookmarkUrl"
      @close="closeEditor"
      @save="saveEditor"
    />
    <BookmarkUndoToast v-if="undo" :entry="undo" @undo="undo.undo()" @dismiss="undo.dismiss()" />
  </div>
</template>

<script>
import { defineAsyncComponent, markRaw } from 'vue';
import { readCreativeSnapshot, detectDeviceType, detectLanguage } from '../services/adCreativeSnapshot.js';
import { readCatalogSnapshot, catalogCategory, hiddenCatalogBookmarks, hideCatalogBookmark } from '../services/adsBookmarkCatalog.js';
import useI18nStore from '../stores/useI18nStore.js';
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';
import { cancelRemoteTask, scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';
import faviconService from '../services/FaviconService.js';
import { faviconDisplayUrl, readFaviconSnapshot, writeFaviconSnapshot } from '../services/faviconSnapshot.js';
import { readBookmarkSnapshot, writeBookmarkSnapshot } from '../bootstrap/bookmarkSnapshot.js';
import {
  requiresPaidDisclosure,
  speedDialLayoutStyles,
} from '../utils/startPageSettings.js';
import DashboardIcon from './icons/DashboardIcon.vue';
import { DEFAULT_CATEGORIES, cloneDefaults, bookmarkCategories, migrateDefaultBookmarks } from '../services/bookmarkDefaults.js';
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
      defaultCategories: DEFAULT_CATEGORIES,
      adCatalog: readCatalogSnapshot(),
      catalogLoading: false,
      catalogRequested: false,
      adSessions: {},
      adElements: {},
      infoElements: {},
      hiddenAds: hiddenCatalogBookmarks(),
      infoKey: '',
      failedAdIcons: {},
      adRuntime: null,
      adsService: null,
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
      sponsoredEdit: null,
      editorMode: '',
      editingId: '',
      pendingBookmarkDelete: '',
      undo: null,
      pendingCategoryDelete: '',
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
    visibleAds() {
      if (!this.showAds) return [];
      const available = Math.max(0, this.speedDialLimit - this.visibleBookmarks.length);
      return (this.adCatalog?.bookmarks || []).filter(bookmark => bookmark.default && !this.hiddenAds.includes(bookmark.key)
        && (!this.showSpeedDials || catalogCategory(bookmark, this.categories) === this.activeTab)
        && !['none', 'dismissed'].includes(this.adSessions[bookmark.key]?.store.source)).slice(0, available).map(bookmark => {
          const session = this.adSessions[bookmark.key];
          const ad = session?.store.displayAd || readCreativeSnapshot({ bookmark_key: bookmark.key }) || {
            title: bookmark.title, icon_url: bookmark.icon_url, bookmark_url: bookmark.url, disclosure_required: true, creative_preview: true };
          return { key: bookmark.key, bookmark, ad, disclosure: ad.creative_preview ? ad.disclosure_required === true : requiresPaidDisclosure(ad) };
        });
    },
  },
  watch: {
    visibleBookmarks() { void this.primeFavicons(); },
    activeTab() {
      if (this.bookmarksReady && !this.bookmarkSavePending) writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
    },
    infoKey() { this.handleAdPageVisibility(); },
    visibleAds() { this.$nextTick(() => this.syncAdSessions()); },
    showAds(enabled) {
      if (!enabled) {
        cancelRemoteTask('ads-catalog');
        this.disposeAdSessions();
        this.catalogRequested = false;
      } else void this.ensureAdRuntime();
    },
  },
  created() {
    this.adRefCallbacks = new Map();
    this.infoRefCallbacks = new Map();
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
      window.addEventListener('focus', this.handleAdPageVisibility);
      window.addEventListener('blur', this.handleAdPageVisibility);
      window.addEventListener('pagehide', this.handleAdPageHide);
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
    cancelRemoteTask('ads-catalog');
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAdPageVisibility);
      window.removeEventListener('focus', this.handleAdPageVisibility);
      window.removeEventListener('blur', this.handleAdPageVisibility);
      window.removeEventListener('pagehide', this.handleAdPageHide);
    }
    this.disposeAdSessions();
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
    async openSponsoredEditor(slot) {
      if (!this.bookmarksReady) return;
      await this.ensureAdRuntime(true);
      const session = this.adSessions[slot.key];
      const ad = await session?.decision();
      if (!ad) return;
      this.sponsoredEdit = { ad, key: slot.key, bookmark: { title: ad.title, url: new URL(ad.bookmark_url || slot.bookmark.url).toString() } };
      this.editingId = '';
      this.editorMode = 'bookmark';
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
      this.sponsoredEdit = null;
      this.editorMode = '';
      this.editingId = '';
    },
    saveEditor(value) {
      if (!this.bookmarksReady) return;
      if (this.sponsoredEdit && value.title === this.sponsoredEdit.bookmark.title && value.url === this.sponsoredEdit.bookmark.url) { this.closeEditor(); return; }
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
      if (this.sponsoredEdit) {
        const session = this.adSessions[this.sponsoredEdit.key];
        session?.finish('changed');
        session?.store.convertBookmark(this.sponsoredEdit.ad);
        this.hiddenAds = hideCatalogBookmark(this.sponsoredEdit.key);
      }
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
      if (!category || DEFAULT_CATEGORIES.includes(category) || this.categories.length <= 1) return;
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
      const migrated = stored ? migrateDefaultBookmarks(savedBookmarks) : cloneDefaults();
      const removedDefaults = stored && JSON.stringify(migrated) !== JSON.stringify(savedBookmarks);
      this.bookmarks = needsIds ? (await import('../services/bookmarkData.js')).normalizeBookmarks(migrated) : migrated;
      this.categories = bookmarkCategories(savedCategories);
      this.activeTab = this.categories.includes(this.activeTab) ? this.activeTab : this.categories[0];
      this.syncedState = this.bookmarkState();
      this.syncedAt = mirrorAt();
      this.bookmarksReady = true;
      this.storageListener = event => {
        if (event.key === STORAGE_KEY || event.key === CATEGORIES_KEY) this.requestRemoteSync();
        if (event.key?.startsWith('ads:bookmarks:hidden:v1:')) this.hiddenAds = hiddenCatalogBookmarks();
      };
      window.addEventListener('storage', this.storageListener);
      writeBookmarkSnapshot(this.categories, this.activeTab, this.currentBookmarks);
      // Ids must reach storage or each tab would invent its own.
      if (needsIds || removedDefaults || JSON.stringify(this.categories) !== JSON.stringify(savedCategories)) this.saveBookmarksDebounced();
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
    async ensureAdRuntime(interactive = false) {
      if (!this.showAds || (!this.remoteImagesReady && !interactive) || this.adRuntimeLoading || this.faviconsDisposed || document.visibilityState === 'hidden') return;
      this.adRuntimeLoading = true;
      try {
        if (!this.adRuntime) {
          this.adRuntime = await import('../services/BookmarkAdSession.js');
          this.adsService = markRaw((await import('../stores/useAdsStore.js')).getAdsService());
        }
        this.syncAdSessions();
        if (!this.catalogRequested) {
          this.catalogRequested = true;
          this.catalogLoading = true;
          const completed = await scheduleRemoteTask('ads-catalog', async signal => {
            const catalog = await this.adsService.fetchBookmarkCatalog({ device_type: detectDeviceType(), language: detectLanguage(), signal });
            if (signal.aborted || this.faviconsDisposed) return false;
            this.adCatalog = catalog;
            return true;
          }, { priority: 2 });
          if (!completed) this.catalogRequested = false;
        }
      } finally {
        this.catalogLoading = false;
        this.adRuntimeLoading = false;
        if (!this.faviconsDisposed) this.$nextTick(() => this.syncAdSessions());
      }
    },
    adRefFor(key) {
      if (!this.adRefCallbacks.has(key)) this.adRefCallbacks.set(key, element => this.bindAdElement(key, element));
      return this.adRefCallbacks.get(key);
    },
    infoRefFor(key) {
      if (!this.infoRefCallbacks.has(key)) this.infoRefCallbacks.set(key, element => {
        if (element) this.infoElements[key] = element;
        else delete this.infoElements[key];
      });
      return this.infoRefCallbacks.get(key);
    },
    bindAdElement(key, element) {
      if (element) this.adElements[key] = element;
      else delete this.adElements[key];
      this.adSessions[key]?.bind(element);
    },
    syncAdSessions() {
      if (!this.adRuntime || this.faviconsDisposed || !this.showAds) return;
      const keys = new Set(this.visibleAds.map(slot => slot.key));
      for (const [key, session] of Object.entries(this.adSessions)) if (!keys.has(key)) session.bind(null);
      for (const slot of this.visibleAds) {
        if (!this.adSessions[slot.key]) this.adSessions[slot.key] = this.adRuntime.createBookmarkAdSession(slot.key, {
          isInfoOpen: () => this.infoKey === slot.key,
          onImpression: ad => this.$emit('sponsored-impression', ad),
          onClick: ad => this.$emit('sponsored-click', ad),
          onBlocked: ad => this.$emit('accidental-click-blocked', ad),
        });
        this.adSessions[slot.key].bind(this.adElements[slot.key] || null);
      }
    },
    disposeAdSessions() {
      for (const session of Object.values(this.adSessions)) session.dispose();
      this.adSessions = {};
    },
    handleAdPageHide() {
      for (const session of Object.values(this.adSessions)) session.finish('navigation');
    },
    handleAdPageVisibility() {
      if (document.visibilityState === 'visible') {
        this.failedFavicons = {};
        void this.primeFavicons();
        void this.ensureAdRuntime();
      }
      for (const session of Object.values(this.adSessions)) session.visibility();
    },
    async dismissSponsored(slot) {
      await this.ensureAdRuntime(true);
      const session = this.adSessions[slot.key];
      await session?.decision();
      session?.finish('removed');
      session?.store.dismiss();
      this.hiddenAds = hideCatalogBookmark(slot.key);
      this.infoKey = '';
    },
    async openSponsored(slot, event) {
      await this.ensureAdRuntime(true);
      await this.adSessions[slot.key]?.open(event);
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
.house-dismiss {
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

.house-dismiss {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 6;
  border-radius: 50%;
}

.paid-dismiss {
  right: auto;
  left: 6px;
  opacity: 0;
  visibility: hidden;
}

.sponsored-card:hover .paid-dismiss,
.sponsored-card:focus-within .paid-dismiss {
  opacity: 1;
  visibility: visible;
}

.sponsored-edit { top: 34px; left: 6px; right: auto; }

.sponsored-info {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 6;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.sponsored-info:hover,
.sponsored-info:focus-visible {
  color: var(--color-text, #1a2b26);
  background: var(--surface-control-hover, rgba(255, 255, 255, 0.24));
}

.sponsored-info:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

.sponsored-card--info-open .sponsored-link {
  background: var(--surface-control-hover, rgba(255, 255, 255, 0.96));
}

@media (pointer: coarse) {
  .sponsored-info { width: 36px; height: 36px; }
  .paid-dismiss { opacity: 1; visibility: visible; }
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
