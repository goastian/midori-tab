<template>
  <div class="weather-widget">
    <header class="weather-header" :class="{ 'weather-header--managed': managed }">
      <div v-if="!managed || settings.locationLabel">
        <h3 v-if="!managed" class="weather-title">{{ i18n.$t('weather.title') }}</h3>
        <p class="weather-location">{{ settings.locationLabel }}</p>
      </div>
      <div class="weather-actions">
        <button type="button" class="weather-btn" @click="toggleUnit">{{ unitLabel }}</button>
        <button type="button" class="weather-btn" @click="refresh(true)" :disabled="loading" :aria-label="remoteCopy.retry" :title="remoteCopy.retry">↻</button>
      </div>
    </header>

    <div v-if="loading && !shownForecast" class="weather-state">{{ i18n.$t('weather.loading') }}</div>
    <div v-else-if="error && !shownForecast" class="weather-state weather-state--error" role="alert">{{ error }}</div>
    <div v-else-if="shownForecast" class="weather-body" :aria-busy="loading">
      <div class="weather-temp">{{ rounded(shownForecast.temperature) }}{{ degreeSuffix }}</div>
      <div class="weather-meta">
        <span>{{ conditionLabel }}</span>
        <span>{{ i18n.$t('weather.high') }} {{ rounded(shownForecast.high) }}{{ degreeSuffix }}</span>
        <span>{{ i18n.$t('weather.low') }} {{ rounded(shownForecast.low) }}{{ degreeSuffix }}</span>
        <span>{{ i18n.$t('weather.wind') }} {{ rounded(shownForecast.wind) }}</span>
      </div>
      <p class="weather-stale" :class="{ 'weather-stale--error': Boolean(error) }" role="status">{{ statusText }}</p>
    </div>
    <div v-else class="weather-state"></div>

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
import { fetchJsonWithTimeout } from '../services/fetchJsonWithTimeout.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';
import { WIDGET_COST, createWidgetRuntime } from '../composables/useWidgetRuntime.js';
import { getWidgetCopy } from '../i18n/widget-copy.js';
import { classifyRemoteError, describeRemoteState, formatAge } from '../utils/remoteStatus.js';

const SETTINGS_KEY = 'midori_weather_settings_v1';
const WEATHER_TTL_MS = 10 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 7000;
const WIDGET_POLICY = Object.freeze({
  key: 'weather',
  cost: WIDGET_COST.MEDIUM,
  usesNetwork: true,
  ttlMs: WEATHER_TTL_MS,
  stale: true,
  refresh: 'visible, foreground, manual, location-change',
});

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
  return settings.latitude !== null && settings.longitude !== null
    && Number.isFinite(Number(settings.latitude)) && Number.isFinite(Number(settings.longitude));
}

function formatCoordinates(latitude, longitude) {
  const lat = Number(latitude).toFixed(2);
  const lon = Number(longitude).toFixed(2);
  return `${lat}, ${lon}`;
}

function roundCoordinate(value) {
  return Math.round(Number(value) * 100) / 100;
}

function lookupJson(url, signal) {
  return fetchJsonWithTimeout(url, { cache: 'default', signal, timeoutMs: LOOKUP_TIMEOUT_MS });
}

