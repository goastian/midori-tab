<template>
  <MidoriUpdateToast v-if="updateNotice.visible" :visible="updateNotice.visible" :version="updateNotice.latestVersion" @defer="deferUpdateForToday" />
</template>

<script>
import { defineAsyncComponent, markRaw } from 'vue';
import { cancelRemoteTask, scheduleRemoteTask } from '../bootstrap/remoteTaskCoordinator.js';

const UPDATE_CHECK_WINDOW_MS = 10 * 60 * 1000;
const UPDATE_ERROR_RETRY_INTERVAL_MS = 2 * 60 * 1000;
const UPDATE_FOREGROUND_DEBOUNCE_MS = 15 * 1000;

export default {
  components: { MidoriUpdateToast: defineAsyncComponent(() => import('./MidoriUpdateToast.vue')) },
  data() {
    return {
      updateForegroundListener: null, lastForegroundUpdateCheckAt: 0, updateBrowserInfoPromise: null,
      updateCheckInFlight: false, updateServicePromise: null,
      updateNotice: { visible: false, latestVersion: '' }, disposed: false,
    };
  },
  async mounted() {
    this.setupUpdateForegroundChecks();
    if (!(await this.getUpdateBrowserInfo()).isMidori || this.disposed) return;
    await this.syncUpdateNoticeFromCache();
    if (!this.disposed && await this.shouldRevalidateMidoriUpdate()) await this.scheduleUpdateCheck();
  },
  beforeUnmount() {
    this.disposed = true;
    cancelRemoteTask('update');
    if (this.updateForegroundListener) {
      window.removeEventListener('focus', this.updateForegroundListener);
      document.removeEventListener('visibilitychange', this.updateForegroundListener);
    }
  },
  methods: {
    setupUpdateForegroundChecks() {
        const listener = async () => {
          if (document.visibilityState === 'hidden') {
            return;
          }

          const now = Date.now();
          if (now - this.lastForegroundUpdateCheckAt < UPDATE_FOREGROUND_DEBOUNCE_MS) {
            return;
          }

          this.lastForegroundUpdateCheckAt = now;
          if (!(await this.getUpdateBrowserInfo()).isMidori || this.disposed || document.visibilityState === 'hidden') {
            return;
          }
          await this.syncUpdateNoticeFromCache(now);
          if (await this.shouldRevalidateMidoriUpdate(now)) {
            await this.scheduleUpdateCheck({ now });
          }
        };

        this.updateForegroundListener = listener;
        window.addEventListener('focus', listener);
        document.addEventListener('visibilitychange', listener);
      },
    getUpdateBrowserInfo() {
        if (!this.updateBrowserInfoPromise) {
          this.updateBrowserInfoPromise = import('../utils/midoriBrowserInfo.js')
            .then(({ getMidoriBrowserInfo }) => getMidoriBrowserInfo())
            .catch(() => ({ isMidori: false, version: '' }));
        }
        return this.updateBrowserInfoPromise;
      },
    getUpdateService() {
        if (!this.updateServicePromise) {
          this.updateServicePromise = import('../services/MidoriUpdateService.js')
            .then(({ default: MidoriUpdateService }) =>
              markRaw(new MidoriUpdateService({
                checkIntervalMs: UPDATE_CHECK_WINDOW_MS,
                errorRetryIntervalMs: UPDATE_ERROR_RETRY_INTERVAL_MS,
              })));
        }
        return this.updateServicePromise;
      },
    applyUpdateResult(result) {
        this.updateNotice = {
          visible: Boolean(result.eligible),
          latestVersion: result.latestVersion || '',
        };
      },
    async syncUpdateNoticeFromCache(now = Date.now()) {
        const browserInfo = await this.getUpdateBrowserInfo();
        if (!browserInfo.isMidori) {
          this.updateNotice.visible = false;
          return null;
        }

        const updateService = await this.getUpdateService();
        const state = updateService.getCachedState();
        const result = updateService.getEligibility({
          browserInfo,
          state,
          now,
        });
        this.applyUpdateResult(result);
        return { state, result };
      },
    async shouldRevalidateMidoriUpdate(now = Date.now()) {
        const browserInfo = await this.getUpdateBrowserInfo();
        if (!browserInfo.isMidori) {
          return false;
        }

        const updateService = await this.getUpdateService();
        const state = updateService.getCachedState();
        const lastCheckedAt = Number(state.lastCheckedAt) || 0;
        if (!lastCheckedAt) {
          return true;
        }

        const activeWindowMs = state.lastResult === 'error'
          ? UPDATE_ERROR_RETRY_INTERVAL_MS
          : UPDATE_CHECK_WINDOW_MS;
        return now - lastCheckedAt >= activeWindowMs;
      },
    async checkMidoriUpdate(options = {}) {
        if (this.updateCheckInFlight) {
          return;
        }

        const browserInfo = await this.getUpdateBrowserInfo();
        if (!browserInfo.isMidori || document.visibilityState === 'hidden' || options.signal?.aborted) {
          return;
        }

        this.updateCheckInFlight = true;
        try {
          const updateService = await this.getUpdateService();
          const result = await updateService.checkForUpdate({
            browserInfo,
            now: options.now,
            force: options.force,
            signal: options.signal,
          });

          if (!options.signal?.aborted && document.visibilityState !== 'hidden') this.applyUpdateResult(result);
        } catch (error) {
          if (error?.name !== 'AbortError' && !options.signal?.aborted) console.warn('Midori update check failed:', error);
        } finally {
          this.updateCheckInFlight = false;
        }
      },
    async scheduleUpdateCheck(options = {}) {
        if (this.disposed || !(await this.getUpdateBrowserInfo()).isMidori) return false;
        return scheduleRemoteTask('update', signal => this.checkMidoriUpdate({ ...options, signal }), {
          priority: 0,
          notBeforeMs: 5000,
        });
      },
    async deferUpdateForToday() {
        this.updateNotice.visible = false;
        const updateService = await this.getUpdateService();
        updateService.deferForToday();
      },

  },
};
</script>
