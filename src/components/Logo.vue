<template>
  <div class="containerLogo">
    <div class="logo-glow"></div>
    <img src="../assets/midori.png" class="logo" />
  </div>
</template>

<script>
</script>

<style scoped>
.containerLogo {
  padding: .1rem .2rem;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
}

.logo-glow {
  position: absolute;
  width: 50%;
  max-width: 200px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 184, 148, 0.15) 0%, transparent 70%);
  animation: logoPulse 4s ease-in-out infinite;
  pointer-events: none;
}

.logo {
  width: 60%;
  max-width: 300px;
  animation: logoFloat 6s ease-in-out infinite;
  filter: drop-shadow(0 4px 12px rgba(0, 184, 148, 0.15));
  transition: filter 0.3s ease, transform 0.3s ease;
  position: relative;
  z-index: 1;
}

.logo:hover {
  filter: drop-shadow(0 6px 20px rgba(0, 184, 148, 0.3));
  transform: scale(1.05);
}

@keyframes logoFloat {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-6px);
  }
}

@keyframes logoPulse {
  0%, 100% {
    opacity: 0.5;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .logo {
    animation: none;
  }
  .logo-glow {
    animation: none;
    opacity: 0.5;
  }
}
</style>
