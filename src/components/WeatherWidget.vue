<template>
  <div class="weather-widget">
    <header class="weather-header">
      <div>
        <h3 class="weather-title">{{ i18n.$t('weather.title') }}</h3>
        <p class="weather-location">{{ settings.locationLabel }}</p>
      </div>
      <div class="weather-actions">
        <button type="button" class="weather-btn" @click="toggleUnit">{{ unitLabel }}</button>
        <button type="button" class="weather-btn" @click="refresh(true)" :disabled="loading">↻</button>
      </div>
    </header>

    <div v-if="loading" class="weather-state">{{ i18n.$t('weather.loading') }}</div>
    <div v-else-if="error" class="weather-state weather-state--error">{{ error }}</div>
    <div v-else-if="forecast" class="weather-body">
      <div class="weather-temp">{{ rounded(forecast.temperature) }}{{ degreeSuffix }}</div>
      <div class="weather-meta">
        <span>{{ conditionLabel }}</span>
        <span>{{ i18n.$t('weather.high') }} {{ rounded(forecast.high) }}{{ degreeSuffix }}</span>
        <span>{{ i18n.$t('weather.low') }} {{ rounded(forecast.low) }}{{ degreeSuffix }}</span>
        <span>{{ i18n.$t('weather.wind') }} {{ rounded(forecast.wind) }}</span>
      </div>
      <p v-if="forecast.stale" class="weather-stale">{{ i18n.$t('weather.stale') }}</p>
    </div>

    <footer class="weather-footer">
      <button type="button" class="weather-link" @click="useCurrentLocation">{{ i18n.$t('weather.useCurrentLocation') }}</button>
      <label class="weather-city">
        <span>{{ i18n.$t('weather.city') }}</span>
        <input v-model.trim="manualLocation" type="text" :placeholder="i18n.$t('weather.cityPlaceholder')" @keydown.enter="applyManualLocation" />
      </label>
      <button type="button" class="weather-link" @click="applyManualLocation">{{ i18n.$t('weather.apply') }}</button>
    </footer>
  </div>
</template>

<script>
import useI18nStore from '../stores/useI18nStore.js';
import weatherService from '../services/WeatherService.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';

const SETTINGS_KEY = 'midori_weather_settings_v1';

function defaultSettings() {
  return {
    unit: 'metric',
    latitude: null,
    longitude: null,
    locationLabel: '',
    locationSource: 'auto',
  };
}

function hasValidCoordinates(settings) {
  return Number.isFinite(Number(settings.latitude)) && Number.isFinite(Number(settings.longitude));
}

function formatCoordinates(latitude, longitude) {
  const lat = Number(latitude).toFixed(2);
  const lon = Number(longitude).toFixed(2);
  return `${lat}, ${lon}`;
}

