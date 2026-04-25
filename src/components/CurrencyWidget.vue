<template>
  <div class="currency-widget">
    <header class="currency-header">
      <h3 class="currency-title">{{ i18n.$t('currency.title') }}</h3>
      <button type="button" class="currency-refresh" @click="refresh" :disabled="loading">↻</button>
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

    <div class="currency-result">
      <span class="currency-value">{{ formattedResult }}</span>
      <span class="currency-meta">{{ rateCopy }}</span>
      <span v-if="isStale" class="currency-stale">{{ i18n.$t('currency.stale') }}</span>
      <span v-if="loading" class="currency-loading">{{ i18n.$t('currency.loading') }}</span>
      <span v-else-if="error" class="currency-error">{{ error }}</span>
    </div>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import currencyService from '../services/CurrencyService.js';

const SETTINGS_KEY = 'midori_currency_settings_v1';

function getDefaultSettings() {
  return {
    from: 'USD',
    to: 'EUR',
    amountInput: '1',
  };
}

export default {
  name: 'CurrencyWidget',

  data() {
    return {
      i18n: useI18nStore(),
      loading: false,
      error: '',
      rates: null,
      fetchedAt: null,
      isStale: false,
      from: 'USD',
      to: 'EUR',
      amountInput: '1',
      currencyCodes: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'CAD', 'AUD', 'MXN', 'BRL', 'RUB', 'INR'],
    };
  },

  computed: {
    amount() {
      const normalized = String(this.amountInput).replace(',', '.');
      const value = Number(normalized);
      return Number.isFinite(value) ? value : null;
    },

    convertedAmount() {
      if (!this.rates || this.amount === null) return null;
      return currencyService.convert(this.amount, this.rates, this.to);
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
      const rate = this.rates?.[this.to];
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
      this.refresh();
    },
    to() {
      this.persistSettings();
    },
    amountInput() {
      this.persistSettings();
    },
  },

  mounted() {
    this.restoreSettings();
    this.refresh();
  },

  methods: {
    restoreSettings() {
      try {
        const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        const settings = { ...getDefaultSettings(), ...parsed };
        this.from = settings.from;
        this.to = settings.to;
        this.amountInput = settings.amountInput;
      } catch {
        const defaults = getDefaultSettings();
        this.from = defaults.from;
        this.to = defaults.to;
        this.amountInput = defaults.amountInput;
      }
    },

    persistSettings() {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({
          from: this.from,
          to: this.to,
          amountInput: this.amountInput,
        }));
      } catch {
        // Ignore persist failures.
      }
    },

    async refresh() {
      this.loading = true;
      this.error = '';
      try {
        const data = await currencyService.getRates(this.from);
        this.rates = data.rates;
        this.fetchedAt = data.fetchedAt;
        this.isStale = Boolean(data.stale);
      } catch {
        this.error = this.i18n.$t('currency.errors.unavailable');
      } finally {
        this.loading = false;
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

.currency-stale {
  font-size: 0.72rem;
  color: #f4c97b;
}

.currency-loading {
  font-size: 0.72rem;
  color: var(--color-text-muted, #5A9A82);
}

.currency-error {
  font-size: 0.72rem;
  color: #ef8f8f;
}

@media (max-width: 640px) {
  .currency-grid {
    grid-template-columns: 1fr;
  }
}
</style>
