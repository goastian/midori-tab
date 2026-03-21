import { ref, computed } from 'vue';
import useCommandsStore from '../stores/useCommandsStore';

// Estado compartido (FUERA de la función para que sea singleton)
const searchQuery = ref('');
const isCommandPaletteOpen = ref(false);
const selectedIndex = ref(0);
const searchResults = ref([]);
const isSearching = ref(false);

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const CACHE_TTL_MS = 30_000;
const REMOTE_MIN_QUERY_LEN = 3;
const historyCache = new Map();
const bookmarksCache = new Map();
const inFlightHistory = new Map();
const inFlightBookmarks = new Map();

// Helper para abrir URLs sin popups de permiso
const openUrl = (url, options = {}) => {
  const { newTab = true, active = true } = options;
  
  // Usar API de extensiones (funciona en Chrome y Firefox sin popups)
  if (browserAPI?.tabs) {
    if (newTab) {
      // Abrir en nueva pestaña
      browserAPI.tabs.create({ url, active });
    } else {
      // Actualizar pestaña actual
      browserAPI.tabs.update({ url });
    }
  } else {
    // Fallback para contextos sin API de extensiones (dev, test)
    window.open(url, newTab ? '_blank' : '_self');
  }
};

// Comandos predefinidos
const predefinedCommands = [
  // Productividad
  {
    id: 'notion',
    name: 'Notion',
    description: 'Abrir Notion',
    keywords: ['notion', 'notas', 'workspace'],
    icon: '📝',
    action: () => openUrl('https://notion.so'),
    category: 'productivity',
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Abrir Asana',
    keywords: ['asana', 'tareas', 'proyectos'],
    icon: '✅',
    action: () => openUrl('https://app.asana.com'),
    category: 'productivity',
  },
  {
    id: 'trello',
    name: 'Trello',
    description: 'Abrir Trello',
    keywords: ['trello', 'kanban', 'tablero'],
    icon: '📋',
    action: () => openUrl('https://trello.com'),
    category: 'productivity',
  },
  {
    id: 'todoist',
    name: 'Todoist',
    description: 'Abrir Todoist',
    keywords: ['todoist', 'tareas', 'to-do'],
    icon: '✔️',
    action: () => openUrl('https://todoist.com'),
    category: 'productivity',
  },
  {
    id: 'clickup',
    name: 'ClickUp',
    description: 'Abrir ClickUp',
    keywords: ['clickup', 'gestión', 'proyectos'],
    icon: '🎯',
    action: () => openUrl('https://app.clickup.com'),
    category: 'productivity',
  },
  
  // Comunicación
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Abrir Gmail',
    keywords: ['gmail', 'email', 'correo'],
    icon: '📧',
    action: () => openUrl('https://mail.google.com'),
    category: 'communication',
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Abrir Slack',
    keywords: ['slack', 'chat', 'equipo'],
    icon: '💬',
    action: () => openUrl('https://slack.com'),
    category: 'communication',
  },
  {
    id: 'discord',
    name: 'Discord',
    description: 'Abrir Discord',
    keywords: ['discord', 'chat', 'comunidad'],
    icon: '🎮',
    action: () => openUrl('https://discord.com/app'),
    category: 'communication',
  },
  {
    id: 'teams',
    name: 'Microsoft Teams',
    description: 'Abrir Microsoft Teams',
    keywords: ['teams', 'microsoft', 'reuniones'],
    icon: '👥',
    action: () => openUrl('https://teams.microsoft.com'),
    category: 'communication',
  },
  {
    id: 'zoom',
    name: 'Zoom',
    description: 'Abrir Zoom',
    keywords: ['zoom', 'videollamada', 'reunión'],
    icon: '📹',
    action: () => openUrl('https://zoom.us'),
    category: 'communication',
  },
  
  // Desarrollo
  {
    id: 'github',
    name: 'GitHub',
    description: 'Abrir GitHub',
    keywords: ['github', 'git', 'código', 'repositorio'],
    icon: '🐙',
    action: () => openUrl('https://github.com'),
    category: 'development',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Abrir GitLab',
    keywords: ['gitlab', 'git', 'devops'],
    icon: '🦊',
    action: () => openUrl('https://gitlab.com'),
    category: 'development',
  },
  {
    id: 'stackoverflow',
    name: 'Stack Overflow',
    description: 'Abrir Stack Overflow',
    keywords: ['stackoverflow', 'programación', 'ayuda'],
    icon: '📚',
    action: () => openUrl('https://stackoverflow.com'),
    category: 'development',
  },
  {
    id: 'codepen',
    name: 'CodePen',
    description: 'Abrir CodePen',
    keywords: ['codepen', 'código', 'playground'],
    icon: '🖊️',
    action: () => openUrl('https://codepen.io'),
    category: 'development',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Abrir Vercel',
    keywords: ['vercel', 'deploy', 'hosting'],
    icon: '▲',
    action: () => openUrl('https://vercel.com'),
    category: 'development',
  },
  
  // Diseño
  {
    id: 'figma',
    name: 'Figma',
    description: 'Abrir Figma',
    keywords: ['figma', 'diseño', 'ui', 'ux'],
    icon: '🎨',
    action: () => openUrl('https://figma.com'),
    category: 'design',
  },
  {
    id: 'canva',
    name: 'Canva',
    description: 'Abrir Canva',
    keywords: ['canva', 'diseño', 'gráfico'],
    icon: '🖼️',
    action: () => openUrl('https://canva.com'),
    category: 'design',
  },
  {
    id: 'dribbble',
    name: 'Dribbble',
    description: 'Abrir Dribbble',
    keywords: ['dribbble', 'diseño', 'inspiración'],
    icon: '🏀',
    action: () => openUrl('https://dribbble.com'),
    category: 'design',
  },
  
  // Redes Sociales
  {
    id: 'twitter',
    name: 'Twitter / X',
    description: 'Abrir Twitter',
    keywords: ['twitter', 'x', 'social'],
    icon: '🐦',
    action: () => openUrl('https://twitter.com'),
    category: 'social',
  },
  {
    id: 'linkedin',
    name: 'LinkedIn',
    description: 'Abrir LinkedIn',
    keywords: ['linkedin', 'profesional', 'red'],
    icon: '💼',
    action: () => openUrl('https://linkedin.com'),
    category: 'social',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Abrir YouTube',
    keywords: ['youtube', 'video', 'música'],
    icon: '📺',
    action: () => openUrl('https://youtube.com'),
    category: 'social',
  },
  
  // Utilidades
  {
    id: 'drive',
    name: 'Google Drive',
    description: 'Abrir Google Drive',
    keywords: ['drive', 'google', 'archivos', 'nube'],
    icon: '📁',
    action: () => openUrl('https://drive.google.com'),
    category: 'utilities',
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Abrir Dropbox',
    keywords: ['dropbox', 'archivos', 'nube'],
    icon: '📦',
    action: () => openUrl('https://dropbox.com'),
    category: 'utilities',
  },
  {
    id: 'calendar',
    name: 'Google Calendar',
    description: 'Abrir Google Calendar',
    keywords: ['calendar', 'calendario', 'eventos'],
    icon: '📅',
    action: () => openUrl('https://calendar.google.com'),
    category: 'utilities',
  },
  {
    id: 'translate',
    name: 'Google Translate',
    description: 'Abrir Google Translate',
    keywords: ['translate', 'traducir', 'idiomas'],
    icon: '🌐',
    action: () => openUrl('https://translate.google.com'),
    category: 'utilities',
  },
];

