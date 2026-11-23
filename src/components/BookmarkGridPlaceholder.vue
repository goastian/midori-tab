<template>
  <div class="bookmark-grid bookmark-grid-placeholder" :style="containerStyle" aria-hidden="true">
    <div v-if="settings.showSpeedDials" class="tabs-bar">
      <div v-for="category in categories" :key="category" class="tab-item">
        <span class="tab-btn">{{ category }}</span>
      </div>
      <span v-if="settings.showAddSpeedDialButton" class="tab-add">+</span>
    </div>
    <div class="speed-dial-grid" :style="gridStyle">
      <div v-for="index in count" :key="index" class="speed-dial-card">
        <div class="speed-dial-link"></div>
      </div>
    </div>
  </div>
</template>

<script>
import { readBookmarkSnapshot } from '../bootstrap/bookmarkSnapshot.js';
import { DEFAULT_CATEGORIES } from '../services/bookmarkDefaults.js';
import { readCatalogSnapshot, catalogCategory, hiddenCatalogBookmarks } from '../services/adsBookmarkCatalog.js';
import { speedDialLayoutStyles } from '../utils/startPageSettings.js';
import '../styles/bookmark-layout.css';

export default {
  props: { settings: { type: Object, required: true } },
  data() {
    return { snapshot: readBookmarkSnapshot(), catalog: readCatalogSnapshot(), hiddenAds: hiddenCatalogBookmarks() };
  },
  computed: {
    categories() { return this.snapshot?.categories || DEFAULT_CATEGORIES; },
    layoutStyles() {
      return speedDialLayoutStyles({ size: this.settings.speedDialSize, columns: this.settings.speedDialColumns });
    },
    count() {
      const count = this.settings.showSpeedDials ? Math.min(this.snapshot?.items.length || 0, this.settings.speedDialLimit) : 0;
      const ads = this.settings.showAds ? (this.catalog?.bookmarks || []).filter(bookmark => bookmark.default && !this.hiddenAds.includes(bookmark.key)
        && (!this.settings.showSpeedDials || catalogCategory(bookmark, this.categories) === (this.snapshot?.activeTab || DEFAULT_CATEGORIES[0]))).length : 0;
      return count + Math.min(ads, Math.max(0, this.settings.speedDialLimit - count))
        + Number(this.settings.showSpeedDials && this.settings.showAddSpeedDialButton && count < this.settings.speedDialLimit);
    },
    containerStyle() { return this.layoutStyles.container; },
    gridStyle() { return this.layoutStyles.grid; },
  },
};
</script>

<style scoped>
.bookmark-grid-placeholder { visibility: hidden; }
</style>
