<template>
  <div class="dropdown" ref="dropdown">
    <button
      type="button"
      class="dropdown-button"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
      @keydown.escape.stop="closeDropdown"
    >
      {{ displayLabel(currentValue) || placeholder }}
      <span class="arrow" :class="{ open: isOpen }" aria-hidden="true">⌄</span>
    </button>

    <ul v-if="isOpen" class="dropdown-menu" role="listbox">
      <li
        v-for="option in options"
        :key="option"
        role="presentation"
      >
        <button
          type="button"
          class="dropdown-option"
          role="option"
          :aria-selected="option === currentValue"
          @click="selectOption(option)"
        >
          <span>{{ displayLabel(option) }}</span>
          <span v-if="option === currentValue" class="option-check" aria-hidden="true">✓</span>
        </button>
      </li>
    </ul>
  </div>
</template>

<script>
export default {
  name: 'Dropdown',
  props: {
    modelValue: String,
    options: {
      type: Array,
      required: true,
    },
    labels: {
      type: Object,
      default: () => ({}),
    },
    placeholder: {
      type: String,
      default: 'Seleccionar...',
    },
  },
  data() {
    return {
      isOpen: false,
    }
  },
  computed: {
    currentValue() {
      return this.modelValue
    },
  },
  methods: {
    displayLabel(option) {
      if (option === null || option === undefined) return ''
      return this.labels[option] || option
    },
    toggleDropdown() {
      this.isOpen = !this.isOpen
    },
    closeDropdown() {
      this.isOpen = false
    },
    selectOption(option) {
      this.selectedOption = option
      this.isOpen = false

      // ✅ Emitimos evento para que el padre lo use con @change
      this.$emit('update:modelValue', option)
      this.$emit('change', option) // <- este es el que usás desde afuera
    },
    handleClickOutside(event) {
      if (!this.$refs.dropdown.contains(event.target)) {
        this.isOpen = false
      }
    },
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutside)
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside)
  },
}
</script>

<style scoped>
.dropdown {
  position: relative;
  display: inline-block;
  width: 100%;
}

.dropdown-button {
  width: 100%;
  height: 35px;
  padding: 0.5rem 1rem;
  background-color: var(--surface-control, #fff);
  color: var(--color-text, #C4F0E0);
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--color-border, rgba(20,42,36,0.16));
  font-size: 0.85rem;
  transition: all var(--transition-fast, 0.1s ease);
}

.dropdown-button:hover,
.dropdown-button:focus-visible {
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.dropdown-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--color-primary, #0eae5b), transparent 28%);
  outline-offset: 2px;
}

.arrow {
  margin-left: 8px;
  transition: transform 0.15s ease;
  font-size: 0.9rem;
  line-height: 1;
}

.arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  padding: 0.25rem;
  background: var(--surface-raised, #fff);
  color: var(--color-text, #C4F0E0);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: 8px;
  margin-top: 0.25rem;
  width: 100%;
  box-shadow: var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.14));
  overflow: hidden;
}

.dropdown-menu li {
  list-style: none;
}

.dropdown-option {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.42rem 0.68rem;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.85rem;
  text-align: left;
  transition: background var(--transition-fast, 0.1s ease);
}

.dropdown-option:hover,
.dropdown-option:focus-visible {
  background-color: var(--color-accent-bg, rgba(4,164,105,0.08));
  outline: none;
}

.option-check {
  color: var(--color-primary, #0eae5b);
  font-weight: 700;
}
</style>
