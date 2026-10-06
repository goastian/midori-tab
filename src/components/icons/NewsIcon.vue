<template>
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor"
    stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
    :class="{ 'news-icon--spin': icon.startsWith('svg-spinners:') }">
    <path :d="path" />
  </svg>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({ icon: { type: String, required: true } });
const paths = {
  'solar:news-bold': 'M4 4h16v16H4z M7 8h4v4H7z M14 8h3 M14 11h3 M7 15h10 M7 18h10',
  'solar:refresh-bold': 'M20 11a8 8 0 1 0-2.4 6 M20 5v6h-6',
  'solar:info-circle-linear': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 8h.01',
  'solar:fire-bold': 'M12 22c-4 0-7-3-7-7 0-3 2-5 4-7 0 3 2 4 3 4 0-4 2-7 3-9 0 4 4 6 4 12 0 4-3 7-7 7z',
  'solar:clock-circle-linear': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 7v5l3 2',
  'solar:danger-triangle-bold': 'M12 3 2 21h20L12 3z M12 9v5 M12 18h.01',
  'solar:document-text-linear': 'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8 M8 16h8',
  'solar:gallery-remove-linear': 'M3 4h18v16H3z M7 9h.01 M4 17l5-5 3 3 2-2 5 5 M9 21h6',
  'solar:alt-arrow-down-linear': 'M5 9l7 7 7-7',
  'svg-spinners:90-ring-with-bg': 'M12 3a9 9 0 1 0 9 9',
};
const path = computed(() => paths[props.icon] || paths['solar:info-circle-linear']);
</script>

<style scoped>
.news-icon--spin { animation: news-icon-spin .8s linear infinite; }
@keyframes news-icon-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .news-icon--spin { animation: none; } }
</style>
