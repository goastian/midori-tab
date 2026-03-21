<template>
  <Teleport to="body">
    <Transition name="onb-fade">
      <div class="onb-overlay" @click="finish">
        <div class="onb-card" @click.stop role="dialog" aria-modal="true" aria-label="Bienvenida">
          <div class="onb-header">
            <div class="onb-title">{{ i18n.$t('onboarding.title') }}</div>
            <button class="onb-close" type="button" @click="finish" :aria-label="i18n.$t('onboarding.close')">✕</button>
          </div>

          <div class="onb-body">
            <div class="onb-step">
              <div class="onb-step-title">{{ steps[step].title }}</div>
              <div class="onb-step-desc">{{ steps[step].description }}</div>
            </div>
          </div>

          <div class="onb-footer">
            <div class="onb-dots" aria-hidden="true">
              <span
                v-for="(s, i) in steps"
                :key="i"
                class="onb-dot"
                :class="{ active: i === step }"
              ></span>
            </div>
            <div class="onb-actions">
              <button class="onb-btn" type="button" @click="prev" :disabled="step === 0">{{ i18n.$t('onboarding.back') }}</button>
              <button class="onb-btn-primary" type="button" @click="next">
                {{ step === steps.length - 1 ? i18n.$t('onboarding.done') : i18n.$t('onboarding.next') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { computed, ref } from 'vue';
import useI18nStore from '../stores/useI18nStore.js';
import useCommandsStore from '../stores/useCommandsStore.js';
import { getBrowserInfo } from '../utils/browserInfo.js';

export default {
  name: 'OnboardingModal',
  emits: ['close'],
  setup(props, { emit }) {
    const i18n = useI18nStore();
    const commandsStore = useCommandsStore();
    const step = ref(0);
    const browserInfo = getBrowserInfo();

    const formatShortcut = (s) => {
      if (!s) return '';
      const parts = [];
      const ctrlLabel = browserInfo.isMac ? '⌘' : 'Ctrl';
      if (s.ctrl) parts.push(ctrlLabel);
      if (s.alt) parts.push('Alt');
      if (s.shift) parts.push('Shift');
      const key = s.key === ' ' ? 'Space' : String(s.key || '').toUpperCase();
      parts.push(key);
      return parts.join('+');
    };

    const format = (text, vars) => {
      let out = String(text || '');
      for (const [k, v] of Object.entries(vars || {})) {
        out = out.replaceAll(`{${k}}`, String(v));
      }
      return out;
    };

    const paletteShortcut = computed(() => formatShortcut(commandsStore.shortcuts?.openCommandPalette));
    const steps = computed(() => ([
      {
        title: i18n.$t('onboarding.steps.commandPalette.title'),
        description: format(i18n.$t('onboarding.steps.commandPalette.description'), { shortcut: paletteShortcut.value }),
      },
      {
        title: i18n.$t('onboarding.steps.widgets.title'),
        description: i18n.$t('onboarding.steps.widgets.description'),
      },
      {
        title: i18n.$t('onboarding.steps.shortcuts.title'),
        description: i18n.$t('onboarding.steps.shortcuts.description'),
      },
      {
        title: i18n.$t('onboarding.steps.themeDensity.title'),
        description: i18n.$t('onboarding.steps.themeDensity.description'),
      },
      {
        title: i18n.$t('onboarding.steps.shortcutConfig.title'),
        description: i18n.$t(`onboarding.steps.shortcutConfig.${browserInfo.shortcutsHintKey}`),
      },
    ]));

    const finish = () => emit('close');
    const next = () => {
      if (step.value >= steps.value.length - 1) finish();
      else step.value += 1;
    };
    const prev = () => {
      if (step.value > 0) step.value -= 1;
    };

    return { step, steps, next, prev, finish, i18n };
  },
};
</script>

<style scoped>
.onb-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.onb-card {
  width: 520px;
  max-width: 100%;
  background: var(--surface-base, #080D14);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-xl, 0 8px 32px rgba(0,0,0,0.3));
  overflow: hidden;
}

.onb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-raised, #0F1520);
}

.onb-title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text, #C4F0E0);
}

.onb-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-overlay, #1E2D3D);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #5A9A82);
  cursor: pointer;
}

.onb-body {
  padding: 1.25rem;
}

.onb-step-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text, #C4F0E0);
  margin-bottom: 0.5rem;
}

.onb-step-desc {
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--color-text-muted, #5A9A82);
}

.onb-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1.25rem;
  border-top: 1px solid var(--color-border, rgba(126,196,168,0.1));
  background: var(--surface-sunken, #060A10);
}

.onb-dots {
  display: flex;
  gap: 0.35rem;
}

.onb-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: rgba(126, 196, 168, 0.18);
}

.onb-dot.active {
  background: var(--color-primary, #04A469);
}

.onb-actions {
  display: flex;
  gap: 0.5rem;
}

.onb-btn {
  padding: 0.5rem 0.9rem;
  background: var(--surface-overlay, #1E2D3D);
  color: var(--color-text-muted, #5A9A82);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-sm, 6px);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.onb-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.onb-btn-primary {
  padding: 0.5rem 0.9rem;
  background: var(--color-primary, #04A469);
  color: white;
  border: none;
  border-radius: var(--radius-sm, 6px);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
}

.onb-fade-enter-active,
.onb-fade-leave-active {
  transition: opacity 0.15s ease;
}

.onb-fade-enter-from,
.onb-fade-leave-to {
  opacity: 0;
}
</style>
