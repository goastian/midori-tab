<template>
  <div class="settings-section start-page-settings">
    <div class="section-header">
      <h3 class="section-title-main">{{ i18n.$t('startPage.title') }}</h3>
      <p class="section-subtitle">{{ i18n.$t('startPage.subtitle') }}</p>
    </div>

    <section class="settings-group" :aria-labelledby="'start-page-speed-dials'">
      <header class="settings-group__header">
        <span class="settings-group__index">01</span>
        <div>
          <h4 id="start-page-speed-dials">{{ i18n.$t('startPage.speedDials') }}</h4>
          <p>{{ i18n.$t('startPage.speedDialsDesc') }}</p>
        </div>
      </header>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('startPage.showSpeedDials') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.showSpeedDialsDesc') }}</span>
        </div>
        <button
          class="settings-switch"
          :class="{ 'is-on': settings.showSpeedDials }"
          type="button"
          role="switch"
          :aria-checked="settings.showSpeedDials"
          @click="settings.showSpeedDials = !settings.showSpeedDials"
        ><span></span></button>
      </div>

      <div class="setting-item setting-item--stacked" :class="{ 'is-disabled': !settings.showSpeedDials }">
        <label class="setting-info" for="settings-speed-dial-size">
          <span class="setting-label">{{ i18n.$t('startPage.thumbnailSize') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.thumbnailSizeDesc') }}</span>
        </label>
        <select id="settings-speed-dial-size" v-model="settings.speedDialSize" :disabled="!settings.showSpeedDials">
          <option v-for="size in speedDialSizes" :key="size" :value="size">
            {{ i18n.$t(`startPage.size.${size}`) }}
          </option>
        </select>
      </div>

      <div class="settings-pair" :class="{ 'is-disabled': !settings.showSpeedDials }">
        <label class="setting-field" for="settings-speed-dial-columns">
          <span>{{ i18n.$t('startPage.maximumColumns') }}</span>
          <select id="settings-speed-dial-columns" v-model.number="settings.speedDialColumns" :disabled="!settings.showSpeedDials">
            <option v-for="column in speedDialColumnOptions" :key="column" :value="column">{{ column }}</option>
          </select>
        </label>
        <label class="setting-field" for="settings-speed-dial-limit">
          <span>{{ i18n.$t('startPage.visibleShortcuts') }}</span>
          <select id="settings-speed-dial-limit" v-model.number="settings.speedDialLimit" :disabled="!settings.showSpeedDials">
            <option v-for="limit in speedDialLimitOptions" :key="limit" :value="limit">{{ limit }}</option>
          </select>
        </label>
      </div>

      <div class="setting-item setting-item--stacked" :class="{ 'is-disabled': !settings.showSpeedDials }">
        <label class="setting-info" for="settings-speed-dial-title">
          <span class="setting-label">{{ i18n.$t('startPage.speedDialTitle') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.speedDialTitleDesc') }}</span>
        </label>
        <select id="settings-speed-dial-title" v-model="settings.speedDialTitleMode" :disabled="!settings.showSpeedDials">
          <option v-for="mode in titleModes" :key="mode" :value="mode">
            {{ i18n.$t(`startPage.titleMode.${mode}`) }}
          </option>
        </select>
      </div>

      <div class="setting-item" :class="{ 'is-disabled': !settings.showSpeedDials }">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('startPage.showDeleteButton') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.showDeleteButtonDesc') }}</span>
        </div>
        <button
          class="settings-switch"
          :class="{ 'is-on': settings.showSpeedDialDeleteButton }"
          type="button"
          role="switch"
          :aria-checked="settings.showSpeedDialDeleteButton"
          :disabled="!settings.showSpeedDials"
          @click="settings.showSpeedDialDeleteButton = !settings.showSpeedDialDeleteButton"
        ><span></span></button>
      </div>

      <div class="setting-item" :class="{ 'is-disabled': !settings.showSpeedDials }">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('startPage.showAddButton') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.showAddButtonDesc') }}</span>
        </div>
        <button
          class="settings-switch"
          :class="{ 'is-on': settings.showAddSpeedDialButton }"
          type="button"
          role="switch"
          :aria-checked="settings.showAddSpeedDialButton"
          :disabled="!settings.showSpeedDials"
          @click="settings.showAddSpeedDialButton = !settings.showAddSpeedDialButton"
        ><span></span></button>
      </div>
    </section>

    <section class="settings-group" :aria-labelledby="'start-page-layout'">
      <header class="settings-group__header">
        <span class="settings-group__index">02</span>
        <div>
          <h4 id="start-page-layout">{{ i18n.$t('startPage.layout') }}</h4>
          <p>{{ i18n.$t('startPage.layoutDesc') }}</p>
        </div>
      </header>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('startPage.showSearch') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.showSearchDesc') }}</span>
        </div>
        <button
          class="settings-switch"
          :class="{ 'is-on': widgetsStore.enabled.search }"
          type="button"
          role="switch"
          :aria-checked="widgetsStore.enabled.search"
          @click="widgetsStore.toggle('search')"
        ><span></span></button>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">{{ i18n.$t('startPage.enableWidgets') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.enableWidgetsDesc') }}</span>
        </div>
        <button
          class="settings-switch"
          :class="{ 'is-on': settings.widgetsEnabled }"
          type="button"
          role="switch"
          :aria-checked="settings.widgetsEnabled"
          @click="settings.widgetsEnabled = !settings.widgetsEnabled"
        ><span></span></button>
      </div>

      <div class="setting-item setting-item--stacked" :class="{ 'is-disabled': !settings.widgetsEnabled }">
        <label class="setting-info" for="settings-widget-columns">
          <span class="setting-label">{{ i18n.$t('startPage.widgetColumns') }}</span>
          <span class="setting-description">{{ i18n.$t('startPage.widgetColumnsDesc') }}</span>
        </label>
        <select id="settings-widget-columns" v-model.number="settings.widgetColumns" :disabled="!settings.widgetsEnabled">
          <option v-for="column in widgetColumnOptions" :key="column" :value="column">{{ column }}</option>
        </select>
      </div>
    </section>

    <section class="settings-group settings-group--reset" :aria-labelledby="'start-page-reset'">
      <header class="settings-group__header">
        <span class="settings-group__index">03</span>
        <div>
          <h4 id="start-page-reset">{{ i18n.$t('startPage.resetTitle') }}</h4>
          <p>{{ i18n.$t('startPage.resetDesc') }}</p>
        </div>
      </header>
      <button class="reset-button" type="button" @click="resetDefaults">
        <DashboardIcon name="reset" :size="16" :stroke-width="1.7" aria-hidden="true" />
        {{ i18n.$t('startPage.resetButton') }}
      </button>
      <p v-if="resetComplete" class="reset-status" role="status">{{ i18n.$t('startPage.resetComplete') }}</p>
    </section>
  </div>
</template>

<script>
import DashboardIcon from '../icons/DashboardIcon.vue';
import { SPEED_DIAL_SIZES, SPEED_DIAL_TITLE_MODES } from '../../utils/startPageSettings.js';

export default {
  name: 'SettingsStartPageSection',
  components: { DashboardIcon },
  props: {
    i18n: { type: Object, required: true },
    settings: { type: Object, required: true },
    widgetsStore: { type: Object, required: true },
  },
  data() {
    return {
      resetComplete: false,
      speedDialSizes: SPEED_DIAL_SIZES,
      titleModes: SPEED_DIAL_TITLE_MODES,
      speedDialColumnOptions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
      speedDialLimitOptions: [4, 6, 8, 10, 12, 16, 20, 24],
      widgetColumnOptions: [1, 2, 3, 4],
    };
  },
  methods: {
    resetDefaults() {
      this.settings.resetStartPageSettings();
      this.widgetsStore.resetToDefaults();
      this.resetComplete = true;
    },
  },
};
</script>

<style scoped>
.start-page-settings {
  padding-bottom: 0.5rem;
}

.settings-group {
  display: grid;
  gap: 0.62rem;
  padding-top: 0.25rem;
}

.settings-group + .settings-group {
  margin-top: 0.8rem;
  padding-top: 1rem;
  border-top: 1px solid var(--color-border, rgba(126, 196, 168, 0.12));
}

.settings-group__header {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  padding: 0 0.12rem 0.16rem;
}

.settings-group__index {
  min-width: 1.75rem;
  padding-top: 0.08rem;
  color: var(--color-primary, #04a469);
  font-size: 0.66rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
}

.settings-group__header h4 {
  margin: 0;
  color: var(--color-text, #c4f0e0);
  font-size: 0.86rem;
  font-weight: 650;
}

.settings-group__header p {
  margin: 0.16rem 0 0;
  color: var(--color-text-muted, #5a9a82);
  font-size: 0.7rem;
  line-height: 1.35;
}

.settings-switch {
  width: 40px;
  height: 23px;
  flex: 0 0 auto;
  position: relative;
  padding: 0;
  background: var(--surface-overlay, #1e2d3d);
  border: 1px solid var(--color-border, rgba(126, 196, 168, 0.16));
  border-radius: 99px;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease;
}

.settings-switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 15px;
  height: 15px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: transform 180ms ease;
}

.settings-switch.is-on {
  background: var(--color-primary, #04a469);
  border-color: var(--color-primary, #04a469);
}

.settings-switch.is-on span {
  transform: translateX(17px);
}

.settings-switch:disabled,
.is-disabled {
  opacity: 0.48;
}

.settings-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.62rem;
}

.setting-field {
  display: grid;
  gap: 0.45rem;
  padding: 0.82rem 0.9rem;
  color: var(--color-text, #c4f0e0);
  background: var(--surface-raised, #0f1520);
  border: 1px solid var(--color-border, rgba(126, 196, 168, 0.1));
  border-radius: var(--radius-md, 10px);
  font-size: 0.78rem;
  font-weight: 550;
}

select {
  width: 100%;
  height: 35px;
  padding: 0 0.72rem;
  color: var(--color-text, #c4f0e0);
  background: var(--surface-sunken, #060a10);
  border: 1px solid var(--color-border, rgba(126, 196, 168, 0.14));
  border-radius: var(--radius-sm, 7px);
  font: inherit;
  cursor: pointer;
}

select:disabled {
  cursor: not-allowed;
}

.settings-switch:focus-visible,
select:focus-visible,
.reset-button:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

.settings-group--reset {
  padding-bottom: 0.4rem;
}

.reset-button {
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  padding: 0.54rem 0.8rem;
  color: var(--color-text, #c4f0e0);
  background: transparent;
  border: 1px solid var(--color-border-hover, rgba(126, 196, 168, 0.24));
  border-radius: 9px;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, transform 160ms ease;
}

.reset-button:hover {
  background: var(--surface-overlay, #1e2d3d);
  border-color: var(--color-primary, #04a469);
}

.reset-button:active {
  transform: translateY(1px);
}

.reset-status {
  margin: 0;
  color: var(--color-primary-hover, #4de0b2);
  font-size: 0.72rem;
  text-align: center;
}

@media (max-width: 420px) {
  .settings-pair {
    grid-template-columns: 1fr;
  }
}
</style>
