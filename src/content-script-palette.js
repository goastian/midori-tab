// Content Script Palette — Carga bajo demanda desde content-script.js
// Contiene toda la lógica de UI, búsqueda y renderizado de la paleta de comandos

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

function normalizeLocale(code) {
  if (!code) return '';
  return String(code).trim().toLowerCase().split('-')[0];
}

function getUiLocale() {
  try {
    if (browserAPI?.i18n?.getUILanguage) return normalizeLocale(browserAPI.i18n.getUILanguage());
    return normalizeLocale(navigator.language);
  } catch (e) {
    return 'en';
  }
}

const UI_MESSAGES = {
  en: {
    searchPlaceholder: 'Search commands, apps, history...',
    emptyTitle: 'Type to search commands, apps or history',
    emptyHint: 'ESC to close',
    error: 'Search error',
    noResults: 'No results found',
  },
  es: {
    searchPlaceholder: 'Buscar comandos, apps, historial...',
    emptyTitle: 'Escribe para buscar comandos, apps o historial',
    emptyHint: 'ESC para cerrar',
    error: 'Error al buscar',
    noResults: 'No se encontraron resultados',
  },
};

const uiLocale = getUiLocale();
const msg = UI_MESSAGES[uiLocale] || UI_MESSAGES.en;

let paletteInjected = false;
let paletteOpen = false;
let selectedIndex = 0;
let currentResults = [];
let searchTimeout = null;
let latestSearchId = 0;
let remoteRefreshTimeout = null;

const CACHE_TTL_MS = 30_000;
const REMOTE_REFRESH_DELAY_MS = 350;
const REMOTE_MIN_QUERY_LEN = 3;

const historyCache = new Map();
const bookmarksCache = new Map();
const inFlightHistory = new Map();
const inFlightBookmarks = new Map();

// Crear y montar la paleta de comandos
function createCommandPalette() {
  if (paletteInjected) return;
  
  // Crear contenedor
  const overlay = document.createElement('div');
  overlay.id = 'midori-command-palette-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.7);
    z-index: 999999999;
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  
  // Crear paleta
  const palette = document.createElement('div');
  palette.id = 'midori-command-palette';
  palette.style.cssText = `
    background: #0F1520;
    border: 1px solid rgba(126, 196, 168, 0.1);
    border-radius: 16px;
    width: 90%;
    max-width: 600px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    overflow: hidden;
    animation: midoriSlideDown 0.2s ease-out;
  `;
  
  // Input de búsqueda
  const searchInput = document.createElement('input');
  searchInput.id = 'midori-search-input';
  searchInput.type = 'text';
  searchInput.placeholder = msg.searchPlaceholder;
  searchInput.style.cssText = `
    width: 100%;
    padding: 20px 24px;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 18px;
    border-bottom: 1px solid rgba(0, 184, 148, 0.1);
    box-sizing: border-box;
    font-family: inherit;
  `;
  
  // Resultados
  const results = document.createElement('div');
  results.id = 'midori-results';
  results.style.cssText = `
    max-height: 400px;
    overflow-y: auto;
    padding: 12px;
  `;
  
  // Mensaje inicial
  const emptyState = document.createElement('div');
  emptyState.style.cssText = `
    text-align: center;
    padding: 40px 20px;
    color: rgba(255, 255, 255, 0.5);
  `;
  emptyState.innerHTML = `
    <div style="font-size: 48px; margin-bottom: 12px;">🔍</div>
    <div style="font-size: 14px;">${msg.emptyTitle}</div>
    <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">${msg.emptyHint}</div>
  `;
  results.appendChild(emptyState);
  
  // Ensamblar
  palette.appendChild(searchInput);
  palette.appendChild(results);
  overlay.appendChild(palette);
  
  // Agregar estilos
  const style = document.createElement('style');
  style.textContent = `
    @keyframes midoriSlideDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    #midori-results::-webkit-scrollbar {
      width: 8px;
    }
    
    #midori-results::-webkit-scrollbar-track {
      background: transparent;
    }
    
    #midori-results::-webkit-scrollbar-thumb {
      background: rgba(0, 184, 148, 0.2);
      border-radius: 4px;
    }
    
    #midori-results::-webkit-scrollbar-thumb:hover {
      background: rgba(0, 184, 148, 0.35);
    }
    
    .midori-command-item {
      padding: 12px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    
    .midori-command-item:hover,
    .midori-command-item.selected {
      background: rgba(0, 184, 148, 0.08);
    }
    
    .midori-command-item.selected {
      border-left: 2px solid rgba(0, 184, 148, 0.6);
    }
    
    .midori-command-icon {
      font-size: 24px;
      flex-shrink: 0;
    }
    
    .midori-command-content {
      flex: 1;
      min-width: 0;
    }
    
    .midori-command-name {
      color: #fff;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 2px;
    }
    
    .midori-command-description {
      color: rgba(255, 255, 255, 0.5);
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .midori-category-label {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
      margin-left: auto;
      flex-shrink: 0;
    }
    
    .category-productivity { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
    .category-communication { background: rgba(0, 184, 148, 0.15); color: #34d399; }
    .category-development { background: rgba(139, 92, 246, 0.15); color: #a78bfa; }
    .category-design { background: rgba(236, 72, 153, 0.15); color: #f472b6; }
    .category-social { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
    .category-utilities { background: rgba(156, 163, 175, 0.15); color: #9ca3af; }
    .category-history { background: rgba(234, 179, 8, 0.15); color: #facc15; }
    .category-bookmarks { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
  `;
  document.head.appendChild(style);
  
  // Event listeners
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeCommandPalette();
    }
  });
  
  searchInput.addEventListener('input', debouncedSearch);
  searchInput.addEventListener('keydown', handleKeyNavigation);
  results.addEventListener('click', (e) => {
    const item = e.target.closest('.midori-command-item');
    if (!item) return;
    const idx = Number(item.dataset.index);
    if (!Number.isFinite(idx)) return;
    const command = currentResults[idx];
    if (command) executeCommand(command);
  });
  
  document.body.appendChild(overlay);
  paletteInjected = true;
}

