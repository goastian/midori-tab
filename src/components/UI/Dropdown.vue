<template>
  <div ref="dropdown" class="dropdown" :data-state="status || (loading ? 'loading' : undefined)" @keydown="onKeydown">
    <button
      :id="`${dropdownId}-trigger`"
      ref="trigger"
      type="button"
      class="dropdown-button"
      role="combobox"
      aria-haspopup="listbox"
      :aria-label="label || placeholder"
      :aria-expanded="isOpen"
      :aria-controls="`${dropdownId}-list`"
      :aria-activedescendant="isOpen && activeIndex >= 0 ? `${dropdownId}-option-${activeIndex}` : undefined"
      :aria-invalid="status === 'error' || undefined"
      :aria-busy="loading || undefined"
      :disabled="disabled || loading"
      @click="isOpen ? closeDropdown(false) : openDropdown()"
    >
      <span class="dropdown-value">{{ displayLabel(modelValue) || placeholder }}</span>
      <svg class="arrow" :class="{ open: isOpen }" viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
    </button>
    <Transition name="dropdown-reveal">
      <ul v-if="isOpen" :id="`${dropdownId}-list`" class="dropdown-menu" role="listbox" :aria-label="label || placeholder">
        <li
          v-for="(option, index) in options"
          :id="`${dropdownId}-option-${index}`"
          :key="option"
          class="dropdown-option"
          :class="{ 'is-active': activeIndex === index }"
          role="option"
          :aria-selected="option === modelValue"
          @pointermove="activeIndex = index"
          @mousedown.prevent
          @click="selectOption(option)"
        >
          <span>{{ displayLabel(option) }}</span>
          <svg v-if="option === modelValue" class="option-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>
        </li>
      </ul>
    </Transition>
  </div>
</template>

<script>
import { nextTick, useId } from 'vue';

export default {
  name: 'Dropdown',
  setup() { return { dropdownId: useId() }; },
  props: {
    modelValue: String,
    options: { type: Array, required: true },
    labels: { type: Object, default: () => ({}) },
    placeholder: { type: String, default: 'Select…' },
    label: { type: String, default: '' },
    disabled: Boolean,
    loading: Boolean,
    status: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'change'],
  data() { return { isOpen: false, activeIndex: -1, typed: '', typedAt: 0 }; },
  watch: {
    disabled(value) { if (value) this.closeDropdown(false); },
    loading(value) { if (value) this.closeDropdown(false); },
  },
  mounted() { document.addEventListener('pointerdown', this.handleClickOutside); },
  beforeUnmount() { document.removeEventListener('pointerdown', this.handleClickOutside); },
  methods: {
    displayLabel(option) { return option == null ? '' : this.labels[option] || option; },
    openDropdown(index) {
      if (this.disabled || this.loading || !this.options.length) return;
      this.activeIndex = index ?? Math.max(0, this.options.indexOf(this.modelValue));
      this.isOpen = true;
      nextTick(this.scrollActive);
    },
    closeDropdown(restore = true) {
      this.isOpen = false;
      if (restore) this.$refs.trigger?.focus({ preventScroll: true });
    },
    selectOption(option) {
      this.$emit('update:modelValue', option);
      this.$emit('change', option);
      this.closeDropdown();
    },
    scrollActive() {
      const list = this.$el.querySelector('[role="listbox"]');
      const option = list?.children[this.activeIndex];
      if (!list || !option) return;
      if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
      else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
    },
    onKeydown(event) {
      if (this.disabled || this.loading) return;
      const length = this.options.length;
      if (event.key === 'Escape' && this.isOpen) {
        event.preventDefault(); event.stopPropagation(); this.closeDropdown(); return;
      }
      if (event.key === 'Tab') { this.closeDropdown(false); return; }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && length) {
        event.preventDefault();
        if (!this.isOpen) this.openDropdown(event.key === 'ArrowUp' || event.key === 'End' ? length - 1 : undefined);
        else {
          this.activeIndex = event.key === 'Home' ? 0 : event.key === 'End' ? length - 1 : (this.activeIndex + (event.key === 'ArrowDown' ? 1 : -1) + length) % length;
          nextTick(this.scrollActive);
        }
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (this.isOpen) this.selectOption(this.options[this.activeIndex]);
        else this.openDropdown();
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const now = Date.now();
        this.typed = (now - this.typedAt < 600 ? this.typed : '') + event.key.toLocaleLowerCase();
        this.typedAt = now;
        const index = this.options.findIndex(option => String(this.displayLabel(option)).toLocaleLowerCase().startsWith(this.typed));
        if (index !== -1) { event.preventDefault(); this.openDropdown(index); }
      }
    },
    handleClickOutside(event) { if (!this.$refs.dropdown?.contains(event.target)) this.closeDropdown(false); },
  },
};
</script>

<style scoped>
.dropdown { position: relative; width: 100%; }
.dropdown-button { display: flex; width: 100%; min-height: 44px; align-items: center; justify-content: space-between; gap: var(--space-md); padding: var(--space-sm) var(--space-md); background: var(--surface-raised); color: var(--color-text); border: 1px solid var(--color-border); border-radius: var(--radius-control); font: inherit; font-size: var(--text-sm); text-align: start; cursor: pointer; transition: border-color var(--transition-fast), background-color var(--transition-fast); }
.dropdown-button:hover:not(:disabled), .dropdown-button[aria-expanded='true'] { border-color: var(--color-primary); background: var(--surface-overlay); }
.dropdown-button:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 3px; }
.dropdown-button:active:not(:disabled) { background: var(--color-primary-subtle); }
.dropdown-button:disabled { opacity: .5; cursor: not-allowed; }
.dropdown-value { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.arrow, .option-check { width: 16px; height: 16px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.arrow { transition: transform var(--transition-fast); }
.arrow.open { transform: rotate(180deg); }
.dropdown-menu { position: absolute; z-index: var(--z-dropdown); inset: calc(100% + var(--space-xs)) 0 auto; max-height: 240px; overflow-y: auto; overscroll-behavior: contain; padding: var(--space-xs); margin: 0; list-style: none; color: var(--color-text); background: var(--surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-control); box-shadow: var(--control-shadow); }
.dropdown-option { display: flex; min-height: 40px; align-items: center; justify-content: space-between; gap: var(--space-sm); padding: var(--space-sm) var(--space-md); border-radius: var(--radius-control); cursor: pointer; font-size: var(--text-sm); white-space: nowrap; }
.dropdown-option.is-active { background: var(--color-primary-subtle); }
.dropdown-option[aria-selected='true'] { font-weight: 600; color: var(--color-primary); }
.dropdown[data-state='error'] .dropdown-button { border-color: var(--color-danger); }
.dropdown[data-state='success'] .dropdown-button { border-color: var(--color-success); }
.dropdown[data-state='loading'] .dropdown-button { cursor: wait; }
.dropdown-reveal-enter-active { transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.dropdown-reveal-leave-active { transition: opacity var(--dur-exit) var(--ease-in); }
.dropdown-reveal-enter-from { opacity: 0; transform: translateY(-4px); }
.dropdown-reveal-leave-to { opacity: 0; }
</style>