export default {
  name: 'WeatherWidget',

  props: {
    managed: { type: Boolean, default: false },
  },

  data() {
    return {
      i18n: useI18nStore(),
      loading: false,
      error: '',
      forecast: null,
      manualLocation: '',
      settings: defaultSettings(),
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
    degreeSuffix() {
      return this.settings.unit === 'imperial' ? '°F' : '°C';
    },
    unitLabel() {
      return this.settings.unit === 'imperial' ? '°F' : '°C';
    },
    /** A forecast is only shown for the unit and place that are selected now. */
    shownForecast() {
      const forecast = this.forecast;
      if (!forecast || forecast.unit !== this.settings.unit || !hasValidCoordinates(this.settings)) return null;
      return roundCoordinate(forecast.latitude) === roundCoordinate(this.settings.latitude)
        && roundCoordinate(forecast.longitude) === roundCoordinate(this.settings.longitude) ? forecast : null;
    },
    conditionLabel() {
      const key = this.shownForecast?.conditionKey || 'unknown';
      return this.i18n.$t(`weather.conditions.${key}`);
    },
    statusText() {
      if (this.error) return this.error;
      if (this.loading) return this.i18n.$t('weather.loading');
      if (!this.shownForecast?.stale) return '';
      const age = formatAge(this.shownForecast.fetchedAt, this.i18n.locale);
      return age ? this.remoteCopy.savedFrom.replace('{age}', age) : this.i18n.$t('weather.stale');
    },
  },

  async mounted() {
    await this.restoreSettings();
    if (this.disposed) return;
    await this.showCachedForecast();
    if (this.disposed) return;
    this.widgetRuntime = createWidgetRuntime(this, WIDGET_POLICY, {
      onVisible: () => this.loadWhenVisible(),
      onFocus: () => this.loadWhenVisible(),
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
    rounded(value) {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.round(numeric) : '--';
    },

    async restoreSettings() {
      try {
        const parsed = await getJson(SETTINGS_KEY, {});
        if (this.disposed) return;
        this.settings = {
          ...defaultSettings(),
          ...parsed,
        };
        this.manualLocation = this.settings.locationLabel || '';
      } catch {
        if (this.disposed) return;
        this.settings = defaultSettings();
      }
    },

    async showCachedForecast() {
      this.forecast = null;
      if (!hasValidCoordinates(this.settings)) return;
      const requested = { latitude: this.settings.latitude, longitude: this.settings.longitude, unit: this.settings.unit };
      const cached = await weatherService.getCachedForecast(requested);
      if (this.disposed || requested.unit !== this.settings.unit
        || requested.latitude !== this.settings.latitude || requested.longitude !== this.settings.longitude) return;
      this.forecast = cached;
    },

    shouldReplaceLegacyDefault() {
      const label = String(this.settings.locationLabel || '').trim().toLowerCase();
      return (!this.settings.locationSource || this.settings.locationSource === 'auto') && label === 'madrid';
    },

    failureMessage(error, kind = classifyRemoteError(error)) {
      return describeRemoteState(this.remoteCopy, kind, {
        fetchedAt: this.shownForecast?.fetchedAt, locale: this.i18n.locale,
      });
    },

    /** Connectivity problems are reported as such; anything else keeps the specific message. */
    lookupFailureMessage(error, fallbackKey) {
      const kind = classifyRemoteError(error);
      return ['offline', 'network', 'timeout', 'rateLimited'].includes(kind)
        ? this.failureMessage(error, kind) : this.i18n.$t(fallbackKey);
    },

    async resolveLocationLabel(latitude, longitude, signal) {
      try {
        const endpoint = new URL('https://nominatim.openstreetmap.org/reverse');
        endpoint.searchParams.set('format', 'jsonv2');
        endpoint.searchParams.set('lat', String(latitude));
        endpoint.searchParams.set('lon', String(longitude));
        endpoint.searchParams.set('zoom', '10');
        endpoint.searchParams.set('addressdetails', '1');
        endpoint.searchParams.set('accept-language', this.i18n.locale || 'en');

        const { response, payload } = await lookupJson(endpoint.toString(), signal);
        if (!response.ok) throw new Error('Reverse geocode failed');

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

    /** Starts a cancellable lookup. Returns the signal, or null when a newer one replaced it. */
    beginLookup() {
      this.abortRequest();
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      this.requestController = controller;
      this.loading = true;
      this.error = '';
      return { controller, signal: controller?.signal, id: this.requestSequence };
    },

    endLookup(lookup) {
      if (lookup.id !== this.requestSequence) return;
      this.requestController = null;
      this.loading = false;
    },

    async useApproximateLocation() {
      const lookup = this.beginLookup();
      try {
        const { response, payload } = await lookupJson('https://ipwho.is/', lookup.signal);
        if (lookup.id !== this.requestSequence) return false;
        if (!response.ok) throw new Error('IP location failed');

        const latitude = Number(payload?.latitude);
        const longitude = Number(payload?.longitude);
        if (payload?.success === false || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          throw new Error('IP location unavailable');
        }

        const label = [payload.city, payload.country].filter(Boolean).join(', ')
          || await this.resolveLocationLabel(latitude, longitude, lookup.signal);
        if (lookup.id !== this.requestSequence) return false;
        this.applyLocation({ latitude, longitude, label, source: 'ip' });
        this.endLookup(lookup);
        return await this.refresh(true);
      } catch (error) {
        if (error?.name === 'AbortError' || lookup.id !== this.requestSequence) return false;
        this.error = this.lookupFailureMessage(error, 'weather.errors.locationRequired');
        this.endLookup(lookup);
        return false;
      }
    },

    applyLocation({ latitude, longitude, label, source }) {
      this.settings.latitude = latitude;
      this.settings.longitude = longitude;
      this.settings.locationLabel = label;
      this.settings.locationSource = source;
      this.manualLocation = label;
      this.persistSettings();
    },

    persistSettings() {
      try {
        setJsonDebounced(SETTINGS_KEY, this.settings, { delayMs: 600, maxBytes: 12_000 });
      } catch {
        // Ignore persist failures.
      }
    },

    abortRequest() {
      this.requestSequence += 1;
      if (this.requestController) {
        this.requestController.abort();
        this.requestController = null;
      }
      this.loading = false;
    },

    async loadWhenVisible() {
      return this.widgetRuntime?.runWhenVisible(async () => {
        if (!hasValidCoordinates(this.settings) || this.shouldReplaceLegacyDefault()) {
          return this.useApproximateLocation();
        }
        return this.refresh();
      });
    },

    async refresh(forceRefresh = false) {
      if (!hasValidCoordinates(this.settings)) {
        this.error = this.i18n.$t('weather.errors.locationRequired');
        this.loading = false;
        return false;
      }

      const lookup = this.beginLookup();
      try {
        const forecast = await weatherService.getForecast({
          latitude: this.settings.latitude,
          longitude: this.settings.longitude,
          unit: this.settings.unit,
          forceRefresh,
          signal: lookup.signal,
        });
        if (lookup.id !== this.requestSequence) return false;
        this.forecast = forecast;
        if (forecast.stale) this.error = this.failureMessage(null, forecast.failureKind || 'unavailable');
        return !forecast.stale;
      } catch (error) {
        if (error?.name === 'AbortError' || lookup.id !== this.requestSequence) return false;
        this.error = this.failureMessage(error);
        return false;
      } finally {
        this.endLookup(lookup);
      }
    },

    async toggleUnit() {
      this.settings.unit = this.settings.unit === 'metric' ? 'imperial' : 'metric';
      this.persistSettings();
      await this.showCachedForecast();
      this.refresh(true);
    },

    async useCurrentLocation(options = {}) {
      const automatic = Boolean(options.automatic);
      if (!navigator.geolocation) {
        if (!automatic) this.error = this.i18n.$t('weather.errors.noGeolocation');
        return;
      }

      const lookup = this.beginLookup();
      try {
        const position = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 6000,
            maximumAge: 10 * 60 * 1000,
          });
        });
        if (lookup.id !== this.requestSequence) return;

        const label = await this.resolveLocationLabel(position.coords.latitude, position.coords.longitude, lookup.signal);
        if (lookup.id !== this.requestSequence) return;
        this.applyLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, label, source: 'auto' });
        this.endLookup(lookup);
        await this.refresh(true);
      } catch {
        if (lookup.id !== this.requestSequence) return;
        this.error = automatic
          ? this.i18n.$t('weather.errors.locationRequired')
          : this.i18n.$t('weather.errors.locationDenied');
        this.endLookup(lookup);
      }
    },

    async applyManualLocation() {
      const city = this.manualLocation.trim();
      if (!city) return;

      const lookup = this.beginLookup();
      try {
        const endpoint = new URL('https://geocoding-api.open-meteo.com/v1/search');
        endpoint.searchParams.set('name', city);
        endpoint.searchParams.set('count', '1');

        const { response, payload } = await lookupJson(endpoint.toString(), lookup.signal);
        if (lookup.id !== this.requestSequence) return;
        if (!response.ok) throw new Error('Geocode failed');

        const result = Array.isArray(payload.results) ? payload.results[0] : null;
        if (!result) {
          this.error = this.i18n.$t('weather.errors.cityNotFound');
          this.endLookup(lookup);
          return;
        }

        this.applyLocation({
          latitude: result.latitude,
          longitude: result.longitude,
          label: [result.name, result.country].filter(Boolean).join(', '),
          source: 'manual',
        });
        await this.showCachedForecast();
        this.endLookup(lookup);
        await this.refresh(true);
      } catch (error) {
        if (error?.name === 'AbortError' || lookup.id !== this.requestSequence) return;
        this.error = this.lookupFailureMessage(error, 'weather.errors.cityNotFound');
        this.endLookup(lookup);
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

.weather-header--managed {
  justify-content: flex-end;
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
  min-height: 5.2rem;
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
  min-height: 5.2rem;
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
  min-height: 1.1em;
  font-size: 0.72rem;
  color: #f4c97b;
}

.weather-stale--error {
  color: #ef8f8f;
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
