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
  border: none;
}

.full-width {
  width: 100%;
}

input:focus {
  outline: none;
}

.round {
  border-radius: .2rem;
}

.rounded {
  border-radius: 10rem;
}
</style>
