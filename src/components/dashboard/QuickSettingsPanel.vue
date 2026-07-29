<template>
  <Teleport to="body">
    <Transition name="quick-panel">
      <div v-if="visible" class="quick-overlay" @click="$emit('close')">
        <aside
          ref="quickPanel"
          class="quick-panel"
          role="dialog"
          aria-modal="true"
          :aria-label="i18n.$t('dashboard.quickSettings.title')"
          tabindex="-1"
          @click.stop
        >
          <header class="quick-header">
            <div>
              <span class="quick-eyebrow">Midori</span>
              <h2 class="quick-title">{{ i18n.$t('dashboard.quickSettings.title') }}</h2>
            </div>
            <button
              class="quick-close"
              type="button"
              @click="$emit('close')"
              :aria-label="i18n.$t('dashboard.quickSettings.close')"
            >
              <DashboardIcon name="close" :size="16" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>

          <div class="quick-content">
            <section class="quick-section">
              <h3>{{ i18n.$t('dashboard.quickSettings.appearance') }}</h3>
              <button class="quick-row quick-row--button" type="button" @click="tab.setTheme()">
                <span>{{ i18n.$t('dashboard.quickSettings.theme') }}</span>
                <span class="quick-value">
                  {{ tab.theme === 'light' ? i18n.$t('dashboard.quickSettings.themeLight') : i18n.$t('dashboard.quickSettings.themeDark') }}
                </span>
              </button>
              <button class="quick-row quick-row--button" type="button" @click="$emit('refresh-wallpaper')">
                <span>{{ i18n.$t('dashboard.quickSettings.wallpaper') }}</span>
                <span class="quick-value">{{ i18n.$t('dashboard.quickSettings.refresh') }}</span>
              </button>
            </section>

            <section class="quick-section">
              <h3>{{ i18n.$t('dashboard.quickSettings.startPage') }}</h3>
              <div class="quick-row">
                <span>{{ i18n.$t('dashboard.quickSettings.showSpeedDials') }}</span>
                <button
                  class="quick-switch"
                  :class="{ 'is-on': tab.showSpeedDials }"
                  type="button"
                  role="switch"
                  :aria-checked="tab.showSpeedDials"
                  @click="tab.showSpeedDials = !tab.showSpeedDials"
                ><span></span></button>
              </div>
              <div class="quick-row">
                <span>{{ i18n.$t('dashboard.quickSettings.search') }}</span>
                <button
                  class="quick-switch"
                  :class="{ 'is-on': widgetsStore.enabled.search }"
                  type="button"
                  role="switch"
                  :aria-checked="widgetsStore.enabled.search"
                  @click="$emit('toggle-section', 'search')"
                ><span></span></button>
              </div>
            </section>

            <section class="quick-section">
              <h3>{{ i18n.$t('dashboard.quickSettings.speedDials') }}</h3>
              <label class="quick-row" for="quick-speed-dial-size">
                <span>{{ i18n.$t('dashboard.quickSettings.thumbnailSize') }}</span>
                <select id="quick-speed-dial-size" v-model="tab.speedDialSize">
                  <option v-for="size in speedDialSizes" :key="size" :value="size">
                    {{ i18n.$t(`startPage.size.${size}`) }}
                  </option>
                </select>
              </label>
              <label class="quick-row" for="quick-speed-dial-columns">
                <span>{{ i18n.$t('dashboard.quickSettings.maximumColumns') }}</span>
                <select id="quick-speed-dial-columns" v-model.number="tab.speedDialColumns">
                  <option v-for="column in speedDialColumnOptions" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
              <label class="quick-row" for="quick-speed-dial-limit">
                <span>{{ i18n.$t('dashboard.quickSettings.visibleShortcuts') }}</span>
                <select id="quick-speed-dial-limit" v-model.number="tab.speedDialLimit">
                  <option v-for="limit in speedDialLimitOptions" :key="limit" :value="limit">{{ limit }}</option>
                </select>
              </label>
              <label class="quick-row" for="quick-speed-dial-title">
                <span>{{ i18n.$t('dashboard.quickSettings.speedDialTitle') }}</span>
                <select id="quick-speed-dial-title" v-model="tab.speedDialTitleMode">
                  <option v-for="mode in titleModes" :key="mode" :value="mode">
                    {{ i18n.$t(`startPage.titleMode.${mode}`) }}
                  </option>
                </select>
              </label>
              <div class="quick-row">
                <span>{{ i18n.$t('dashboard.quickSettings.showDeleteButton') }}</span>
                <button
                  class="quick-switch"
                  :class="{ 'is-on': tab.showSpeedDialDeleteButton }"
                  type="button"
                  role="switch"
                  :aria-checked="tab.showSpeedDialDeleteButton"
                  @click="tab.showSpeedDialDeleteButton = !tab.showSpeedDialDeleteButton"
                ><span></span></button>
              </div>
              <div class="quick-row">
                <span>{{ i18n.$t('dashboard.quickSettings.showAddButton') }}</span>
                <button
                  class="quick-switch"
                  :class="{ 'is-on': tab.showAddSpeedDialButton }"
                  type="button"
                  role="switch"
                  :aria-checked="tab.showAddSpeedDialButton"
                  @click="tab.showAddSpeedDialButton = !tab.showAddSpeedDialButton"
                ><span></span></button>
              </div>
            </section>

            <section class="quick-section">
              <h3>{{ i18n.$t('dashboard.quickSettings.widgets') }}</h3>
              <div class="quick-row">
                <span>{{ i18n.$t('dashboard.quickSettings.enableWidgets') }}</span>
                <button
                  class="quick-switch"
                  :class="{ 'is-on': tab.widgetsEnabled }"
                  type="button"
                  role="switch"
                  :aria-checked="tab.widgetsEnabled"
                  @click="tab.widgetsEnabled = !tab.widgetsEnabled"
                ><span></span></button>
              </div>
              <label class="quick-row" for="quick-widget-columns">
                <span>{{ i18n.$t('dashboard.quickSettings.columns') }}</span>
                <select id="quick-widget-columns" v-model.number="tab.widgetColumns" :disabled="!tab.widgetsEnabled">
                  <option v-for="column in widgetColumnOptions" :key="column" :value="column">{{ column }}</option>
                </select>
              </label>
            </section>
          </div>

          <footer class="quick-footer">
            <button class="open-start-page" type="button" @click="$emit('open-start-page-settings')">
              <DashboardIcon name="settings" :size="16" :stroke-width="1.7" aria-hidden="true" />
              {{ i18n.$t('dashboard.quickSettings.openStartPageSettings') }}
            </button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue';
