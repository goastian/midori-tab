<template>
  <div class="dropdown" @click="toggleDropdown" ref="dropdown">
    <button class="dropdown-button">
      {{ currentValue || placeholder }}
      <span class="arrow" :class="{ open: isOpen }">▼</span>
    </button>

    <ul v-if="isOpen" class="dropdown-menu">
      <li
        v-for="option in options"
        :key="option"
        @click.stop="selectOption(option)"
      >
        {{ option }}
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
    toggleDropdown() {
      this.isOpen = !this.isOpen
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
  background-color: var(--surface-raised, #0F1520);
  color: var(--color-text, #C4F0E0);
  cursor: pointer;
  border-radius: var(--radius-sm, 6px);
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  font-size: 0.85rem;
  transition: all var(--transition-fast, 0.1s ease);
}

.dropdown-button:hover {
  border-color: var(--color-border-hover, rgba(126,196,168,0.2));
}

.arrow {
  margin-left: 8px;
  transition: transform 0.15s ease;
  font-size: 0.7rem;
}

.arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text, #C4F0E0);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  margin-top: 0.25rem;
  width: 100%;
  box-shadow: var(--shadow-lg, 0 4px 16px rgba(0,0,0,0.14));
  overflow: hidden;
}

.dropdown-menu li {
  list-style: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: background var(--transition-fast, 0.1s ease);
  font-size: 0.85rem;
}

.dropdown-menu li:hover {
  background-color: var(--color-accent-bg, rgba(4,164,105,0.08));
}
</style>

