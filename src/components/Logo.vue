<template>
  <div class="containerLogo">
    <img src="../assets/midori.png" class="logo" alt="Midori" />
  </div>
</template>

<script>
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
  width: clamp(11rem, 32vw, 18.75rem);
  max-width: 300px;
  height: auto;
  object-fit: contain;
  transition: transform var(--transition-normal, 0.15s ease);
}

.logo:hover {
  transform: scale(1.03);
}

@media (max-width: 700px) {
  .logo {
    width: min(58vw, 13.75rem);
  }
}
</style>