// Debounce de búsqueda (150ms)
function debouncedSearch(e) {
  clearTimeout(searchTimeout);
  clearTimeout(remoteRefreshTimeout);
  const query = e.target.value.trim();
  
  if (!query) {
    loadPredefinedCommands();
    return;
  }
  
  searchTimeout = setTimeout(async () => {
    const resultsContainer = document.getElementById('midori-results');
    try {
      const searchId = ++latestSearchId;
      const results = await searchAll(query, { allowRemote: false });
      if (searchId !== latestSearchId) return;
      currentResults = results;
      selectedIndex = 0;
      renderResults(results);
      remoteRefreshTimeout = setTimeout(async () => {
        if (searchId !== latestSearchId) return;
        const refreshed = await searchAll(query, { allowRemote: true });
        if (searchId !== latestSearchId) return;
        currentResults = refreshed;
        selectedIndex = 0;
        renderResults(refreshed);
      }, REMOTE_REFRESH_DELAY_MS);
    } catch (error) {
      resultsContainer.replaceChildren(createEmptyMessage(msg.error));
    }
  }, 150);
}

// Abrir paleta
function openCommandPalette() {
  if (!paletteInjected) {
    createCommandPalette();
  }
  
  const overlay = document.getElementById('midori-command-palette-overlay');
  const searchInput = document.getElementById('midori-search-input');
  
  if (overlay && searchInput) {
    overlay.style.display = 'flex';
    searchInput.value = '';
    searchInput.focus();
    paletteOpen = true;
    loadPredefinedCommands();
  }
}

// Cerrar paleta
function closeCommandPalette() {
  clearTimeout(searchTimeout);
  clearTimeout(remoteRefreshTimeout);
  const overlay = document.getElementById('midori-command-palette-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    paletteOpen = false;
  }
}

