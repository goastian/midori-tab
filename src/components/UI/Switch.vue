<template>
  <button
    type="button"
    class="container"
    :class="{ active: state }"
    role="switch"
    :aria-checked="state"
    :aria-label="label || undefined"
  >
    <span
      class="switch"
      :class="state ? 'right' : 'left'"
      aria-hidden="true"
    ></span>
  </button>
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
      },
      label: {
        type: String,
        default: '',
      },
    }
  }
</script>

<style scoped>
.container {
  width: 40px;
  height: 23px;
  flex: 0 0 auto;
  padding: 0;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.16));
  border-radius: 999px;
  position: relative;
  cursor: pointer;
  transition: background 180ms ease, border-color 180ms ease;
}

.container.active {
  background: var(--color-primary, #04A469);
  border-color: var(--color-primary, #04A469);
}

.switch {
  position: absolute;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 3px;
  background: white;
  left: 3px;
  box-shadow: 0 1px 3px rgba(7, 31, 23, 0.28);
  transition: transform 180ms ease;
}

.switch.right {
  transform: translateX(17px);
}

.container:hover {
  border-color: var(--color-border-hover, rgba(126, 196, 168, 0.28));
}

.container:active .switch {
  transform: scale(0.92);
}

.container.active:active .switch {
  transform: translateX(17px) scale(0.92);
}

.container:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary, #0eae5b), transparent 28%);
  outline-offset: 2px;
}
</style>
