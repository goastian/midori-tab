<template>
  <svg class="widget-glyph" :width="size" :height="size" viewBox="0 0 40 40" fill="none" stroke="var(--widget-icon-ink)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <g v-if="name === 'weather'">
      <circle cx="26" cy="13" r="7" fill="var(--widget-icon-sun)" />
      <path d="M26 2v2m11 9h-2M34 5l-1.5 1.5M18 5l1.5 1.5" />
      <path d="M12 34h17a7 7 0 0 0 0-14 10 10 0 0 0-19-2A8 8 0 0 0 12 34Z" fill="var(--widget-icon-sky)" />
      <path d="M13 24a5 5 0 0 1 5-5" />
    </g>
    <g v-else-if="name === 'currency'">
      <rect x="10" y="5" width="26" height="24" rx="4" fill="var(--widget-icon-mint)" />
      <rect x="4" y="11" width="29" height="24" rx="4" fill="var(--widget-icon-paper)" />
      <circle cx="18.5" cy="23" r="7" fill="var(--widget-icon-mint)" />
      <path d="M21 20.5c-3-2-6 0-4.5 2 1 1.5 5 0 4.5 2.5-.5 2-3.5 2-5 1M18.5 18v10M8 17v3m21 6v3" />
    </g>
    <g v-else-if="name === 'bookmark'">
      <rect x="5" y="5" width="30" height="30" rx="5" fill="var(--widget-icon-paper)" />
      <path d="M10 5h20a5 5 0 0 1 5 5v4H5v-4a5 5 0 0 1 5-5Z" fill="var(--widget-icon-mint)" />
      <path d="M23 14h7v17l-3.5-3-3.5 3Z" fill="var(--widget-icon-sky)" />
      <path d="M10 21h7m-7 6h5" />
      <circle cx="10" cy="9.5" r=".9" fill="var(--widget-icon-ink)" stroke="none" />
      <circle cx="14" cy="9.5" r=".9" fill="var(--widget-icon-ink)" stroke="none" />
    </g>
    <g v-else-if="name === 'privacy'">
      <path d="m20 4 14 5v10c0 9-14 17-14 17S6 28 6 19V9Z" fill="var(--widget-icon-mint)" />
      <path d="M14 24c-4-8 5-12 13-11 1 9-4 16-11 12" fill="var(--widget-icon-paper)" />
      <path d="m14 28 10-11" />
    </g>
    <g v-else-if="name === 'calendar'">
      <rect x="5" y="8" width="30" height="27" rx="5" fill="var(--widget-icon-paper)" />
      <path d="M10 8h20a5 5 0 0 1 5 5v4H5v-4a5 5 0 0 1 5-5Z" fill="var(--ecosystem-peach)" />
      <path d="M13 4v8m14-8v8M11 23h3m-3 6h3" />
      <circle cx="25" cy="26" r="5" fill="var(--widget-icon-mint)" />
      <path d="m23 26 1.5 1.5L28 24" />
    </g>
    <g v-else-if="name === 'notes'">
      <rect x="10" y="4" width="25" height="29" rx="4" fill="var(--ecosystem-peach)" />
      <rect x="5" y="8" width="25" height="28" rx="4" fill="var(--widget-icon-paper)" />
      <path d="M11 16h12m-12 6h8m-8 6h5" />
      <path d="m23 29 9-9a2.8 2.8 0 0 1 4 4l-9 9-5 1Z" fill="var(--widget-icon-sky)" />
      <path d="m30 22 4 4" />
    </g>
    <g v-else-if="name === 'todo'">
      <rect x="7" y="7" width="27" height="29" rx="4" fill="var(--widget-icon-paper)" />
      <rect x="13" y="4" width="15" height="7" rx="2.5" fill="var(--widget-icon-mint)" />
      <path d="m12 19 2 2 4-5m-6 13 2 2 4-5M23 19h6m-6 10h6" />
    </g>
    <g v-else-if="name === 'rss'">
      <rect x="5" y="7" width="30" height="28" rx="4" fill="var(--widget-icon-paper)" />
      <rect x="10" y="13" width="9" height="9" rx="1.5" fill="var(--ecosystem-peach)" />
      <path d="M24 20h5m-19 7h19m-19 4h13" />
      <circle cx="30" cy="10" r="7" fill="var(--widget-icon-mint)" />
      <path d="M27 7a6 6 0 0 1 6 6m-6-3a3 3 0 0 1 3 3" />
      <circle cx="27" cy="13" r=".8" fill="var(--widget-icon-ink)" stroke="none" />
    </g>
  </svg>
</template>

<script setup>
defineProps({ name: { type: String, required: true }, size: { type: [Number, String], default: 40 } });
</script>

<style scoped>
.widget-glyph { display: block; flex: 0 0 auto; }
</style>
