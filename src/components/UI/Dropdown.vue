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
}

.dropdown-button {
  padding: 0.5rem 1rem;
  border: 1px solid #ccc;
  background-color: var(--bg-color);
  color: var(--text-color);
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-width: 160px;
}

.arrow {
  margin-left: 8px;
  transition: transform 0.2s;
}

.arrow.open {
  transform: rotate(180deg);
}

.dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 20;
  background: var(--bg-color);
  color: var(--text-color);
  border: 1px solid #ccc;
  border-radius: 4px;
  margin-top: 0.25rem;
  width: 100%;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.dropdown-menu li {
  list-style: none;
  padding: 0.5rem 1rem;
  cursor: pointer;
  transition: .5s ease-in-out background;
}

.dropdown-menu li:hover {
  background-color: var(--bg-secondary);
}
</style>

