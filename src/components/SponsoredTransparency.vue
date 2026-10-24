<template>
  <div
    class="transparency-panel"
    role="dialog"
    :aria-label="i18n.$t('ads.whyTitle')"
    @click.stop
  >
    <strong>{{ i18n.$t('ads.whyTitle') }}</strong>
    <p>{{ i18n.$t('ads.whyCopy') }}</p>
    <p v-if="frequencyCap > 0" class="frequency-copy">{{ frequencyCopy }}</p>

    <div v-if="transparency?.feedback_enabled" class="feedback-actions">
      <span>{{ i18n.$t('ads.feedbackPrompt') }}</span>
      <div>
        <button type="button" :disabled="feedbackPending" @click="$emit('feedback', true)">
          {{ i18n.$t('ads.relevant') }}
        </button>
        <button type="button" :disabled="feedbackPending" @click="$emit('feedback', false)">
          {{ i18n.$t('ads.notRelevant') }}
        </button>
      </div>
      <small v-if="feedbackMessage" role="status">{{ feedbackMessage }}</small>
    </div>

    <button type="button" class="dismiss-action" @click="$emit('dismiss')">
      {{ i18n.$t('ads.dismiss') }}
    </button>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';

export default {
  emits: ['feedback', 'dismiss'],
  props: {
    transparency: { type: Object, default: null },
    feedbackPending: { type: Boolean, default: false },
    feedbackState: { type: String, default: '' },
  },
  data() { return { i18n: useI18nStore() }; },
  computed: {
    frequencyCap() {
      return Number(this.transparency?.frequency_cap_per_day || 0);
    },
    frequencyCopy() {
      return String(this.i18n.$t('ads.frequencyCap')).replace('{count}', String(this.frequencyCap));
    },
    feedbackMessage() {
      if (this.feedbackState === 'sent') return this.i18n.$t('ads.feedbackThanks');
      if (this.feedbackState === 'error') return this.i18n.$t('ads.feedbackError');
      return '';
    },
  },
};
</script>

<style scoped>
.transparency-panel {
  width: min(330px, calc(100vw - 2rem));
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 30;
  padding: 0.88rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-base, #f5f8f7);
  border: 1px solid var(--color-border-hover, rgba(34, 75, 61, 0.22));
  border-radius: var(--nova-panel-radius, 14px);
  box-shadow: 0 18px 46px rgba(8, 35, 26, 0.22);
  font-size: 0.74rem;
}

.transparency-panel p {
  margin: 0.45rem 0 0;
  color: var(--color-text-muted, #5a7b6d);
  line-height: 1.45;
}

.frequency-copy { font-weight: 600; }

.feedback-actions {
  display: grid;
  gap: 0.44rem;
  margin-top: 0.72rem;
  padding-top: 0.62rem;
  border-top: 1px solid var(--color-border, rgba(34, 75, 61, 0.12));
}

.feedback-actions div { display: flex; gap: 0.38rem; }

.feedback-actions button,
.dismiss-action {
  min-height: 29px;
  padding: 0.32rem 0.5rem;
  color: var(--color-text, #1a2b26);
  background: var(--surface-control, rgba(255, 255, 255, 0.78));
  border: 1px solid var(--color-border, rgba(34, 75, 61, 0.14));
  border-radius: 7px;
  font: inherit;
  font-size: 0.69rem;
  cursor: pointer;
}

.feedback-actions button:disabled { cursor: wait; opacity: 0.6; }
.feedback-actions small { color: var(--color-primary, #047a50); }

.dismiss-action {
  width: 100%;
  margin-top: 0.62rem;
  color: var(--color-text-muted, #5a7b6d);
  background: transparent;
}

button:focus-visible {
  outline: 2px solid var(--color-primary, #04a469);
  outline-offset: 2px;
}

@media (max-width: 600px) {
  .transparency-panel {
    position: fixed;
    top: auto;
    right: 1rem;
    bottom: 1rem;
    left: 1rem;
    width: auto;
  }
}
</style>
