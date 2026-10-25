<template>
  <div class="currency-widget">
    <header class="currency-header" :class="{ 'currency-header--managed': managed }">
      <h3 v-if="!managed" class="currency-title">{{ i18n.$t('currency.title') }}</h3>
      <button type="button" class="currency-refresh" @click="refresh(true)" :disabled="loading" :aria-label="remoteCopy.retry" :title="remoteCopy.retry">↻</button>
    </header>

    <div class="currency-grid">
      <label class="currency-field currency-field--amount">
        <span>{{ i18n.$t('currency.amount') }}</span>
        <input v-model="amountInput" inputmode="decimal" type="text" />
      </label>

      <label class="currency-field">
        <span>{{ i18n.$t('currency.from') }}</span>
        <select v-model="from">
          <option v-for="code in currencyCodes" :key="code" :value="code">{{ code }}</option>
        </select>
      </label>

      <label class="currency-field">
        <span>{{ i18n.$t('currency.to') }}</span>
        <select v-model="to">
          <option v-for="code in currencyCodes" :key="code" :value="code">{{ code }}</option>
        </select>
      </label>
    </div>

    <div class="currency-result" :aria-busy="loading">
      <span class="currency-value">{{ formattedResult }}</span>
      <span class="currency-meta">{{ rateCopy }}</span>
      <span class="currency-status" :class="{ 'currency-status--error': Boolean(error) }" role="status">{{ statusText }}</span>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import currencyService from '../services/CurrencyService.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';
import { WIDGET_COST, createWidgetRuntime } from '../composables/useWidgetRuntime.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import { classifyRemoteError, describeRemoteState, formatAge } from '../utils/remoteStatus.js';

const SETTINGS_KEY = 'midori_currency_settings_v1';
const CURRENCY_TTL_MS = 45 * 60 * 1000;
const WIDGET_POLICY = Object.freeze({
  key: 'currency',
  cost: WIDGET_COST.LOW,
  usesNetwork: true,
  ttlMs: CURRENCY_TTL_MS,
  stale: true,
  refresh: 'visible, foreground, manual, currency-change',
});

function getDefaultSettings() {
  return {
    from: 'USD',
    to: 'EUR',
    amountInput: '1',
  };
}