// Toggle paleta
export function toggleCommandPalette() {
  if (paletteOpen) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

// Buscar en todo
async function searchAll(query, options = {}) {
  const { allowRemote = true } = options;
  const results = [];
  const normalizedQuery = String(query || '').trim().toLowerCase();
  
  // Comandos predefinidos
  const commands = getPredefinedCommands();
  commands.forEach(cmd => {
    const searchText = `${cmd.name} ${cmd.description} ${cmd.keywords?.join(' ')}`.toLowerCase();
    if (searchText.includes(normalizedQuery)) {
      results.push(cmd);
    }
  });

  const cachedHistory = getCachedOrPrefixFiltered(historyCache, normalizedQuery);
  const cachedBookmarks = getCachedOrPrefixFiltered(bookmarksCache, normalizedQuery);
  results.push(...cachedHistory);
  results.push(...cachedBookmarks);

  if (!allowRemote || normalizedQuery.length < REMOTE_MIN_QUERY_LEN) {
    return results.slice(0, 10);
  }

  const [historyRemote, bookmarksRemote] = await Promise.all([
    fetchWithCache({
      messageType: 'SEARCH_HISTORY',
      query: normalizedQuery,
      cache: historyCache,
      inFlight: inFlightHistory,
    }),
    fetchWithCache({
      messageType: 'SEARCH_BOOKMARKS',
      query: normalizedQuery,
      cache: bookmarksCache,
      inFlight: inFlightBookmarks,
    }),
  ]);

  const merged = [];
  merged.push(...results.filter(r => r.category !== 'history' && r.category !== 'bookmarks'));
  merged.push(...historyRemote);
  merged.push(...bookmarksRemote);
  return merged.slice(0, 10);
}

// Renderizar resultados
function renderResults(results) {
  const resultsContainer = document.getElementById('midori-results');
  
  if (results.length === 0) {
    resultsContainer.replaceChildren(createEmptyMessage(msg.noResults));
    return;
  }

  const prevNodesById = new Map();
  resultsContainer.querySelectorAll('.midori-command-item').forEach((node) => {
    const id = node.dataset.id;
    if (id) prevNodesById.set(id, node);
  });

  const fragment = document.createDocumentFragment();
  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    const id = String(item.id || `${item.category || 'item'}-${i}`);
    let node = prevNodesById.get(id);
    if (!node) {
      node = createResultNode();
    }
    updateResultNode(node, item, i, id);
    fragment.appendChild(node);
  }
  resultsContainer.replaceChildren(fragment);
  updateSelection(true);
}

// Navegación con teclado
function handleKeyNavigation(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCommandPalette();
    return;
  }
  
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, currentResults.length - 1);
    updateSelection(true);
  }
  
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection(true);
  }
  
  if (e.key === 'Enter') {
    e.preventDefault();
    if (currentResults[selectedIndex]) {
      executeCommand(currentResults[selectedIndex]);
    }
  }
}

function updateSelection(forceScroll = false) {
  const resultsContainer = document.getElementById('midori-results');
  if (!resultsContainer) return;
  const nodes = resultsContainer.querySelectorAll('.midori-command-item');
  nodes.forEach((el, index) => {
    if (index === selectedIndex) {
      el.classList.add('selected');
      if (forceScroll) el.scrollIntoView({ block: 'nearest' });
    } else {
      el.classList.remove('selected');
    }
  });
}

// Ejecutar comando
function executeCommand(command) {
  if (command.url) {
    browserAPI.runtime.sendMessage({
      type: 'OPEN_URL',
      url: command.url,
      newTab: true
    });
  } else if (command.action) {
    command.action();
  }
  
  closeCommandPalette();
}

