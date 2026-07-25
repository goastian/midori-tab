<template>
  <div class="bookmark-grid">
    <!-- Category tabs -->
    <div class="tabs-bar">
      <div
        v-for="cat in categories"
        :key="cat"
        class="tab-item"
        :class="{ active: cat === activeTab }"
      >
        <button class="tab-btn" @click="activeTab = cat">{{ cat }}</button>
        <button
          v-if="categories.length > 1"
          class="tab-delete"
          @click.stop="deleteCategory(cat)"
          :title="t.deleteCategory"
          :aria-label="t.deleteCategory"
        >x</button>
      </div>
      <button class="tab-add" @click="addCategory" :title="t.addCategory">+</button>
    </div>

    <!-- Bookmarks grid -->
    <div class="grid">
      <div
        v-for="(bm, idx) in currentBookmarks"
        :key="idx"
        class="card"
      >
        <div class="card-actions">
          <button class="card-action-btn" @click.prevent="editBookmark(idx)" :title="t.edit" :aria-label="t.edit">
            <DashboardIcon name="edit" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
          <button class="card-action-btn" @click.prevent="deleteBookmark(idx)" :title="t.delete" :aria-label="t.delete">
            <DashboardIcon name="trash" :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </div>
        <a
          :href="bm.url"
          class="card-link"
          :target="openTarget === 'Self Tab' ? '_self' : '_blank'"
        >
          <div class="card-icon">
            <img
              :src="getFaviconUrl(bm)"
              :alt="bm.title"
              @error="onImgError($event, bm)"
            />
          </div>
          <span class="card-title">{{ bm.title }}</span>
        </a>
      </div>

      <!-- Paid inventory is a real shortcut, not a separate content card. -->
      <div
        v-if="showAds && (!adRequestComplete || adsStore.hasAd)"
        ref="sponsoredCard"
        class="card sponsored-card"
        :class="{ 'sponsored-card--pending': !adsStore.hasAd }"
        role="complementary"
        :aria-label="sponsoredAriaLabel"
        :aria-hidden="!adsStore.hasAd"
      >
        <template v-if="adsStore.hasAd">
          <span class="sponsored-badge" :title="sponsoredBadge">{{ sponsoredBadge }}</span>
          <button
            type="button"
            class="sponsored-dismiss"
            :title="i18n.$t('ads.dismiss') || 'Dismiss ad'"
            :aria-label="i18n.$t('ads.dismiss') || 'Dismiss ad'"
            @click.prevent.stop="dismissSponsored"
          >×</button>

          <a
            :href="ad.destination_url"
            class="card-link sponsored-link"
            target="_blank"
            rel="noopener noreferrer nofollow sponsored"
            @click.prevent="openSponsored"
          >
            <div
              class="card-icon sponsored-icon"
              :class="{ 'sponsored-icon--fallback': iconFailed }"
              aria-hidden="true"
            >
              <img
                v-if="!iconFailed"
                :src="adIconUrl"
                alt=""
                width="38"
                height="38"
                loading="lazy"
                decoding="async"
                referrerpolicy="no-referrer"
                @error="iconFailed = true"
              />
              <span v-else>{{ sponsoredInitial }}</span>
            </div>
            <span class="card-title" :title="ad.title">{{ ad.title }}</span>
          </a>
        </template>
      </div>

      <!-- Add bookmark button -->
      <div v-if="currentBookmarks.length < 8" class="card card-add">
        <button class="card-link add-link" @click.prevent="addBookmark">
          <div class="card-icon add-icon">+</div>
          <span class="card-title">{{ t.add }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import useAdsStore from '../stores/useAdsStore.js';
import {
  AD_VIEWABILITY_THRESHOLD,
  createAdViewabilityTracker,
} from '../services/AdViewability.js';
import { flushDebounced, getJson, setJsonDebounced } from '../services/StorageService.js';
import DashboardIcon from './icons/DashboardIcon.vue';

const STORAGE_KEY = 'midori_bookmarks';
const CATS_KEY = 'midori_bookmark_categories';

const DEFAULT_CATEGORIES = ['Personal', 'Travel', 'Web3'];

const DEFAULT_BOOKMARKS = {
  Personal: [
    { title: 'Support Midori', url: 'https://astian.org/community', domain: 'astian.org' },
    { title: 'Amazon', url: 'https://amzn.to/47IiNIO', domain: 'amazon.com' },
    { title: 'Kayak', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fflights', domain: 'kayak.com' },
    { title: 'Aliexpress', url: 'https://s.click.aliexpress.com/e/_c2xYL4uP', domain: 'aliexpress.us' },
    { title: 'Ebay', url: 'https://ebay.us/Tg0rAn', domain: 'ebay.us' },
    { title: 'Stake', url: 'https://stake.com/?offer=astian200bon&c=pkaAEpM7', domain: 'stake.com' },
  ],
  Travel: [
    { title: 'Kayak Hotels', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fhotels', domain: 'kayak.com' },
    { title: 'Kayak Cars', url: 'https://www.kayak.com/in?a=kan_318921_594075&lc=en&url=%2Fcars', domain: 'kayak.com' },
  ],
  Web3: [
    { title: 'MiWallet', url: 'https://wallet.astian.org', domain: 'wallet.astian.org' },
    { title: 'ChangeNow', url: 'https://changenow.app.link/referral?link_id=7c257bad8fcf09', domain: 'changenow.io' },

  ],
};

export default {
  name: 'BookmarkGrid',
  components: {
    DashboardIcon,
  },

  props: {
    /** How links open: 'Self Tab' | 'New Tab' */
    openTarget: { type: String, default: 'Self Tab' },
    /** Global user opt-out from the New Tab settings. */
    showAds: { type: Boolean, default: true },
  },

  data() {
    const i18n = useI18nStore();

    return {
      bookmarks: JSON.parse(JSON.stringify(DEFAULT_BOOKMARKS)),
      categories: [...DEFAULT_CATEGORIES],
      activeTab: DEFAULT_CATEGORIES[0],
      faviconAttempts: {},
      i18n,
      adsStore: useAdsStore(),
      isLoaded: false,
      adRequested: false,
      adRequestComplete: false,
      adObserver: null,
      adViewability: null,
      iconFailed: false,
    };
  },

  computed: {
    /** Returns i18n translations for bookmarks UI. */
    t() {
      return {
        add: this.i18n.$t('bookmarks.add'),
        edit: this.i18n.$t('bookmarks.edit'),
        delete: this.i18n.$t('bookmarks.delete'),
        addCategory: this.i18n.$t('bookmarks.addCategory'),
        deleteCategory: this.i18n.$t('bookmarks.deleteCategory'),
        newCategory: this.i18n.$t('bookmarks.newCategory'),
        bookmarkName: this.i18n.$t('bookmarks.bookmarkName'),
        bookmarkUrl: this.i18n.$t('bookmarks.bookmarkUrl'),
        confirmDelete: this.i18n.$t('bookmarks.confirmDelete'),
      };
    },
    currentBookmarks() {
      return this.bookmarks[this.activeTab] || [];
    },
    ad() {
      return this.adsStore.currentAd || {};
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
      const label = this.i18n.$t('ads.label') || 'Sponsored content';
      return this.adsStore.hasAd && this.ad.title ? `${label}: ${this.ad.title}` : label;
    },
  },

  watch: {
    showAds(enabled) {
      if (!enabled) {
        this.teardownAdObserver();
        return;
      }

      if (!this.adsStore.hasAd) {
        this.adRequested = false;
        this.adRequestComplete = false;
      }
      this.$nextTick(() => this.setupAdObserver());
    },

    'adsStore.currentAd'(ad) {
      this.iconFailed = false;
      if (this.showAds && ad) {
        this.$nextTick(() => this.setupAdObserver());
      } else {
        this.teardownAdObserver();
      }
    },
  },

  methods: {
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
            if (
              accepted
              && this.adsStore.currentAd?.decision_id === trackedAd?.decision_id
            ) {
              this.$emit('sponsored-impression', trackedAd);
            }
          },
        });
        this.adViewability.setPageVisible(
          typeof document === 'undefined' || document.visibilityState === 'visible',
        );
      }

      if (typeof IntersectionObserver === 'undefined') {
        const visibleEntry = { isIntersecting: true, intersectionRatio: 1 };
        if (this.adsStore.hasAd) {
          this.adViewability?.update(visibleEntry);
        } else {
          this.loadAdWhenVisible();
        }
        return;
      }

      this.adObserver = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;

        const isVisible = entry.isIntersecting
          && entry.intersectionRatio >= AD_VIEWABILITY_THRESHOLD;
        if (!this.adsStore.hasAd) {
          if (isVisible) this.loadAdWhenVisible();
          return;
        }

        this.adViewability?.update(entry);
      }, { threshold: [0, AD_VIEWABILITY_THRESHOLD, 1] });

      this.adObserver.observe(element);
    },

    teardownAdObserver() {
      if (this.adObserver) {
        try { this.adObserver.disconnect(); } catch (_) { /* ignore */ }
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
      }
    },

    dismissSponsored() {
      this.adsStore.dismiss();
    },

    openSponsored() {
      const clickedAd = this.adsStore.currentAd;
      if (!clickedAd) return;
      if (this.adsStore.trackClick()) {
        this.$emit('sponsored-click', clickedAd);
      }
    },

    async loadBookmarks() {
      const [savedBm, savedCats] = await Promise.all([
        getJson(STORAGE_KEY, null),
        getJson(CATS_KEY, null),
      ]);
      if (savedBm && typeof savedBm === 'object') {
        this.bookmarks = savedBm;
      }
      if (Array.isArray(savedCats) && savedCats.length) {
        this.categories = savedCats;
      }
      this.activeTab = this.categories[0] || 'Personal';
      this.isLoaded = true;
    },

    saveBookmarksDebounced() {
      setJsonDebounced(STORAGE_KEY, this.bookmarks, { delayMs: 700, maxBytes: 350_000 });
      setJsonDebounced(CATS_KEY, this.categories, { delayMs: 700, maxBytes: 32_000 });
    },

    async flushBookmarks() {
      await Promise.all([
        flushDebounced(STORAGE_KEY, this.bookmarks, { maxBytes: 350_000 }),
        flushDebounced(CATS_KEY, this.categories, { maxBytes: 32_000 }),
      ]);
    },

    addCategory() {
      const name = prompt(this.t.newCategory);
      if (!name || !name.trim()) return;
      const trimmed = name.trim();
      if (this.categories.includes(trimmed)) return;
      this.categories.push(trimmed);
      this.bookmarks[trimmed] = [];
      this.activeTab = trimmed;
      this.saveBookmarksDebounced();
    },

    deleteCategory(cat) {
      if (this.categories.length <= 1) return;
      const count = (this.bookmarks[cat] || []).length;
      const msg = `${this.t.confirmDelete} "${cat}"? (${count} marcadores)`;
      if (!confirm(msg)) return;
      const idx = this.categories.indexOf(cat);
      if (idx > -1) this.categories.splice(idx, 1);
      delete this.bookmarks[cat];
      if (this.activeTab === cat) this.activeTab = this.categories[0];
      this.saveBookmarksDebounced();
    },

    addBookmark() {
      const title = prompt(this.t.bookmarkName);
      if (!title) return;
      const url = prompt(this.t.bookmarkUrl, 'https://');
      if (!url) return;
      try {
        const domain = new URL(url).hostname;
        this.bookmarks[this.activeTab].push({ title, url, domain });
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    /**
     * Adds a bookmark programmatically from an external caller (e.g. parent via ref).
     * @param {string} title - Bookmark display name.
     * @param {string} url - Bookmark URL.
     */
    addBookmarkExternal(title, url) {
      try {
        const domain = new URL(url).hostname;
        if (!this.bookmarks[this.activeTab]) {
          this.bookmarks[this.activeTab] = [];
        }
        this.bookmarks[this.activeTab].push({ title, url, domain });
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    editBookmark(idx) {
      const bm = this.bookmarks[this.activeTab][idx];
      const title = prompt(this.t.bookmarkName, bm.title);
      if (!title) return;
      const url = prompt(this.t.bookmarkUrl, bm.url);
      if (!url) return;
      try {
        bm.title = title;
        bm.url = url;
        bm.domain = new URL(url).hostname;
        delete bm.logo;
        this.saveBookmarksDebounced();
      } catch { /* invalid url */ }
    },

    deleteBookmark(idx) {
      const bm = this.bookmarks[this.activeTab][idx];
      if (!confirm(`${this.t.confirmDelete} "${bm.title}"?`)) return;
      this.bookmarks[this.activeTab].splice(idx, 1);
      this.saveBookmarksDebounced();
    },

    /** Returns the best favicon URL for a bookmark, cycling through services on error. */
    getFaviconUrl(item) {
      if (item.logo) return item.logo;
      const domain = item.domain || this.extractDomain(item.url);
      const attempt = this.faviconAttempts[domain] || 0;
      const services = [
        `https://icons.duckduckgo.com/ip3/${domain}.ico`,
        `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
        `https://${domain}/favicon.ico`,
      ];
      return services[Math.min(attempt, services.length - 1)];
    },

    extractDomain(url) {
      try { return new URL(url).hostname; } catch { return url; }
    },

    onImgError(event, item) {
      const img = event.target;
      const domain = item.domain || this.extractDomain(item.url);
      const cur = this.faviconAttempts[domain] || 0;
      if (cur < 2) {
        this.faviconAttempts[domain] = cur + 1;
        img.src = this.getFaviconUrl(item);
      } else {
        // Fallback: show initial letter
        img.style.display = 'none';
        const container = img.parentNode;
        const colors = ['#04A469', '#0984e3', '#7c3aed', '#e17055', '#fdcb6e', '#00cec9'];
        container.style.backgroundColor = colors[item.title.charCodeAt(0) % colors.length];
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.fontSize = '1.3rem';
        container.style.fontWeight = '700';
        container.style.color = 'white';
        container.textContent = item.title.charAt(0).toUpperCase();
      }
    },
  },

  mounted() {
    this.loadBookmarks();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.$nextTick(() => this.setupAdObserver());
  },

  beforeUnmount() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleAdPageVisibility);
    }
    this.teardownAdObserver();
    this.flushBookmarks();
  },
};
</script>

