<template>
  <div class="containerLogo">
    <img ref="logo" src="../assets/midori.png" class="logo" :class="[`logo--${tone}`, { 'logo--outlined': needsOutline }]" alt="Midori" width="393" height="130" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { useLogoContrast } from '../composables/useLogoContrast.js';

const logo = ref(null);
const { tone, needsOutline } = useLogoContrast(logo);
</script>

<style scoped>
.containerLogo {
  padding: 0.1rem 0.2rem;
  width: 100%;
  min-width: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

.logo {
  width: 14rem;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  filter: brightness(0) invert(1) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4));
}

.logo--green {
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.18));
}

.logo--outlined {
  filter: brightness(0) invert(1) drop-shadow(0 0 0.6px rgba(0, 0, 0, 0.95)) drop-shadow(0 1px 1.5px rgba(0, 0, 0, 0.65));
}

.logo--green.logo--outlined {
  filter: drop-shadow(0 0 0.7px rgba(255, 255, 255, 0.95)) drop-shadow(0 1px 2px rgba(255, 255, 255, 0.65));
}

@media (max-width: 700px) {
  .logo {
    width: min(56vw, 13rem);
  }
}
</style>