// Comandos predefinidos
function getPredefinedCommands() {
  return [
    { id: 'notion', name: 'Notion', description: 'Abrir Notion', icon: '📝', url: 'https://notion.so', category: 'productivity', keywords: ['notion', 'notas', 'workspace'] },
    { id: 'github', name: 'GitHub', description: 'Abrir GitHub', icon: '🐙', url: 'https://github.com', category: 'development', keywords: ['github', 'git', 'código'] },
    { id: 'gmail', name: 'Gmail', description: 'Abrir Gmail', icon: '📧', url: 'https://mail.google.com', category: 'communication', keywords: ['gmail', 'email', 'correo'] },
    { id: 'youtube', name: 'YouTube', description: 'Abrir YouTube', icon: '📺', url: 'https://youtube.com', category: 'social', keywords: ['youtube', 'video', 'música'] },
    { id: 'figma', name: 'Figma', description: 'Abrir Figma', icon: '🎨', url: 'https://figma.com', category: 'design', keywords: ['figma', 'diseño', 'ui'] },
    { id: 'slack', name: 'Slack', description: 'Abrir Slack', icon: '💬', url: 'https://slack.com', category: 'communication', keywords: ['slack', 'chat', 'equipo'] },
    { id: 'trello', name: 'Trello', description: 'Abrir Trello', icon: '📋', url: 'https://trello.com', category: 'productivity', keywords: ['trello', 'kanban', 'tablero'] },
    { id: 'drive', name: 'Google Drive', description: 'Abrir Google Drive', icon: '📁', url: 'https://drive.google.com', category: 'utilities', keywords: ['drive', 'google', 'archivos'] },
  ];
}

function loadPredefinedCommands() {
  currentResults = getPredefinedCommands();
  renderResults(currentResults);
}

function createEmptyMessage(text) {
  const el = document.createElement('div');
  el.style.cssText = 'color: rgba(255,255,255,0.5); padding: 20px; text-align: center;';
  el.textContent = text;
  return el;
}

function createResultNode() {
  const root = document.createElement('div');
  root.className = 'midori-command-item';

  const icon = document.createElement('span');
  icon.className = 'midori-command-icon';
  root.appendChild(icon);

  const content = document.createElement('div');
  content.className = 'midori-command-content';

  const name = document.createElement('div');
  name.className = 'midori-command-name';
  content.appendChild(name);

  const desc = document.createElement('div');
  desc.className = 'midori-command-description';
  content.appendChild(desc);

  root.appendChild(content);

  const category = document.createElement('span');
  category.className = 'midori-category-label';
  root.appendChild(category);

  return root;
}

function updateResultNode(node, item, index, id) {
  node.dataset.index = String(index);
  node.dataset.id = id;
  if (index === selectedIndex) node.classList.add('selected');
  else node.classList.remove('selected');

  const iconEl = node.querySelector('.midori-command-icon');
  const nameEl = node.querySelector('.midori-command-name');
  const descEl = node.querySelector('.midori-command-description');
  const catEl = node.querySelector('.midori-category-label');

  if (iconEl) iconEl.textContent = item.icon || '🔗';
  if (nameEl) nameEl.textContent = item.name || '';
  if (descEl) descEl.textContent = item.description || item.url || '';

  const category = item.category || '';
  if (catEl) {
    catEl.textContent = category;
    catEl.className = `midori-category-label category-${category}`;
  }
}

function getCachedOrPrefixFiltered(cache, normalizedQuery) {
  if (!normalizedQuery) return [];
  const exact = cache.get(normalizedQuery);
  if (isFresh(exact)) return exact.data;
  for (let i = normalizedQuery.length - 1; i >= 1; i--) {
    const prefix = normalizedQuery.slice(0, i);
    const entry = cache.get(prefix);
    if (!isFresh(entry)) continue;
    return filterByQuery(entry.data, normalizedQuery);
  }
  return [];
}

function isFresh(entry) {
  return !!entry && (Date.now() - entry.ts) < CACHE_TTL_MS;
}

function filterByQuery(items, normalizedQuery) {
  return (items || []).filter((it) => {
    const name = String(it.name || '').toLowerCase();
    const desc = String(it.description || it.url || '').toLowerCase();
    return name.includes(normalizedQuery) || desc.includes(normalizedQuery);
  });
}

async function fetchWithCache({ messageType, query, cache, inFlight }) {
  const cached = cache.get(query);
  if (isFresh(cached)) return cached.data;
  const existing = inFlight.get(query);
  if (existing) return existing;

  const p = (async () => {
    try {
      const response = await browserAPI.runtime.sendMessage({ type: messageType, query });
      const data = response && response.success && Array.isArray(response.data) ? response.data : [];
      cache.set(query, { ts: Date.now(), data });
      return data;
    } catch (e) {
      return [];
    } finally {
      inFlight.delete(query);
    }
  })();

  inFlight.set(query, p);
  return p;
}
