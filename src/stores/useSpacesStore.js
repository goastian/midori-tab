import { defineStore } from 'pinia';
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

const useSpacesStore = defineStore('spacesStore', {
  state: () => ({
    spaces: DEFAULT_SPACES.map(s => ({ ...s })),
    activeSpaceId: 'personal',
    enabled: false,
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
    },

    updateSpace(spaceId, updates) {
      const space = this.spaces.find(s => s.id === spaceId);
      if (space) {
        Object.assign(space, updates);
      }
    },

    resetSpaces() {
      this.spaces = DEFAULT_SPACES.map(s => ({ ...s }));
      this.activeSpaceId = 'personal';
      this.enabled = false;
    },
  },

  persist: {
    enable: true,
    storage: localStorage,
    paths: ['spaces', 'activeSpaceId', 'enabled'],
    serializer: {
      serialize(state) {
        const cleaned = {
          ...state,
          spaces: Array.isArray(state.spaces)
            ? state.spaces.map(space => {
                if (!space?.background) return space;
                const bg = { ...space.background };
                // Strip ephemeral blob: URLs — they become invalid between sessions
                for (const key of Object.keys(bg)) {
                  if (typeof bg[key] === 'string' && bg[key].startsWith('blob:')) {
                    delete bg[key];
                  }
                }
                return { ...space, background: bg };
              })
            : state.spaces,
        };
        return JSON.stringify(cleaned);
      },
      deserialize: JSON.parse,
    },
  },
});

export default useSpacesStore;