export default {
  name: 'WeatherWidget',

  data() {
    return {
      i18n: useI18nStore(),
      loading: false,
      error: '',
      forecast: null,
      manualLocation: '',
      settings: defaultSettings(),
      requestController: null,
    };
  },

  computed: {
    degreeSuffix() {
      return this.settings.unit === 'imperial' ? '°F' : '°C';
    },
    unitLabel() {
      return this.settings.unit === 'imperial' ? '°F' : '°C';
    },
    conditionLabel() {
      const key = this.forecast?.conditionKey || 'unknown';
      return this.i18n.$t(`weather.conditions.${key}`);
    },
  },

  async mounted() {
    await this.restoreSettings();
    if (!hasValidCoordinates(this.settings) || this.shouldReplaceLegacyDefault()) {
      await this.useApproximateLocation();
      if (hasValidCoordinates(this.settings)) return;
    }
    await this.refresh();
  },

  beforeUnmount() {
    this.abortRequest();
  },

  methods: {
    rounded(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric) : '--';
    },

    async restoreSettings() {
      try {
        const parsed = await getJson(SETTINGS_KEY, {});
        this.settings = {
          ...defaultSettings(),
          ...parsed,
        };
        this.manualLocation = this.settings.locationLabel || '';
      } catch {
        this.settings = defaultSettings();
      }
    },

    shouldReplaceLegacyDefault() {
      const label = String(this.settings.locationLabel || '').trim().toLowerCase();
      return (!this.settings.locationSource || this.settings.locationSource === 'auto') && label === 'madrid';
    },

    async resolveLocationLabel(latitude, longitude) {
      try {
        const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
        endpoint.searchParams.set('format', 'jsonv2');
        endpoint.searchParams.set('lat', String(latitude));
        endpoint.searchParams.set('lon', String(longitude));
        endpoint.searchParams.set('zoom', '10');
        endpoint.searchParams.set('addressdetails', '1');
        endpoint.searchParams.set('accept-language', this.i18n.locale || 'en');

        const response = await fetch(endpoint.toString(), { cache: 'default' });
        if (!response.ok) throw new Error('Reverse geocode failed');

        const payload = await response.json();
        const address = payload?.address || {};
        const place = address.city || address.town || address.village || address.municipality || address.county || address.state;
        const country = address.country;
        if (place && country) return `${place}, ${country}`;
        if (place) return place;
        if (payload?.name) return payload.name;
      } catch {
        // Fall back to coordinates so the widget never shows a wrong default city.
      }
      return `${this.i18n.$t('weather.currentLocationLabel')} (${formatCoordinates(latitude, longitude)})`;
    },

    async useApproximateLocation() {
      this.loading = true;
      this.error = '';

      try {
        const response = await fetch('https://ipwho.is/', { cache: 'default' });
        if (!response.ok) throw new Error('IP location failed');

        const payload = await response.json();
        const latitude = Number(payload?.latitude);
        const longitude = Number(payload?.longitude);
        if (payload?.success === false || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('IP location unavailable');
        }

        this.settings.latitude = latitude;
        this.settings.longitude = longitude;
        this.settings.locationLabel = [payload.city, payload.country].filter(Boolean).join(', ')
          || await this.resolveLocationLabel(latitude, longitude);
        this.settings.locationSource = 'ip';
        this.manualLocation = this.settings.locationLabel;
        this.persistSettings();
        await this.refresh(true);
      } catch {
        this.forecast = null;
        this.error = this.i18n.$t('weather.errors.locationRequired');
        this.loading = false;
      }
    },

    persistSettings() {
      try {
        setJsonDebounced(SETTINGS_KEY, this.settings, { delayMs: 600, maxBytes: 12_000 });
      } catch {
        // Ignore persist failures.
      }
    },

    abortRequest() {
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
    },

    async refresh(forceRefresh = false) {
      if (!hasValidCoordinates(this.settings)) {
        this.forecast = null;
        this.error = this.i18n.$t('weather.errors.locationRequired');
        this.loading = false;
        return;
      }

      this.loading = true;
      this.error = '';
      this.abortRequest();
      this.requestController = typeof AbortController !== 'undefined' ? new AbortController() : null;
      try {
        this.forecast = await weatherService.getForecast({
          latitude: this.settings.latitude,
          longitude: this.settings.longitude,
          unit: this.settings.unit,
          forceRefresh,
          signal: this.requestController?.signal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;
        this.error = this.i18n.$t('weather.errors.unavailable');
      } finally {
        this.requestController = null;
        this.loading = false;
      }
    },

    toggleUnit() {
      this.settings.unit = this.settings.unit === 'metric' ? 'imperial' : 'metric';
      this.persistSettings();
      this.refresh(true);
    },

    async useCurrentLocation(options = {}) {
      const automatic = Boolean(options.automatic);
      if (!navigator.geolocation) {
        if (!automatic) this.error = this.i18n.$t('weather.errors.noGeolocation');
        return;
      }

      this.loading = true;
      this.error = '';

      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 10 * 60 * 1000,
          });
        });

        this.settings.latitude = position.coords.latitude;
        this.settings.longitude = position.coords.longitude;
        this.settings.locationLabel = await this.resolveLocationLabel(position.coords.latitude, position.coords.longitude);
        this.settings.locationSource = 'auto';
        this.manualLocation = this.settings.locationLabel;
        this.persistSettings();
        await this.refresh(true);
      } catch {
        this.error = automatic
          ? this.i18n.$t('weather.errors.locationRequired')
          : this.i18n.$t('weather.errors.locationDenied');
        this.loading = false;
      }
    },

    async applyManualLocation() {
      const city = this.manualLocation.trim();
      if (!city) return;

      this.loading = true;
      this.error = '';
      try {
        const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
        endpoint.searchParams.set('name', city);
        endpoint.searchParams.set('count', '1');

        const response = await fetch(endpoint.toString(), { cache: 'default' });
        if (!response.ok) throw new Error('Geocode failed');

        const payload = await response.json();
        const result = Array.isArray(payload.results) ? payload.results[0] : null;
        if (!result) {
          this.error = this.i18n.$t('weather.errors.cityNotFound');
          return;
        }

        this.settings.latitude = result.latitude;
        this.settings.longitude = result.longitude;
        this.settings.locationLabel = [result.name, result.country].filter(Boolean).join(', ');
        this.settings.locationSource = 'manual';
        this.persistSettings();
        await this.refresh(true);
      } catch {
        this.error = this.i18n.$t('weather.errors.cityNotFound');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.weather-widget {
  background: var(--surface-raised, #0F1520);
  border: 1px solid var(--color-border, rgba(126,196,168,0.1));
  border-radius: var(--radius-md, 10px);
  padding: 0.85rem;
  color: var(--color-text, #C4F0E0);
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.weather-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.weather-title {
  margin: 0;
  font-size: 0.9rem;
}

.weather-location {
  margin: 0.15rem 0 0;
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
}

.weather-actions {
  display: flex;
  gap: 0.35rem;
}

.weather-btn {
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.15));
  color: var(--color-text, #C4F0E0);
  border-radius: var(--radius-sm, 6px);
  font-size: 0.72rem;
  padding: 0.25rem 0.45rem;
  cursor: pointer;
}

.weather-state {
  font-size: 0.8rem;
  color: var(--color-text-muted, #5A9A82);
}

.weather-state--error {
  color: #ef8f8f;
}

.weather-body {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.weather-temp {
  font-size: 1.7rem;
  font-weight: 700;
  line-height: 1;
}

.weather-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.8rem;
  font-size: 0.75rem;
  color: var(--color-text-muted, #5A9A82);
}

.weather-stale {
  margin: 0;
  font-size: 0.72rem;
  color: #f4c97b;
}

.weather-footer {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.4rem;
  align-items: end;
}

.weather-link {
  background: transparent;
  border: none;
  color: var(--color-primary, #4de0b2);
  font-size: 0.72rem;
  cursor: pointer;
  padding: 0;
}

.weather-city {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  font-size: 0.68rem;
  color: var(--color-text-muted, #5A9A82);
}

.weather-city input {
  background: var(--surface-sunken, #060A10);
  border: 1px solid var(--color-border, rgba(126,196,168,0.15));
  color: var(--color-text, #C4F0E0);
  border-radius: var(--radius-sm, 6px);
  padding: 0.28rem 0.45rem;
  font-size: 0.75rem;
  min-width: 0;
}

@media (max-width: 640px) {
  .weather-footer {
    grid-template-columns: 1fr;
  }
}
</style>