import DashboardIcon from '../icons/DashboardIcon.vue';
import { SPEED_DIAL_SIZES, SPEED_DIAL_TITLE_MODES } from '../../utils/startPageSettings.js';

export default {
  name: 'QuickSettingsPanel',
  components: { DashboardIcon },
  props: {
    visible: { type: Boolean, default: false },
    tab: { type: Object, required: true },
    widgetsStore: { type: Object, required: true },
    i18n: { type: Object, required: true },
  },
  emits: [
    'close',
    'toggle-section',
    'refresh-wallpaper',
    'open-start-page-settings',
  ],
  data() {
    return {
      speedDialSizes: SPEED_DIAL_SIZES,
      titleModes: SPEED_DIAL_TITLE_MODES,
      speedDialColumnOptions: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
      speedDialLimitOptions: [4, 6, 8, 10, 12, 16, 20, 24],
      widgetColumnOptions: [1, 2, 3, 4],
    };
  },
  watch: {
    visible(isVisible) {
      if (isVisible) {
        nextTick(() => this.$refs.quickPanel?.focus());
      }
    },
  },
  mounted() {
    document.addEventListener('keydown', this.handleEscape);
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleEscape);
  },
  methods: {
    handleEscape(event) {
      if (event.key === 'Escape' && this.visible) {
        this.$emit('close');
      }
    },
  },
};
</script>

<style scoped>
.quick-overlay {
  position: fixed;
  inset: 0;
  z-index: 8500;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
  padding: 0.75rem;
  background: transparent;
}

.quick-panel {
  width: 380px;
  max-width: calc(100vw - 1.5rem);
  height: calc(100dvh - 1.5rem);
  max-height: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--color-text, #1a2b26);
  background: var(--surface-base, #f5f8f7);
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.16));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 24px 70px rgba(4, 28, 20, 0.24), inset 0 1px rgba(255, 255, 255, 0.2);
  outline: none;
}

