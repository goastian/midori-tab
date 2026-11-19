<template>
  <Teleport to="body">
    <Transition name="apps-fade" appear>
      <div v-if="visible" class="apps-overlay" @click="$emit('close')">
        <section ref="appsPanel" class="apps-panel" role="dialog" aria-modal="true" :aria-label="copy.title" tabindex="-1" @click.stop>
          <div class="apps-header">
            <div class="apps-header__logo">
              <img :src="astianLogo" alt="Astian" class="apps-brand" width="103" height="27" />
              <span class="apps-brand-light" role="img" aria-label="Astian" :style="{ maskImage: `url(${astianLogo})` }"></span>
            </div>
            <button class="apps-close" type="button" @click="$emit('close')" :aria-label="copy.close">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <nav class="apps-grid" :aria-label="copy.title">
            <a
              v-for="app in astianApps"
              :key="app.id"
              :href="app.url"
              target="_blank"
              rel="noopener noreferrer"
              class="app-item"
              :title="app.name"
              @click="$emit('close')"
            >
              <span class="app-item__icon app-item__icon--minimal">
                <svg v-if="app.id === 'cloud'" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 10h-1.25A7.5 7.5 0 1 0 9.5 20H18a5 5 0 0 0 0-10Z" />
                </svg>
                <svg v-else-if="app.id === 'notes'" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
                  <path d="M14 3v5h5" />
                  <path d="M8 13h8M8 17h6" />
                </svg>
                <svg v-else-if="app.id === 'calendar'" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="4" y="5" width="16" height="16" rx="2" />
                  <path d="M8 3v4M16 3v4M4 10h16" />
                  <path d="M8 14h3M13 14h3M8 17h3" />
                </svg>
                <svg v-else-if="app.id === 'vpn'" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="M9.5 12.5 11.5 14.5 15.5 9.5" />
                </svg>
                <svg v-else-if="app.id === 'browser'" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18" />
                  <path d="M12 3a14 14 0 0 1 3.2 9A14 14 0 0 1 12 21a14 14 0 0 1-3.2-9A14 14 0 0 1 12 3Z" />
                </svg>
                <svg v-else-if="app.id === 'search'" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m16.5 16.5 4 4" />
                </svg>
                <svg v-else-if="app.id === 'mail'" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="m4 7 8 6 8-6" />
                </svg>
                <svg v-else-if="app.id === 'ads' || app.id === 'wallet'" viewBox="0 0 24 24" aria-hidden="true">
                  <rect x="3" y="4" width="18" height="13" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                  <path d="M8 12h8M8 9h5" />
                </svg>
                <svg v-else-if="app.id === 'sync'" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6v5h-5" />
                  <path d="M4 18v-5h5" />
                  <path d="M6.2 9A7 7 0 0 1 18.7 7.3L20 11" />
                  <path d="M17.8 15A7 7 0 0 1 5.3 16.7L4 13" />
                </svg>
              </span>
              <span class="app-item__name">{{ app.name }}</span>
            </a>
          </nav>

          <div class="apps-footer">
            <a href="https://astian.org" target="_blank" rel="noopener noreferrer" class="apps-footer__link" @click="$emit('close')">
              {{ copy.more }} <span aria-hidden="true">↗</span>
            </a>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { nextTick } from 'vue';
import useI18nStore from '../../stores/useI18nStore.js';
import { manageDialogFocus } from '../../utils/dialogFocus.js';
import astianLogo from '../../assets/astian-logo.png';

export default {
  name: 'AstianAppsMenu',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close'],
  computed: {
    copy() {
      return this.i18n.locale === 'es'
        ? { title: 'Aplicaciones de Astian', close: 'Cerrar aplicaciones', more: 'Explorar el ecosistema Astian' }
        : { title: 'Astian apps', close: 'Close apps menu', more: 'Explore the Astian ecosystem' };
    },
  },
  mounted() {
    nextTick(() => { this.releaseDialogFocus = manageDialogFocus(this.$refs.appsPanel, { close: () => this.$emit('close'), restoreTo: '.hamburger-btn' }); });
  },
  beforeUnmount() { this.releaseDialogFocus?.(); },
  data() {
    return {
      astianLogo,
      i18n: useI18nStore(),
      astianApps: [
        { id: 'cloud', name: 'Astian Cloud', url: 'https://cloud2.astian.org' },
        { id: 'notes', name: 'Astian Notes', url: 'https://notes.astian.org' },
        { id: 'calendar', name: 'Calendar', url: 'https://calendar.astian.org' },
        { id: 'vpn', name: 'Astian VPN', url: 'https://vpn.astian.org' },
        { id: 'browser', name: 'Midori Browser', url: 'https://astian.org/midori-browser' },
        { id: 'search', name: 'AstianGO', url: 'https://astiango.com' },
        { id: 'mail', name: 'Astian Mail', url: 'https://mail.astian.org' },
        { id: 'wallet', name: 'Midori Wallet', url: 'https://midoriwallet.com' },
        { id: 'ads', name: 'Astian Ads', url: 'https://ads.astian.org' },
        { id: 'sync', name: 'Midori Sync', url: 'https://sync.astian.org' },
      ],
    };
  },
};
</script>

