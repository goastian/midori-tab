import { defineStore } from 'pinia';
import { reconcileHydration, snapshotHydration } from '../bootstrap/reconcileHydration.js';
import { getJson, setJsonDebounced } from '../services/StorageService.js';
import useTabStore from './useTabStore.js';

const DEFAULT_SPACES = [
  {
    id: 'personal',
    name: 'Personal',
    icon: '🏠',
    color: '#00b894',
    background: { type: 'Unsplash', default: true, class: 'bg-orange' },
  },
  {
    id: 'work',
    name: 'Trabajo',
    icon: '💼',
    color: '#0984e3',
    background: { type: 'Gradient', default: true, class: 'bg-deal' },
  },
  {
    id: 'study',
    name: 'Estudio',
    icon: '📚',
    color: '#6c5ce7',
    background: { type: 'Gradient', default: true, class: 'bg-purple' },
  },
];
const SPACES_ASYNC_STATE_KEY = 'midori_spaces_async_state_v1';
const hydrations = new WeakMap();
const initialized = new WeakSet();

function sanitizeSpaces(spaces) {
  if (!Array.isArray(spaces)) return DEFAULT_SPACES.map(s => ({ ...s }));
  return spaces.map(space => {
    if (!space?.background) return { ...space };
    const bg = { ...space.background };
    // Strip ephemeral blob: URLs — they become invalid between sessions.
    for (const key of Object.keys(bg)) {
      if (typeof bg[key] === 'string' && bg[key].startsWith('blob:')) {
        delete bg[key];
      }
    }
    return { ...space, background: bg };
  });
}

function readLegacySpacesState() {
  try {
    const raw = JSON.parse(localStorage.getItem('spacesStore') || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

const createSpacesStore = defineStore('spacesStore', {
  state: () => ({
    spaces: DEFAULT_SPACES.map(s => ({ ...s })),
    activeSpaceId: 'personal',
    enabled: false,
    hydrated: false,
  }),

  getters: {
    activeSpace(state) {
      return state.spaces.find(s => s.id === state.activeSpaceId) || state.spaces[0];
    },
  },

  actions: {
    switchSpace(spaceId) {
      const space = this.spaces.find(s => s.id === spaceId);
      if (!space) return;

      this.saveCurrentToSpace(this.activeSpaceId);
      this.activeSpaceId = spaceId;
      this.applySpace(space);
      this.persistAsyncState();
    },

    saveCurrentToSpace(spaceId) {
      const space = this.spaces.find(s => s.id === spaceId);
      if (!space) return;

      const tabStore = useTabStore();

      space.background = { ...tabStore.background };
    },

    applySpace(space) {
      const tabStore = useTabStore();

      if (space.background) {
        tabStore.changeBackground({ ...space.background });
      }
    },

    setActiveSpaceBackground(background) {
      const activeSpace = this.spaces.find(space => space.id === this.activeSpaceId);
      if (!activeSpace) return;

      activeSpace.background = { ...background };
      this.applySpace(activeSpace);
      this.persistAsyncState();
    },

    addSpace(name, icon, color) {
      const id = `space-${Date.now()}`;
      this.spaces.push({
        id,
        name,
        icon: icon || '🌐',
        color: color || '#00b894',
        background: { type: 'Unsplash', default: true, class: 'bg-orange' },
      });
      this.persistAsyncState();
      return id;
    },

    removeSpace(spaceId) {
      if (this.spaces.length <= 1) return;
      if (spaceId === this.activeSpaceId) {
        const remaining = this.spaces.filter(s => s.id !== spaceId);
        this.activeSpaceId = remaining[0].id;
        this.applySpace(this.spaces.find(s => s.id === this.activeSpaceId));
      }
      this.spaces = this.spaces.filter(s => s.id !== spaceId);
      this.persistAsyncState();
    },

    updateSpace(spaceId, updates) {
      const space = this.spaces.find(s => s.id === spaceId);
      if (space) {
        Object.assign(space, updates);
        this.persistAsyncState();
      }
    },

    resetSpaces() {
      this.spaces = DEFAULT_SPACES.map(s => ({ ...s }));
      this.activeSpaceId = 'personal';
      this.enabled = false;
      this.hydrated = true;
      this.persistAsyncState();
    },

    hydrateAsyncState() {
      if (hydrations.has(this)) return hydrations.get(this);
      const pending = (async () => {
        const initialSpaces = snapshotHydration(this.spaces);
        const legacy = readLegacySpacesState();
        const asyncState = await getJson(SPACES_ASYNC_STATE_KEY, null);
        if (this.hydrated) return;
        const spaces = sanitizeSpaces(asyncState?.spaces || legacy.spaces || this.spaces);
        this.spaces = reconcileHydration(initialSpaces, this.spaces, spaces.length ? spaces : DEFAULT_SPACES.map(s => ({ ...s })));
        if (!this.spaces.some(space => space.id === this.activeSpaceId)) this.activeSpaceId = this.spaces[0]?.id || 'personal';
        if (this.enabled) this.applySpace(this.activeSpace);
        this.hydrated = true;
        this.$persist();
        this.persistAsyncState();
      })();
      hydrations.set(this, pending);
      return pending;
    },

    persistAsyncState() {
      setJsonDebounced(SPACES_ASYNC_STATE_KEY, {
        spaces: sanitizeSpaces(this.spaces),
      }, { delayMs: 800, maxBytes: 250_000 });
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    pick: ['activeSpaceId', 'enabled'],
  },
});

function useSpacesStore(...args) {
  const store = createSpacesStore(...args);
  if (!initialized.has(store)) {
    initialized.add(store);
    store.hydrated = false;
    let enabled = store.enabled;
    store.$subscribe((_mutation, state) => {
      if (state.enabled !== enabled) {
        enabled = state.enabled;
        window.dispatchEvent(new CustomEvent('midori:spaces-enabled', { detail: { enabled } }));
      }
      if (state.hydrated) store.persistAsyncState();
    }, { detached: true, flush: 'sync' });
    void store.hydrateAsyncState().catch(error => console.error('[Midori] Could not restore spaces', error));
  }
  return store;
}
Object.assign(useSpacesStore, createSpacesStore);

export default useSpacesStore;
