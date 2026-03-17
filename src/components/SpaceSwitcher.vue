<template>
  <Transition name="slide-down">
    <div v-if="spacesStore.enabled" class="space-switcher-bar">
      <button
        v-for="space in spacesStore.spaces"
        :key="space.id"
        class="switcher-pill"
        :class="{ active: space.id === spacesStore.activeSpaceId }"
        :style="{ '--pill-color': space.color }"
        @click="switchTo(space.id)"
        :title="space.name"
      >
        <span class="pill-icon">{{ space.icon }}</span>
        <span class="pill-label">{{ space.name }}</span>
      </button>
    </div>
  </Transition>
</template>

<script>
import useSpacesStore from '../stores/useSpacesStore.js';

export default {
  name: 'SpaceSwitcher',
  data() {
    return {
      spacesStore: useSpacesStore(),
    };
  },
  methods: {
    switchTo(id) {
      if (id !== this.spacesStore.activeSpaceId) {
        this.spacesStore.switchSpace(id);
      }
    },
  },
};
</script>

<style scoped>
.space-switcher-bar {
  position: fixed;
  top: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  z-index: 900;
  display: flex;
  gap: 0.35rem;
  padding: 0.3rem;
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 2rem;
  box-shadow: var(--shadow-md, 0 2px 8px rgba(0,0,0,0.1));
}

.switcher-pill {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.85rem;
  border-radius: 1.5rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all var(--transition-fast, 0.1s ease);
  white-space: nowrap;
}

.switcher-pill:hover {
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, white);
}

.switcher-pill.active {
  background: color-mix(in srgb, var(--pill-color, var(--ms-primary, #04A469)) 25%, var(--surface-overlay, #1E2D3D));
  border-color: color-mix(in srgb, var(--pill-color, var(--ms-primary, #04A469)) 40%, transparent);
  color: var(--color-text, white);
}

.pill-icon {
  font-size: 0.9rem;
  line-height: 1;
}

.pill-label {
  line-height: 1;
}

/* Transition */
.slide-down-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.slide-down-leave-active {
  transition: opacity 0.1s ease, transform 0.1s ease;
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
