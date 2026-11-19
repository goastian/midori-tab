<template>
  <button
    type="button"
    class="ui-switch"
    :class="{ active: state }"
    :data-state="status || (loading ? 'loading' : undefined)"
    role="switch"
    :aria-checked="state"
    :aria-label="label || undefined"
    :aria-busy="loading || undefined"
    :aria-invalid="status === 'error' || undefined"
    :disabled="disabled || loading"
  >
    <span class="switch-track" aria-hidden="true"></span>
    <span class="switch-thumb" aria-hidden="true"></span>
  </button>
</template>

<script>
export default {
  props: {
    state: { type: Boolean, default: false },
    label: { type: String, default: '' },
    disabled: Boolean,
    loading: Boolean,
    status: { type: String, default: '' },
  },
};
</script>

<style scoped>
.ui-switch { position: relative; width: 44px; height: 44px; flex: 0 0 auto; padding: 0; border: 0; border-radius: var(--radius-pill); background: var(--color-transparent); cursor: pointer; }
.switch-track { position: absolute; inset: 10px 0; width: 44px; height: 24px; border: 1px solid var(--color-border-hover); border-radius: var(--radius-pill); background: var(--control-track); transition: background-color var(--transition-fast); }
.active .switch-track { background: var(--color-primary); border-color: var(--color-primary); }
.switch-thumb { position: absolute; top: 14px; left: 4px; width: 16px; height: 16px; border-radius: var(--radius-pill); background: var(--control-thumb); transition: transform var(--transition-fast); }
.active .switch-thumb { transform: translateX(20px); background: var(--control-thumb-on); }
.ui-switch:hover:not(:disabled) .switch-track { border-color: var(--color-primary); }
.ui-switch:active:not(:disabled) .switch-thumb { transform: scale(.9); }
.ui-switch.active:active:not(:disabled) .switch-thumb { transform: translateX(20px) scale(.9); }
.ui-switch:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.ui-switch:disabled { opacity: .5; cursor: not-allowed; }
.ui-switch[data-state='loading'] { cursor: wait; }
.ui-switch[data-state='error'] .switch-track { border-color: var(--color-danger); }
.ui-switch[data-state='success'] .switch-track { border-color: var(--color-success); }
</style>
