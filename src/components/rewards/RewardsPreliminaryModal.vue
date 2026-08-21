<template>
  <Teleport to="body">
    <div class="rewards-scrim" role="presentation" @mousedown.self="$emit('close')">
      <section class="rewards-modal" role="dialog" aria-modal="true" aria-labelledby="rewards-title">
        <button class="rewards-close" type="button" :aria-label="t('rewards.close')" @click="$emit('close')">
          <DashboardIcon name="close" :size="20" aria-hidden="true" />
        </button>

        <template v-if="!stateReady">
          <div class="rewards-mark" aria-hidden="true"><DashboardIcon name="privacy" :size="38" :stroke-width="1.7" /></div>
          <p class="rewards-kicker">{{ t('rewards.kicker') }}</p>
          <h1 id="rewards-title">{{ t('rewards.saving') }}</h1>
        </template>

        <template v-else-if="step === 'intro'">
          <div class="rewards-mark" aria-hidden="true"><DashboardIcon name="privacy" :size="38" :stroke-width="1.7" /></div>
          <p class="rewards-kicker">{{ t('rewards.kicker') }}</p>
          <h1 id="rewards-title">{{ t('rewards.title') }}</h1>
          <p class="rewards-lede">{{ t('rewards.intro') }}</p>
          <ul class="rewards-points">
            <li>{{ t('rewards.pointOne') }}</li>
            <li>{{ t('rewards.pointTwo') }}</li>
            <li>{{ t('rewards.pointThree') }}</li>
          </ul>
          <button class="rewards-primary" type="button" @click="step = 'region'">{{ t('rewards.start') }}</button>
          <button class="rewards-secondary" type="button" @click="step = 'info'">{{ t('rewards.how') }}</button>
        </template>

        <template v-else-if="step === 'region'">
          <div class="rewards-mark rewards-mark--region" aria-hidden="true"><DashboardIcon name="globe" :size="38" :stroke-width="1.7" /></div>
          <p class="rewards-kicker">{{ t('rewards.kicker') }}</p>
          <h1 id="rewards-title">{{ t('rewards.regionTitle') }}</h1>
          <p class="rewards-lede">{{ t('rewards.regionIntro') }}</p>
          <label class="rewards-field" for="rewards-country">{{ t('rewards.countryLabel') }}</label>
          <select id="rewards-country" v-model="country" class="rewards-select" :disabled="saving">
            <option value="" disabled>{{ t('rewards.countryPlaceholder') }}</option>
            <option v-for="option in countries" :key="option.code" :value="option.code">{{ option.name }}</option>
          </select>
          <p v-if="error" class="rewards-error" role="alert">{{ error }}</p>
          <button class="rewards-primary" type="button" :disabled="!country || saving" @click="register">
            {{ saving ? t('rewards.saving') : t('rewards.continue') }}
          </button>
          <button class="rewards-secondary" type="button" :disabled="saving" @click="step = 'intro'">{{ t('rewards.back') }}</button>
        </template>

        <template v-else-if="step === 'registered'">
          <div class="rewards-mark rewards-mark--success" aria-hidden="true"><DashboardIcon name="privacy" :size="38" :stroke-width="1.7" /></div>
          <p class="rewards-kicker">{{ t('rewards.kicker') }}</p>
          <h1 id="rewards-title">{{ t('rewards.successTitle') }}</h1>
          <p class="rewards-lede">{{ t('rewards.successIntro') }}</p>
          <p class="rewards-notice">{{ t('rewards.successNotice') }}</p>
          <button class="rewards-primary" type="button" @click="$emit('close')">{{ t('rewards.done') }}</button>
        </template>

        <template v-else-if="step === 'pending'">
          <div class="rewards-mark rewards-mark--region" aria-hidden="true"><DashboardIcon name="globe" :size="38" :stroke-width="1.7" /></div>
          <p class="rewards-kicker">{{ t('rewards.kicker') }}</p>
          <h1 id="rewards-title">{{ t('rewards.pendingTitle') }}</h1>
          <p class="rewards-lede">{{ t('rewards.pendingIntro') }}</p>
          <p class="rewards-notice">{{ t('rewards.pendingNotice') }}</p>
          <button class="rewards-primary" type="button" :disabled="saving" @click="register">{{ saving ? t('rewards.saving') : t('rewards.retry') }}</button>
          <button class="rewards-secondary" type="button" :disabled="saving" @click="step = 'region'">{{ t('rewards.changeCountry') }}</button>
        </template>

        <template v-else>
          <div class="rewards-mark" aria-hidden="true"><DashboardIcon name="privacy" :size="38" :stroke-width="1.7" /></div>
          <h1 id="rewards-title">{{ t('rewards.howTitle') }}</h1>
          <p class="rewards-lede">{{ t('rewards.howIntro') }}</p>
          <p class="rewards-notice">{{ t('rewards.howNotice') }}</p>
          <button class="rewards-primary" type="button" @click="step = 'intro'">{{ t('rewards.back') }}</button>
        </template>
      </section>
    </div>
  </Teleport>
