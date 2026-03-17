<template>
  <div class="container" :class="{'active' : state}">
    <div
      class="switch"
      :class="[ state ? 'right' : 'left']"
    >
    </div>
  </div>
</template>

<script>
  export default {
    data() {
      return {
      }
    },

    props: {
      state: {
        type: Boolean,
        default: false,
      }
    }
  }
</script>

<style scoped>
.container {
  width: 50px;
  height: 26px;
  padding: .2rem;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 1rem;
  position: relative;
  cursor: pointer;
  transition: background var(--transition-fast, 0.1s ease);
}

.container.active {
  background: var(--color-primary, #04A469);
  border-color: var(--color-primary, #04A469);
}

.switch {
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 0;
  bottom: 0;
  background: white;
  margin: auto;
  left: 3px;
  transition: left var(--transition-fast, 0.1s ease);
}

.switch.right {
  left: 27px;
}
</style>