export function useCommands() {
  // Estado ya definido arriba como singleton compartido

  // Buscar en historial del navegador
  const searchHistory = async (query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const cached = getCachedOrPrefixFiltered(historyCache, q);
    if (q.length < REMOTE_MIN_QUERY_LEN) return cached;
    const exact = historyCache.get(q);
    if (isFresh(exact)) return exact.data;

    try {
      const existing = inFlightHistory.get(q);
      const p = existing || browserAPI.history.search({
        text: q,
        maxResults: 10,
        startTime: 0,
      });
      if (!existing) inFlightHistory.set(q, p);
      const results = await p;
      
      const commandsStore = useCommandsStore();
      const openInNewTab = commandsStore.settings.openInNewTab;
      
      const mapped = results.map(item => ({
        id: `history-${item.id}`,
        name: item.title || item.url,
        description: item.url,
        icon: '🕐',
        action: () => {
          openUrl(item.url, { newTab: openInNewTab });
        },
        category: 'history',
        type: 'history',
        url: item.url,
        lastVisitTime: item.lastVisitTime,
      }));
      historyCache.set(q, { ts: Date.now(), data: mapped });
      return mapped;
    } catch (error) {
      return cached;
    } finally {
      inFlightHistory.delete(q);
    }
  };

  // Buscar en marcadores
  const searchBookmarks = async (query) => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    const cached = getCachedOrPrefixFiltered(bookmarksCache, q);
    if (q.length < REMOTE_MIN_QUERY_LEN) return cached;
    const exact = bookmarksCache.get(q);
    if (isFresh(exact)) return exact.data;

    try {
      const existing = inFlightBookmarks.get(q);
      const p = existing || browserAPI.bookmarks.search(q);
      if (!existing) inFlightBookmarks.set(q, p);
      const bookmarks = await p;
      
      const commandsStore = useCommandsStore();
      const openInNewTab = commandsStore.settings.openInNewTab;
      
      const mapped = bookmarks
        .filter(bookmark => bookmark.url)
        .map(bookmark => ({
          id: `bookmark-${bookmark.id}`,
          name: bookmark.title,
          description: bookmark.url,
          icon: '⭐',
          action: () => {
            openUrl(bookmark.url, { newTab: openInNewTab });
          },
          category: 'bookmarks',
          type: 'bookmark',
          url: bookmark.url,
        }));
      bookmarksCache.set(q, { ts: Date.now(), data: mapped });
      return mapped;
    } catch (error) {
      return cached;
    } finally {
      inFlightBookmarks.delete(q);
    }
  };

  // Buscar en pestañas abiertas
  const searchTabs = async (query) => {
    try {
      const tabs = await browserAPI.tabs.query({});
      const lowerQuery = query.toLowerCase();
      
      const filteredTabs = tabs.filter(tab => 
        tab.title?.toLowerCase().includes(lowerQuery) || 
        tab.url?.toLowerCase().includes(lowerQuery)
      );
      
      return filteredTabs.map(tab => ({
        id: `tab-${tab.id}`,
        name: tab.title,
        description: tab.url,
        icon: '🗂️',
        action: () => {
          browserAPI.tabs.update(tab.id, { active: true });
        },
        category: 'tabs',
        type: 'tab',
        url: tab.url,
        tabId: tab.id,
      }));
    } catch (error) {
      return [];
    }
  };

  // Buscar comandos predefinidos
  const searchCommands = (query) => {
    const lowerQuery = query.toLowerCase();
    
    return predefinedCommands.filter(cmd => 
      cmd.name.toLowerCase().includes(lowerQuery) ||
      cmd.description.toLowerCase().includes(lowerQuery) ||
      cmd.keywords.some(keyword => keyword.includes(lowerQuery))
    );
  };

  // Buscar comandos personalizados
  const searchCustomCommands = (query) => {
    const commandsStore = useCommandsStore();
    const lowerQuery = query.toLowerCase();
    const openInNewTab = commandsStore.settings.openInNewTab;
    
    return commandsStore.customCommands
      .filter(cmd => 
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.url.toLowerCase().includes(lowerQuery) ||
        (cmd.description && cmd.description.toLowerCase().includes(lowerQuery)) ||
        (cmd.keywords && cmd.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery)))
      )
      .map(cmd => ({
        ...cmd,
        action: () => {
          openUrl(cmd.url, { newTab: openInNewTab });
        },
      }));
  };

  // Búsqueda combinada
  const performSearch = async (query) => {
    if (!query || query.trim() === '') {
      searchResults.value = [];
      return;
    }

    isSearching.value = true;
    selectedIndex.value = 0;

    try {
      const [commands, customCommands, history, bookmarks, tabs] = await Promise.all([
        Promise.resolve(searchCommands(query)),
        Promise.resolve(searchCustomCommands(query)),
        searchHistory(query),
        searchBookmarks(query),
        searchTabs(query),
      ]);

      // Combinar y ordenar resultados
      const allResults = [
        ...commands.map(cmd => ({ ...cmd, score: 100 })),
        ...customCommands.map(cmd => ({ ...cmd, score: 95 })), // Alta prioridad para comandos personalizados
        ...bookmarks.map(bm => ({ ...bm, score: 80 })),
        ...tabs.map(tab => ({ ...tab, score: 70 })),
        ...history.map(hist => ({ ...hist, score: 50 })),
      ];

      // Ordenar por score y relevancia
      searchResults.value = allResults
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);

    } catch (error) {
      searchResults.value = [];
    } finally {
      isSearching.value = false;
    }
  };

  // Ejecutar comando seleccionado
  const executeCommand = (command) => {
    if (command) {
      // Si tiene action, ejecutarla
      if (command.action) {
        command.action();
      } 
      // Si es un comando personalizado sin action pero con URL
      else if (command.url && command.custom) {
        const commandsStore = useCommandsStore();
        const openInNewTab = commandsStore.settings.openInNewTab;
        openUrl(command.url, { newTab: openInNewTab });
      }
      closeCommandPalette();
    }
  };

  // Abrir/cerrar paleta de comandos
  const openCommandPalette = () => {
    isCommandPaletteOpen.value = true;
    searchQuery.value = '';
    searchResults.value = [];
    selectedIndex.value = 0;
  };

  const closeCommandPalette = () => {
    isCommandPaletteOpen.value = false;
    searchQuery.value = '';
    searchResults.value = [];
    selectedIndex.value = 0;
  };

  const toggleCommandPalette = () => {
    if (isCommandPaletteOpen.value) {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
  };

  // Navegación con teclado
  const selectNext = () => {
    if (selectedIndex.value < searchResults.value.length - 1) {
      selectedIndex.value++;
    }
  };

  const selectPrevious = () => {
    if (selectedIndex.value > 0) {
      selectedIndex.value--;
    }
  };

  const executeSelected = () => {
    const selected = searchResults.value[selectedIndex.value];
    if (selected) {
      executeCommand(selected);
    }
  };

  // Categorías disponibles
  const categories = computed(() => {
    const cats = new Set(predefinedCommands.map(cmd => cmd.category));
    return Array.from(cats);
  });

  return {
    // State
    searchQuery,
    isCommandPaletteOpen,
    selectedIndex,
    searchResults,
    isSearching,
    predefinedCommands,
    categories,

    // Methods
    performSearch,
    executeCommand,
    openCommandPalette,
    closeCommandPalette,
    toggleCommandPalette,
    selectNext,
    selectPrevious,
    executeSelected,
    searchHistory,
    searchBookmarks,
    searchTabs,
    searchCommands,
    searchCustomCommands,
  };
}

function isFresh(entry) {
  return !!entry && (Date.now() - entry.ts) < CACHE_TTL_MS;
}

function getCachedOrPrefixFiltered(cache, q) {
  const exact = cache.get(q);
  if (isFresh(exact)) return exact.data;
  for (let i = q.length - 1; i >= 1; i--) {
    const prefix = q.slice(0, i);
    const entry = cache.get(prefix);
    if (!isFresh(entry)) continue;
    return entry.data.filter((it) => {
      const name = String(it.name || '').toLowerCase();
      const desc = String(it.description || it.url || '').toLowerCase();
      return name.includes(q) || desc.includes(q);
    });
  }
  return [];
}