</template>

<script>
import { markRaw } from 'vue';
import DashboardIcon from '../icons/DashboardIcon.vue';
import RewardsInterestService from '../../services/RewardsInterestService.js';

const FALLBACK_COUNTRY_CODES = ['AR', 'AU', 'BR', 'CA', 'CL', 'CO', 'DE', 'ES', 'FR', 'GB', 'IT', 'JP', 'MX', 'NL', 'PE', 'PT', 'US', 'UY'];
// A hot-reloaded extension can temporarily combine this lazy view with an
// older already-loaded locale chunk. Never expose translation keys in that
// short compatibility window; normal locale files remain the source of truth.
const MISSING_COPY_FALLBACK = Object.freeze({
  'rewards.pendingTitle': 'Registration pending',
  'rewards.pendingIntro': 'Astian Ads could not confirm your preliminary registration.',
  'rewards.pendingNotice': 'Your country remains only on this device. No payment account or Juky destination has been created.',
  'rewards.retry': 'Try again',
  'rewards.changeCountry': 'Change country or region',
});

function countryCodes() {
  try {
    const values = Intl.supportedValuesOf?.('region') || [];
    const codes = values.filter(value => /^[A-Z]{2}$/.test(value));
    return codes.length ? codes : FALLBACK_COUNTRY_CODES;
  } catch (_) {
    return FALLBACK_COUNTRY_CODES;
  }
}

function initialCountry() {
  const candidate = String(navigator.language || '').split('-')[1] || '';
  return /^[A-Za-z]{2}$/.test(candidate) ? candidate.toUpperCase() : '';
}

