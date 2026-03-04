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
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 2rem;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}

.switcher-pill {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.85rem;
  border-radius: 1.5rem;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 500;
  transition: all 0.25s ease;
  white-space: nowrap;
}

.switcher-pill:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.switcher-pill.active {
  background: color-mix(in srgb, var(--pill-color, #00b894) 30%, transparent);
  border-color: color-mix(in srgb, var(--pill-color, #00b894) 50%, transparent);
  color: white;
  box-shadow: 0 0 10px color-mix(in srgb, var(--pill-color, #00b894) 20%, transparent);
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
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.slide-down-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.slide-down-enter-from, .slide-down-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