<style scoped>
.apps-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: flex-start; justify-content: flex-end; padding: 72px var(--space-lg) var(--space-lg); background: var(--control-overlay); }
.apps-panel { display: flex; flex-direction: column; width: 360px; max-width: 100%; max-height: calc(100dvh - 96px); overflow: hidden; background: var(--surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-panel); box-shadow: var(--control-shadow); outline: none; }
.apps-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-md) var(--space-lg); background: var(--ecosystem-mint); border-bottom: 1px solid var(--color-border); }
.apps-brand { display: block; width: 103px; height: auto; }
.apps-brand-light { display: none; width: 103px; height: 27px; background: var(--color-text); mask-size: contain; mask-position: center; mask-repeat: no-repeat; }
.apps-close { display: grid; width: 36px; height: 36px; place-items: center; background: var(--color-transparent); border: 0; border-radius: var(--radius-pill); color: var(--color-text-secondary); cursor: pointer; transition: background-color var(--transition-fast), transform var(--transition-fast); }
.apps-close:hover { background: var(--surface-raised); color: var(--color-text); }
.apps-close:active { transform: scale(.95); }
.apps-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-xs); padding: var(--space-sm); overflow-y: auto; overscroll-behavior: contain; }
.app-item { display: flex; align-items: center; gap: var(--space-md); min-height: 48px; padding: var(--space-sm) var(--space-md); color: var(--color-text); text-decoration: none; border-radius: var(--radius-control); transition: background-color var(--transition-fast); }
.app-item:hover { background: var(--color-primary-subtle); }
.app-item:active { background: var(--surface-sunken); }
.app-item__icon { display: grid; flex-shrink: 0; width: 32px; height: 32px; place-items: center; color: var(--color-primary); background: var(--ecosystem-soft); border-radius: var(--radius-control); }
.app-item__icon svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.app-item__name { font-size: var(--text-sm); font-weight: 400; white-space: nowrap; }
.apps-footer { padding: var(--space-md) var(--space-lg); border-top: 1px solid var(--color-border); }
.apps-footer__link { display: flex; align-items: center; justify-content: space-between; gap: var(--space-sm); min-height: 32px; color: var(--color-primary); font-size: var(--text-sm); text-decoration: none; white-space: nowrap; }
.apps-footer__link:hover { text-decoration: underline; text-underline-offset: 4px; }
.apps-fade-enter-active { transition: opacity var(--dur-short) var(--ease-out); }
.apps-fade-leave-active { transition: opacity var(--dur-exit) var(--ease-in); }
.apps-fade-enter-active .apps-panel { transition: opacity var(--dur-short) var(--ease-out), transform var(--dur-short) var(--ease-out); }
.apps-fade-leave-active .apps-panel { transition: opacity var(--dur-exit) var(--ease-in), transform var(--dur-exit) var(--ease-in); }
.apps-fade-enter-from, .apps-fade-leave-to { opacity: 0; }
.apps-fade-enter-from .apps-panel, .apps-fade-leave-to .apps-panel { transform: translateY(-6px); }
:root[data-theme='dark'] .apps-brand { display: none; }
:root[data-theme='dark'] .apps-brand-light { display: block; }
@media (max-width: 520px) { .apps-overlay { padding: 72px var(--space-sm) var(--space-sm); } .apps-panel { max-height: calc(100dvh - 80px); } }
@media (prefers-reduced-motion: reduce) { .apps-fade-enter-from .apps-panel, .apps-fade-leave-to .apps-panel { transform: none; } }
</style>
