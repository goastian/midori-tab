<!-- Tabs.vue -->
<template>
    <div class="tabs">
      <div class="tab-headers">
        <button
          v-for="(tab, index) in tabs"
          :key="index"
          :class="{ active: index === selectedIndex }"
          @click="selectedIndex = index"
        >
          {{ tab.label }}
        </button>
      </div>
      <div class="tab-content">
        <slot :name="tabs[selectedIndex].name"></slot>
      </div>
    </div>
  </template>
  
  <script>
  export default {
    props: {
      tabs: {
        type: Array,
        required: true
      }
    },
    data() {
      return {
        selectedIndex: 0
      };
    }
  };
  </script>
  
  <style scoped>
  .tab-headers {
    display: flex;
    border-bottom: 1px solid #ddd;
  }
  .tab-headers button {
    padding: 8px 16px;
    border: none;
    background: none;
    cursor: pointer;
  }
  .tab-headers button.active {
    border-bottom: 2px solid #333;
    font-weight: bold;
  }
  .tab-content {
    padding: 16px 0;
  }
  </style>
  