export default {
  name: 'RewardsPreliminaryModal',
  components: { DashboardIcon },
  props: { i18n: { type: Object, required: true } },
  emits: ['close'],
  data() {
    // The service owns a private method. Vue must not proxy it.
    return {
      step: 'intro',
      country: initialCountry(),
      saving: false,
      error: '',
      stateReady: false,
      service: markRaw(new RewardsInterestService()),
    };
  },
  computed: {
    countries() {
      const names = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames([this.i18n.locale || 'en'], { type: 'region' }) : null;
      return countryCodes().map(code => ({ code, name: names?.of(code) || code })).sort((a, b) => a.name.localeCompare(b.name));
    },
  },
  mounted() {
    this.restoreRegistrationState();
  },
  methods: {
    t(key) {
      const translated = this.i18n.$t(key);
      return translated === key ? (MISSING_COPY_FALLBACK[key] || translated) : translated;
    },
    async restoreRegistrationState() {
      try {
        const saved = await this.service.state();
        if (saved?.countryCode && /^[A-Z]{2}$/.test(saved.countryCode)) this.country = saved.countryCode;
        if (saved?.status === 'preliminary') this.step = 'registered';
        if (saved?.status === 'pending_sync') this.step = 'pending';
      } finally {
        this.stateReady = true;
      }
    },
    async register() {
      this.error = '';
      this.saving = true;
      try {
        const registration = await this.service.register(this.country);
        this.step = registration.status === 'preliminary' ? 'registered' : 'pending';
      } catch (error) {
        this.error = error?.message || this.t('rewards.error');
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
.rewards-scrim { position: fixed; inset: 0; z-index: 180; display: grid; place-items: center; padding: 1rem; background: rgba(3, 8, 6, .78); }
.rewards-modal { position: relative; width: min(100%, 29rem); padding: 2.25rem; color: var(--color-text); background: var(--surface-raised); border: 1px solid var(--color-border-strong); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); text-align: center; }
.rewards-close { position: absolute; top: .9rem; right: .9rem; display: grid; place-items: center; width: 2.25rem; height: 2.25rem; color: var(--color-text-secondary); background: transparent; border: 0; border-radius: var(--radius-md); cursor: pointer; }
.rewards-close:hover { background: var(--surface-control-hover); color: var(--color-text); }
.rewards-mark { display: grid; place-items: center; width: 4.75rem; height: 4.75rem; margin: 0 auto 1.3rem; color: var(--color-primary); background: var(--color-accent-bg); border: 1px solid var(--color-accent-border); border-radius: 50%; }
.rewards-mark--region { color: var(--accent-teal); }
.rewards-mark--success { color: var(--color-primary); }
.rewards-kicker { margin-bottom: .55rem; color: var(--color-text-muted); font-size: .76rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
h1 { margin: 0; font-size: clamp(1.55rem, 4vw, 2rem); line-height: 1.15; }
.rewards-lede { margin: .9rem auto 1.35rem; max-width: 34ch; color: var(--color-text-secondary); line-height: 1.55; }
.rewards-points { display: grid; gap: .7rem; margin: 0 0 1.6rem; padding: 0; list-style: none; color: var(--color-text-secondary); text-align: left; }
.rewards-points li { position: relative; padding-left: 1.45rem; line-height: 1.4; }
.rewards-points li::before { position: absolute; left: 0; color: var(--color-primary); content: '✓'; font-weight: 700; }
.rewards-primary, .rewards-secondary { width: 100%; min-height: 2.9rem; border-radius: var(--radius-full); font: inherit; font-weight: 700; cursor: pointer; transition: transform var(--transition-fast), background var(--transition-fast), color var(--transition-fast); }
.rewards-primary { color: #062116; background: var(--color-primary); border: 1px solid var(--color-primary); }
.rewards-primary:hover:not(:disabled) { background: var(--color-primary-hover); transform: translateY(-1px); }
.rewards-primary:active:not(:disabled) { transform: translateY(0); }
.rewards-secondary { margin-top: .65rem; color: var(--color-text-secondary); background: transparent; border: 1px solid transparent; }
.rewards-secondary:hover:not(:disabled) { color: var(--color-text); background: var(--surface-control-hover); }
.rewards-primary:disabled, .rewards-secondary:disabled { cursor: not-allowed; opacity: .55; }
.rewards-field { display: block; margin: 0 0 .45rem; color: var(--color-text-secondary); font-size: .9rem; font-weight: 650; text-align: left; }
.rewards-select { width: 100%; min-height: 2.9rem; margin-bottom: 1rem; padding: 0 .85rem; color: var(--color-text); background: var(--surface-control); border: 1px solid var(--color-border-strong); border-radius: var(--radius-md); font: inherit; }
.rewards-error { margin: -.35rem 0 1rem; color: var(--accent-danger); font-size: .88rem; text-align: left; }
.rewards-notice { padding: .85rem 1rem; margin: 0 0 1.5rem; color: var(--color-text-secondary); background: var(--surface-sunken); border-radius: var(--radius-md); font-size: .9rem; line-height: 1.5; }
@media (max-width: 420px) { .rewards-modal { padding: 2rem 1.35rem 1.35rem; } }
</style>
