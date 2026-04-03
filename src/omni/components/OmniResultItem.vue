<template>
  <li
    class="omni-item"
    :class="{ 'omni-item--selected': selected }"
    role="option"
    :aria-selected="selected"
    @click="$emit('select', item, false)"
    @pointerenter="$emit('hover', index)"
  >
    <!-- Icon: emoji or favicon -->
    <span v-if="item.emoji" class="omni-item__icon omni-item__icon--emoji" aria-hidden="true">
      {{ item.emojiChar || '📄' }}
    </span>
    <img
      v-else
      class="omni-item__icon omni-item__icon--img"
      :src="item.favIconUrl || fallbackIcon"
      alt=""
      aria-hidden="true"
      loading="lazy"
      @error="onImgError"
    />

    <!-- Text body -->
    <div class="omni-item__body">
      <span class="omni-item__title">{{ item.title }}</span>
      <span v-if="displayDesc" class="omni-item__desc">{{ displayDesc }}</span>
    </div>

    <!-- Keyboard shortcut hint -->
    <div v-if="item.keycheck && item.keys && item.keys.length" class="omni-item__keys" aria-hidden="true">
      <kbd v-for="key in item.keys" :key="key" class="omni-item__key">{{ key }}</kbd>
    </div>

    <!-- Enter affordance (only when selected) -->
    <div v-if="selected" class="omni-item__enter" aria-hidden="true">
      <kbd>⏎</kbd>
    </div>
  </li>
</template>

<script>
export default {
  name: 'OmniResultItem',

  props: {
    item:     { type: Object,  required: true },
    selected: { type: Boolean, default: false },
    index:    { type: Number,  required: true },
  },

  emits: ['select', 'hover'],

  data() {
    return {
      fallbackIcon: this.globeUrl(),
    };
  },

  computed: {
    displayDesc() {
      if (this.item.url && this.item.type !== 'action') return this.item.url;
      return this.item.desc || '';
    },
  },

  methods: {
    globeUrl() {
      try {
        return chrome.runtime.getURL('globe.svg');
      } catch (_) {
        return '';
      }
    },
    onImgError(e) {
      e.target.src = this.fallbackIcon;
    },
  },
};
</script>

<style scoped>
.omni-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  cursor: pointer;
  border-radius: 6px;
  margin: 0 0.25rem;
  transition: background 0.1s;
  list-style: none;
}

.omni-item--selected,
.omni-item:hover {
  background: var(--surface-raised, rgba(100, 100, 120, 0.12));
}

.omni-item__icon {
  width: 1.5rem;
  height: 1.5rem;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  border-radius: 4px;
}

.omni-item__icon--img {
  object-fit: contain;
}

.omni-item__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.omni-item__title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--color-text, #f1f1f1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omni-item__desc {
  font-size: 0.72rem;
  color: var(--color-text-muted, #a5a5ae);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.omni-item__keys {
  display: flex;
  gap: 0.2rem;
  flex-shrink: 0;
}

.omni-item__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.25rem;
  height: 1.25rem;
  padding: 0 0.3rem;
  font-size: 0.7rem;
  font-family: inherit;
  background: var(--color-bg, #1e2128);
  color: var(--color-text-secondary, #c5c6ca);
  border: 1px solid var(--color-border, #35373e);
  border-radius: 4px;
}

.omni-item__enter {
  flex-shrink: 0;
}

.omni-item__enter kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  font-size: 0.75rem;
  font-family: inherit;
  background: var(--color-primary, #6068d2);
  color: #fff;
  border-radius: 4px;
}
</style>