<style scoped>
.bookmark-grid {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* ── Tabs ── */
.tabs-bar {
  display: flex;
  gap: 0.25rem;
  flex-wrap: wrap;
  align-items: center;
  background: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  padding: var(--nova-segment-padding, 4px);
  border-radius: var(--nova-island-radius, 12px);
  box-shadow: var(--shadow-flat, 0 1px 3px rgba(0,0,0,0.14));
  align-self: flex-start;
}

.tab-item {
  position: relative;
  display: flex;
  align-items: center;
}

.tab-btn {
  padding: 6px 1rem;
  border: none;
  cursor: pointer;
  font-weight: 500;
  font-size: 0.8rem;
  background: transparent;
  color: var(--color-text-muted, #5A9A82);
  border-radius: var(--nova-control-radius, 8px);
  transition: all var(--transition-fast, 0.1s ease);
}

.tab-item.active .tab-btn {
  background: var(--surface-control-hover, rgba(4,164,105,0.08));
  color: var(--color-text, #C4F0E0);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
}

.tab-btn:hover {
  color: var(--color-text, #C4F0E0);
}

.tab-delete {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: none;
  background: var(--accent-danger, #e17055);
  color: white;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--transition-fast, 0.1s ease);
  z-index: 5;
}

.tab-item:hover .tab-delete {
  opacity: 1;
}

.tab-add {
  padding: 6px 0.8rem;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  background: var(--color-primary, #04A469);
  color: white;
  border-radius: var(--nova-control-radius, 8px);
  transition: background var(--transition-fast, 0.1s ease);
}

.tab-add:hover {
  background: var(--color-primary-hover, #4de0b2);
}

/* ── Grid ── */
.grid {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 0.55rem;
}

.card {
  position: relative;
  border-radius: var(--nova-panel-radius, 14px);
  overflow: visible;
}

.card-actions {
  display: none;
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 2;
  gap: 0.25rem;
}

.card:hover .card-actions {
  display: flex;
}

.card-action-btn {
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  width: 22px;
  height: 22px;
  border: none;
  font-size: 0.7rem;
  background: var(--surface-control, #1E2D3D);
  color: var(--color-text-muted, #5A9A82);
  display: flex;
  align-items: center;
  justify-content: center;
}

.card-link {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
  padding: 0.85rem 0.55rem;
  background: var(--surface-island, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--nova-panel-radius, 14px);
  text-decoration: none;
  color: var(--color-text, #C4F0E0);
  cursor: pointer;
  transition: all var(--transition-fast, 0.1s ease);
  min-height: 84px;
  justify-content: center;
}

.card-link:hover {
  background: var(--surface-control-hover, #1E2D3D);
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.card-icon {
  width: 38px;
  height: 38px;
  border-radius: var(--nova-control-radius, 8px);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.card-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--nova-control-radius, 8px);
}

.card-title {
  font-size: 0.75rem;
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

/* Sponsored shortcut */
.sponsored-card--pending {
  position: absolute;
  inset: 0;
  z-index: 0;
  opacity: 0;
  pointer-events: none;
}

.sponsored-link {
  position: relative;
  padding-top: 1.25rem;
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.sponsored-badge {
  position: absolute;
  top: 6px;
  left: 7px;
  z-index: 2;
  max-width: calc(100% - 38px);
  padding: 2px 5px;
  overflow: hidden;
  border-radius: 4px;
  color: var(--color-text-muted, #5A9A82);
  background: var(--surface-control, #1E2D3D);
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.2;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: none;
}

.sponsored-dismiss {
  position: absolute;
  top: 5px;
  right: 5px;
  z-index: 3;
  display: flex;
  width: 20px;
  height: 20px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: var(--color-text-muted, #5A9A82);
  background: var(--surface-control, #1E2D3D);
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
}

.sponsored-dismiss:hover,
.sponsored-dismiss:focus-visible {
  color: white;
  background: var(--accent-danger, #e17055);
}

.sponsored-icon {
  background: var(--surface-control, #1E2D3D);
}

.sponsored-icon--fallback {
  color: white;
  background: var(--color-primary, #04A469);
  font-size: 1.2rem;
  font-weight: 700;
}

/* Add card */
.add-link {
  border: none;
  width: 100%;
}

.add-icon {
  background: var(--color-text-muted, #5A9A82);
  color: white;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 40px;
  user-select: none;
}
</style>
