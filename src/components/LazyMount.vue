<template>
  <div ref="root">
    <slot v-if="visible"></slot>
  </div>
</template>

<script>
import { ref, onMounted, onBeforeUnmount } from 'vue';

export default {
  name: 'LazyMount',
  props: {
    rootMargin: {
      type: String,
      default: '200px',
    },
    threshold: {
      type: Number,
      default: 0,
    },
    once: {
      type: Boolean,
      default: true,
    },
    eager: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const root = ref(null);
    const visible = ref(!!props.eager);
    let observer = null;

    onMounted(() => {
      if (visible.value) return;
      if (!('IntersectionObserver' in window)) {
        visible.value = true;
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry?.isIntersecting) return;
          visible.value = true;
          if (props.once && observer) observer.disconnect();
        },
        { root: null, rootMargin: props.rootMargin, threshold: props.threshold }
      );
      if (root.value) observer.observe(root.value);
    });

    onBeforeUnmount(() => {
      if (observer) observer.disconnect();
    });

    return { root, visible };
  },
};
</script>

