<template>
  <Teleport to="body">
    <Transition name="sheet-fade">
      <div v-if="visible" class="sheet-overlay" @click="$emit('close')"></div>
    </Transition>
    <Transition name="sheet-slide">
      <div v-if="visible" class="marketplace-sheet">
        <div class="sheet-header">
          <span class="sheet-title">{{ i18n.$t('marketplace.title') }}</span>
          <button class="sheet-close" type="button" @click="$emit('close')" :aria-label="i18n.$t('marketplace.close')">x</button>
        </div>
        <MarketplaceBrowser
          :types="['wallpaper', 'widget']"
          :default-type="activeType"
          :title="i18n.$t('marketplace.title')"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { defineAsyncComponent } from 'vue';

export default {
  name: 'MarketplaceSheet',
  components: {
    MarketplaceBrowser: defineAsyncComponent(() => import('../MarketplaceBrowser.vue')),
  },
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
    activeType: {
      type: String,
      default: 'wallpaper',
    },
    i18n: {
      type: Object,
      required: true,
    },
  },
  emits: ['close'],
};
</script>

<style scoped>
.sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 8000;
}

.marketplace-sheet {
  position: fixed;
  left: 50%;
  bottom: 1rem;
  transform: translateX(-50%);
  width: min(980px, calc(100vw - 1.5rem));
  max-height: min(78vh, 780px);
  overflow: auto;
  z-index: 8001;
  background: color-mix(in srgb, var(--surface-base, #080D14) 92%, transparent);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 18px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.32);
  padding: 1rem;
  backdrop-filter: blur(20px);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.sheet-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text, white);
}

.sheet-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.12s ease;
}

.sheet-close:hover {
  color: var(--color-text, white);
  background: var(--color-border-hover, rgba(126,196,168,0.2));
}

.sheet-fade-enter-active { transition: opacity 0.15s ease; }
.sheet-fade-leave-active { transition: opacity 0.12s ease; }
.sheet-fade-enter-from,
.sheet-fade-leave-to { opacity: 0; }

.sheet-slide-enter-active { transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
.sheet-slide-leave-active { transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1); }
.sheet-slide-enter-from { transform: translate(-50%, 100%); }
.sheet-slide-leave-to { transform: translate(-50%, 100%); }

@media (max-width: 640px) {
  .marketplace-sheet {
    width: calc(100vw - 1rem);
    bottom: 0.5rem;
    max-height: 84vh;
  }
}
</style>
