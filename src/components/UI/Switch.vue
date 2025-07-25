<template>
  <div class="container">
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
  background: var(--bg-secondary);
  border-radius: 1rem;
  position: relative;
  cursor: pointer;
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
  background: var(--bg-color);
  margin: auto;
  left: 3px;
  transition: .5s ease-in-out left, .5s ease-in-out background;
}

.switch.right {
  left: 27px;
  background: var(--bg-color);
}
</style>