.quick-header {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  padding: 0.9rem 1rem 0.8rem;
  border-bottom: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
  background: var(--surface-island, rgba(255, 255, 255, 0.78));
}

.quick-eyebrow {
  display: block;
  margin-bottom: 0.08rem;
  color: var(--color-primary, #047a50);
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.quick-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 650;
  letter-spacing: -0.015em;
}

.quick-close {
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
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
}

.quick-close:hover,
.quick-close:focus-visible {
  color: var(--color-text, #1a2b26);
  background: var(--surface-control-hover, rgba(255, 255, 255, 0.8));
  border-color: var(--color-border, rgba(34, 75, 61, 0.14));
}

.quick-content {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 0 1rem;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.quick-section {
  padding: 0.9rem 0 0.82rem;
  border-bottom: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
}

.quick-section:last-child {
  border-bottom: 0;
}

.quick-section h3 {
  margin: 0 0 0.45rem;
  color: var(--color-text-muted, #4d6c60);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

.quick-row {
  min-height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: var(--color-text, #1a2b26);
  font-size: 0.79rem;
  font-weight: 500;
}

.quick-row--button {
  width: 100%;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  text-align: left;
}

.quick-row--button:hover .quick-value,
.quick-row--button:focus-visible .quick-value {
  color: var(--color-primary, #047a50);
}

.quick-value {
  color: var(--color-text-muted, #5a7b6d);
  transition: color 150ms ease;
}

.quick-row select {
  min-width: 104px;
  max-width: 148px;
  height: 30px;
  padding: 0 1.8rem 0 0.62rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-control, rgba(255, 255, 255, 0.72));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.16));
  border-radius: 8px;
  font: inherit;
  cursor: pointer;
}

.quick-row select:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.quick-switch {
  width: 38px;
  height: 22px;
  flex: 0 0 auto;
  position: relative;
  padding: 0;
  background: var(--surface-control, rgba(75, 101, 91, 0.24));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.16));
  border-radius: 99px;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease;
}

.quick-switch span {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(7, 31, 23, 0.28);
  transition: transform 180ms ease;
}

.quick-switch.is-on {
  background: var(--color-primary, #04a469);
  border-color: var(--color-primary, #04a469);
}

.quick-switch.is-on span {
  transform: translateX(16px);
}

.quick-footer {
  flex: 0 0 auto;
  padding: 0.78rem 1rem 0.9rem;
  border-top: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
  background: var(--surface-island, rgba(255, 255, 255, 0.72));
}

.open-start-page {
  width: 100%;
  min-height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.48rem;
  padding: 0.52rem 0.8rem;
  color: white;
  background: var(--color-primary, #047a50);
  border: 1px solid transparent;
  border-radius: 9px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
  transition: filter 160ms ease, transform 160ms ease;
}

.open-start-page:hover,
.open-start-page:focus-visible {
  filter: brightness(1.08);
}

.open-start-page:active {
  transform: translateY(1px) scale(0.99);
}

.quick-close:focus-visible,
.quick-row--button:focus-visible,
.quick-switch:focus-visible,
.quick-row select:focus-visible,
.open-start-page:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

.quick-panel-enter-active,
.quick-panel-leave-active {
  transition: opacity 160ms ease;
}

.quick-panel-enter-active .quick-panel,
.quick-panel-leave-active .quick-panel {
  transition: opacity 170ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.quick-panel-enter-from,
.quick-panel-leave-to {
  opacity: 0;
}

.quick-panel-enter-from .quick-panel,
.quick-panel-leave-to .quick-panel {
  opacity: 0;
  transform: translateX(calc(100% + 1rem));
}

@media (max-width: 520px) {
  .quick-overlay {
    align-items: stretch;
    padding: 0;
  }

  .quick-panel {
    width: 100%;
    max-width: none;
    height: 100dvh;
    max-height: 100dvh;
    border-radius: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .quick-panel-enter-active,
  .quick-panel-leave-active,
  .quick-panel-enter-active .quick-panel,
  .quick-panel-leave-active .quick-panel {
    transition-duration: 1ms;
  }
}
</style>
