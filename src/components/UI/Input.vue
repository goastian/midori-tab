<template>
  <input :placeholder="placeholder" :value="modelValue" @input="onInput" @keydown.enter="onEnter"
    :class="[
      { 'full-width': full },
      { 'round': round },
      { 'rounded': rounded }
    ]"
  >
</template>

<script>
export default {
  data() {
    return {

    }
  },
  props: {
    placeholder: String,
    modelValue: {
      type: String,
      default: ''
    },
    round: {
      type: Boolean,
      default: false,
    },
    full: {
      type: Boolean,
    },
    rounded: {
      type: Boolean,
      default: false,
    }
  },

  methods: {
    onInput(event) {
      this.$emit('update:modelValue', event.target.value);
    },

    onEnter() {
      this.$emit('enter-pressed', this.modelValue);  // Emite un evento 'enter-pressed'
    }
  },
}
</script>

<style scoped>
input {
  padding: .5rem 1rem;
  background-color: var(--surface-raised, #0F1520);
  color: var(--color-text, #C4F0E0);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  height: 35px;
  font-size: 0.85rem;
  transition: border-color var(--transition-fast, 0.1s ease);
}

input::placeholder {
  color: var(--color-text-muted, #5A9A82);
}

.full-width {
  width: 100%;
}

input:focus {
  outline: none;
  border-color: var(--color-primary, #04A469);
}

.round {
  border-radius: var(--radius-sm, 6px);
}

.rounded {
  border-radius: 10rem;
}
</style>