export default {
  name: 'CurrencyWidget',

  props: {
    managed: { type: Boolean, default: false },
  },

  data() {
    return {
      i18n: useI18nStore(),
      loading: false,
      error: '',
      rates: null,
      ratesBase: '',
      fetchedAt: null,
      isStale: false,
      from: 'USD',
      to: 'EUR',
      amountInput: '1',
      currencyCodes: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'MXN', 'BRL', 'RUB', 'INR'],
      requestController: null,
      requestSequence: 0,
      disposed: false,
      widgetPolicy: WIDGET_POLICY,
      widgetRuntime: null,
    };
  },

  computed: {
    remoteCopy() {
      return getWidgetCopy(this.i18n.locale).remoteStatus;
    },
    /** Rates are only used for the base currency that is selected now. */
    activeRates() {
      return this.ratesBase === this.from ? this.rates : null;
    },
    statusText() {
      if (this.error) return this.error;
      if (this.loading) return this.i18n.$t('currency.loading');
      if (!this.isStale || !this.activeRates) return '';
      const age = formatAge(this.fetchedAt, this.i18n.locale);
      return age ? this.remoteCopy.savedFrom.replace('{age}', age) : this.i18n.$t('currency.stale');
    },
    amount() {
      const normalized = String(this.amountInput).replace(',', '.');
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    },

    convertedAmount() {
      if (!this.activeRates || this.amount === null) return null;
      return currencyService.convert(this.amount, this.activeRates, this.to);
    },

    formattedResult() {
      if (this.convertedAmount === null) return '--';
      return new Intl.NumberFormat(this.i18n.locale, {
        style: 'currency',
        currency: this.to,
        maximumFractionDigits: 4,
      }).format(this.convertedAmount);
    },

    rateCopy() {
      const rate = this.activeRates?.[this.to];
      if (!Number.isFinite(rate)) return this.i18n.$t('currency.rateUnavailable');
      const formatted = new Intl.NumberFormat(this.i18n.locale, {
        maximumFractionDigits: 6,
      }).format(rate);
      return `${this.i18n.$t('currency.rate')}: 1 ${this.from} = ${formatted} ${this.to}`;
    },
  },

  watch: {
    from() {
      this.persistSettings();
      this.error = '';
      void this.showCachedRates().then(() => this.refreshWhenVisible({ runtimeForce: true }));
    },
    to() {
      this.persistSettings();
    },
    amountInput() {
      this.persistSettings();
    },
  },

  async mounted() {
    await this.restoreSettings();
    if (this.disposed) return;
    await this.showCachedRates();
    if (this.disposed) return;
    this.widgetRuntime = createWidgetRuntime(this, WIDGET_POLICY, {
      onVisible: () => this.refreshWhenVisible({ runtimeForce: !this.activeRates }),
      onFocus: () => this.refreshWhenVisible({ runtimeForce: !this.activeRates }),
      onHidden: () => this.abortRequest(),
    });
    this.$nextTick(() => { if (!this.disposed) this.widgetRuntime?.mount(); });
  },

  beforeUnmount() {
    this.disposed = true;
    this.widgetRuntime?.dispose();
    this.abortRequest();
  },

  methods: {
    async restoreSettings() {
      try {
        const parsed = await getJson(SETTINGS_KEY, {});
        if (this.disposed) return;
        const settings = { ...getDefaultSettings(), ...parsed };
        this.from = settings.from;
        this.to = settings.to;
        this.amountInput = settings.amountInput;
      } catch {
        if (this.disposed) return;
        const defaults = getDefaultSettings();
        this.from = defaults.from;
        this.to = defaults.to;
        this.amountInput = defaults.amountInput;
      }
    },

    persistSettings() {
      try {
        setJsonDebounced(SETTINGS_KEY, {
          from: this.from,
          to: this.to,
          amountInput: this.amountInput,
        }, { delayMs: 700, maxBytes: 12_000 });
      } catch {
        // Ignore persist failures.
      }
    },

    async showCachedRates() {
      const base = this.from;
      const cached = await currencyService.getCachedRates(base);
      if (this.disposed || base !== this.from) return;
      this.rates = cached?.rates || null;
      this.ratesBase = cached ? base : '';
      this.fetchedAt = cached?.fetchedAt || null;
      this.isStale = Boolean(cached?.stale);
    },

    abortRequest() {
      this.requestSequence += 1;
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
      this.loading = false;
    },

    refreshWhenVisible(options = {}) {
      if (!this.widgetRuntime) return false;
      if (!this.widgetRuntime.canRun()) return false;
      return this.widgetRuntime.runWhenVisible(() => this.refresh(Boolean(options.force)),
        { ...options, force: Boolean(options.runtimeForce ?? options.force) });
    },

    failureMessage(error, kind = classifyRemoteError(error)) {
      return describeRemoteState(this.remoteCopy, kind, {
        fetchedAt: this.activeRates ? this.fetchedAt : null, locale: this.i18n.locale,
      });
    },

    async refresh(forceRefresh = false) {
      this.abortRequest();
      const requestId = this.requestSequence;
      const base = this.from;
      this.loading = true;
      this.error = '';
      this.requestController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        const data = await currencyService.getRates(base, {
          forceRefresh,
          signal: this.requestController?.signal,
        });
        if (requestId !== this.requestSequence) return false;
        this.rates = data.rates;
        this.ratesBase = base;
        this.fetchedAt = data.fetchedAt;
        this.isStale = Boolean(data.stale);
        if (data.stale) this.error = this.failureMessage(null, data.failureKind || 'unavailable');
        return !data.stale;
      } catch (error) {
        if (error?.name === 'AbortError' || requestId !== this.requestSequence) return false;
        this.error = this.failureMessage(error);
        return false;
      } finally {
        if (requestId === this.requestSequence) {
          this.requestController = null;
          this.loading = false;
        }
      }
    },
  },
};
</script>

<style scoped>
.currency-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.85rem;
  color: var(--color-text, #C4F0E0);
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.currency-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.currency-header--managed {
  justify-content: flex-end;
}

.currency-title {
  margin: 0;
  font-size: 0.9rem;
}

.currency-refresh {
  border: 1px solid var(--color-border, rgba(126,196,168,0.15));
  background: var(--surface-sunken, #060A10);
  color: var(--color-text, #C4F0E0);
  border-radius: var(--radius-sm, 6px);
  padding: 0.2rem 0.45rem;
  cursor: pointer;
}

.currency-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr 1fr;
  gap: 0.45rem;
}

.currency-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.7rem;
  color: var(--color-text-muted, #5A9A82);
}

.currency-field input,
.currency-field select {
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.15));
  color: var(--color-text, #C4F0E0);
  border-radius: var(--radius-sm, 6px);
  padding: 0.3rem 0.45rem;
  font-size: 0.75rem;
}

.currency-result {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.currency-value {
  font-size: 1.2rem;
  font-weight: 700;
}

.currency-meta {
  font-size: 0.73rem;
  color: var(--color-text-muted, #5A9A82);
}

.currency-status {
  min-height: 1.1em;
  font-size: 0.72rem;
  color: #f4c97b;
}

.currency-status--error {
  color: #ef8f8f;
}

@media (max-width: 640px) {
  .currency-grid {
    grid-template-columns: 1fr;
  }
}
</style>
