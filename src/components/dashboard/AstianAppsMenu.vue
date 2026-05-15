<template>
  <Teleport to="body">
    <Transition name="apps-fade">
      <div v-if="visible" class="apps-overlay" @click="$emit('close')" role="dialog" aria-modal="true" aria-label="Astian Apps">
        <div class="apps-panel" @click.stop>
          <div class="apps-header">
            <div class="apps-header__logo">
              <svg width="20" height="20" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="16" cy="16" r="16" fill="var(--color-primary, #04A469)"/>
                <path d="M10 22 L16 10 L22 22 M12.5 18 H19.5" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
              </svg>
              <span class="apps-header__title">Astian</span>
            </div>
            <button class="apps-close" type="button" @click="$emit('close')" aria-label="Close apps menu">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>

          <div class="apps-grid">
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
                <svg v-else-if="app.id === 'ads'" viewBox="0 0 24 24" aria-hidden="true">
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
          </div>

          <div class="apps-footer">
            <a href="https://astian.org" target="_blank" rel="noopener noreferrer" class="apps-footer__link" @click="$emit('close')">
              More Astian services →
            </a>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
export default {
  name: 'AstianAppsMenu',
  props: {
    visible: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['close'],
  data() {
    return {
      astianApps: [
        { id: 'cloud', name: 'Astian Cloud', url: 'https://cloud2.astian.org' },
        { id: 'notes', name: 'Astian Notes', url: 'https://notes.astian.org' },
        { id: 'calendar', name: 'Calendar', url: 'https://calendar.astian.org' },
        { id: 'vpn', name: 'Astian VPN', url: 'https://vpn.astian.org' },
        { id: 'browser', name: 'Midori Browser', url: 'https://astian.org/midori-browser' },
        { id: 'search', name: 'AstianGO', url: 'https://astiango.com' },
        { id: 'mail', name: 'Astian Mail', url: 'https://mail.astian.org' },
        { id: 'ads', name: 'Astian Ads', url: 'https://ads.astian.org' },
        { id: 'sync', name: 'Midori Sync', url: 'https://sync.astian.org' },
      ],
    };
  },
};
</script>

<style scoped>
.apps-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.2);
  z-index: 8500;
  display: flex;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 3.5rem 1rem 1rem;
}

.apps-panel {
  width: 320px;
  max-width: calc(100vw - 2rem);
  background: var(--surface-overlay, #ffffff);
  border: 1px solid var(--color-border, rgba(0,0,0,0.08));
  border-radius: var(--radius-lg, 16px);
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.apps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--color-border, rgba(0,0,0,0.08));
  background: var(--surface-raised, rgba(248, 250, 252, 0.95));
}

.apps-header__logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.apps-header__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text, #1a2b26);
  letter-spacing: -0.01em;
}

.apps-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-sunken, rgba(0,0,0,0.05));
  border: 1px solid var(--color-border, rgba(0,0,0,0.08));
  border-radius: var(--radius-sm, 6px);
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  transition: all 0.12s ease;
}

.apps-close:hover {
  background: var(--color-primary-subtle, #e6fbf4);
  color: var(--color-primary, #04A469);
  border-color: var(--color-primary, #04A469);
}


.apps-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
  padding: 1.1rem 0.9rem 0.7rem 0.9rem;
}


.app-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0.7rem 0.2rem 0.3rem 0.2rem;
  border-radius: 12px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.12s ease;
  min-width: 72px;
}

.app-item:hover {
  background: var(--color-primary-subtle, rgba(4, 164, 105, 0.08));
}

.app-item__icon--minimal {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: none !important;
  color: var(--color-text, #1a2b26);
  opacity: 1;
  transition: color 0.15s;
}
.app-item:hover .app-item__icon--minimal {
  color: var(--color-primary, #04A469);
}

.app-item__icon--minimal svg {
  width: 28px;
  height: 28px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.app-item__name {
  margin-top: 0.32rem;
  font-size: 0.82rem;
  font-weight: 500;
  color: var(--color-text, #1a2b26);
  text-align: center;
  line-height: 1.2;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.92;
}

.apps-footer {
  padding: 0.65rem 1rem;
  border-top: 1px solid var(--color-border, rgba(0,0,0,0.08));
  background: var(--surface-raised, rgba(248, 250, 252, 0.95));
  text-align: center;
}

.apps-footer__link {
  font-size: 0.78rem;
  color: var(--color-primary, #04A469);
  text-decoration: none;
  font-weight: 500;
}

.apps-footer__link:hover {
  text-decoration: underline;
}

/* Transitions */
.apps-fade-enter-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.apps-fade-leave-active {
  transition: opacity 0.12s ease, transform 0.1s ease;
}
.apps-fade-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.97);
}
.apps-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
