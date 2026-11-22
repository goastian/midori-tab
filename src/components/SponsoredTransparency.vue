<template>
  <Teleport to="body">
    <div
      ref="panel"
      :id="id"
      class="transparency-panel"
      :class="{ 'transparency-panel--below': below }"
      :style="panelStyle"
      role="tooltip"
      @click.stop
    >
      <p><template v-for="(part, index) in copyParts" :key="index"><strong v-if="part.bold">{{ part.text }}</strong><template v-else>{{ part.text }}</template></template></p>
    </div>
  </Teleport>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

export default {
  emits: ['close'],
  props: {
    id: { type: String, required: true },
    anchor: { type: Object, required: true },
  },
  data() {
    return {
      i18n: useI18nStore(),
      panelStyle: { visibility: 'hidden' },
      below: false,
      resizeObserver: null,
    };
  },
  computed: {
    copyParts() {
      const labels = {
        '{partners}': this.i18n.$t('ads.advertisingPartners'),
        '{privacy}': this.i18n.$t('ads.privacyPolicies'),
      };
      return String(this.i18n.$t('ads.whyCopy')).split(/(\{partners\}|\{privacy\})/).map(part => ({
        text: Object.hasOwn(labels, part) ? labels[part] : part,
        bold: Object.hasOwn(labels, part),
      }));
    },
  },
  mounted() {
    this.updatePosition();
    this.resizeObserver = new ResizeObserver(this.updatePosition);
    this.resizeObserver.observe(this.$refs.panel);
    this.resizeObserver.observe(this.anchor);
    document.addEventListener('pointerdown', this.handleOutside, true);
    document.addEventListener('keydown', this.handleKeydown, true);
    window.addEventListener('resize', this.updatePosition);
    window.addEventListener('scroll', this.updatePosition, true);
  },
  beforeUnmount() {
    this.resizeObserver?.disconnect();
    document.removeEventListener('pointerdown', this.handleOutside, true);
    document.removeEventListener('keydown', this.handleKeydown, true);
    window.removeEventListener('resize', this.updatePosition);
    window.removeEventListener('scroll', this.updatePosition, true);
  },
  methods: {
    updatePosition() {
      if (!this.anchor?.isConnected || !this.$refs.panel) return;
      const anchor = this.anchor.getBoundingClientRect();
      const panel = this.$refs.panel.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      if (anchor.bottom < 0 || anchor.top > height || anchor.right < 0 || anchor.left > width) {
        this.$emit('close');
        return;
      }
      const margin = 12;
      const gap = 8;
      const center = anchor.left + anchor.width / 2;
      const left = Math.max(margin, Math.min(center - panel.width / 2, width - panel.width - margin));
      const aboveSpace = anchor.top - margin;
      const belowSpace = height - anchor.bottom - margin;
      this.below = aboveSpace < panel.height + gap && belowSpace > aboveSpace;
      const top = this.below ? anchor.bottom + gap : anchor.top - panel.height - gap;
      this.panelStyle = {
        left: `${left}px`,
        top: `${Math.max(margin, Math.min(top, height - panel.height - margin))}px`,
        '--tooltip-caret-left': `${Math.max(12, Math.min(center - left, panel.width - 12))}px`,
      };
    },
    handleOutside(event) {
      if (!this.$refs.panel?.contains(event.target) && !this.anchor?.contains(event.target)) this.$emit('close');
    },
    handleKeydown(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.$emit('close');
      this.anchor?.focus({ preventScroll: true });
    },
  },
};
</script>

<style scoped>
.transparency-panel {
  position: fixed;
  z-index: 1000;
  box-sizing: border-box;
  width: max-content;
  max-width: min(280px, calc(100vw - 24px));
  padding: 8px;
  color: #30343b;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
  font: 400 12px/16px system-ui, sans-serif;
  text-align: start;
  overflow-wrap: anywhere;
}

.transparency-panel::after {
  content: '';
  position: absolute;
  top: 100%;
  left: var(--tooltip-caret-left);
  width: 0;
  height: 0;
  border: 6px solid transparent;
  border-top-color: #fff;
  transform: translateX(-50%);
}

.transparency-panel--below::after {
  top: auto;
  bottom: 100%;
  border-top-color: transparent;
  border-bottom-color: #fff;
}

.transparency-panel p {
  max-height: calc(100dvh - 40px);
  margin: 0;
  overflow-y: auto;
}

.transparency-panel strong { font-weight: 700; }
</style>
