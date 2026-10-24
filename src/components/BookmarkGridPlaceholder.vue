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
import { DEFAULT_BOOKMARKS, DEFAULT_CATEGORIES } from '../services/bookmarkDefaults.js';
import { speedDialLayoutStyles } from '../utils/startPageSettings.js';
import '../styles/bookmark-layout.css';

export default {
  props: { settings: { type: Object, required: true } },
  data() {
    return { snapshot: readBookmarkSnapshot() };
  },
  computed: {
    categories() { return this.snapshot?.categories || DEFAULT_CATEGORIES; },
    layoutStyles() {
      return speedDialLayoutStyles({ size: this.settings.speedDialSize, columns: this.settings.speedDialColumns });
    },
    count() {
      const count = this.snapshot?.items.length ?? DEFAULT_BOOKMARKS[DEFAULT_CATEGORIES[0]].length;
      return (this.settings.showSpeedDials ? Math.min(count, this.settings.speedDialLimit)
        + Number(this.settings.showAddSpeedDialButton && count < this.settings.speedDialLimit) : 0)
        + Number(this.settings.showAds);
    },
    containerStyle() { return this.layoutStyles.container; },
    gridStyle() { return this.layoutStyles.grid; },
  },
};
</script>

<style scoped>
.bookmark-grid-placeholder { visibility: hidden; }
</style>
