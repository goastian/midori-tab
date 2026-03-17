// Content Script Palette — Carga bajo demanda desde content-script.js
// Contiene toda la lógica de UI, búsqueda y renderizado de la paleta de comandos

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let paletteInjected = false;
let paletteOpen = false;
let selectedIndex = 0;
let currentResults = [];
let searchTimeout = null;

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
  searchInput.placeholder = 'Buscar comandos, apps, historial...';
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
    <div style="font-size: 14px;">Escribe para buscar comandos, apps o historial</div>
    <div style="font-size: 12px; margin-top: 8px; opacity: 0.7;">ESC para cerrar</div>
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
  
  document.body.appendChild(overlay);
  paletteInjected = true;
}

// Debounce de búsqueda (150ms)
function debouncedSearch(e) {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (!query) {
    loadPredefinedCommands();
    return;
  }
  
  searchTimeout = setTimeout(async () => {
    const resultsContainer = document.getElementById('midori-results');
    try {
      const results = await searchAll(query);
      currentResults = results;
      selectedIndex = 0;
      renderResults(results);
    } catch (error) {
      resultsContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5); padding: 20px; text-align: center;">Error al buscar</div>';
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
async function searchAll(query) {
  const results = [];
  
  // Comandos predefinidos
  const commands = getPredefinedCommands();
  commands.forEach(cmd => {
    const searchText = `${cmd.name} ${cmd.description} ${cmd.keywords?.join(' ')}`.toLowerCase();
    if (searchText.includes(query.toLowerCase())) {
      results.push(cmd);
    }
  });
  
  // Historial (usando Browser API)
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'SEARCH_HISTORY',
      query: query
    });
    if (response && response.success && response.data) {
      results.push(...response.data);
    }
  } catch (e) {
    // Silenciar errores de historial
  }
  
  // Marcadores
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'SEARCH_BOOKMARKS',
      query: query
    });
    if (response && response.success && response.data) {
      results.push(...response.data);
    }
  } catch (e) {
    // Silenciar errores de marcadores
  }
  
  return results.slice(0, 10);
}

// Renderizar resultados
function renderResults(results) {
  const resultsContainer = document.getElementById('midori-results');
  
  if (results.length === 0) {
    resultsContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5); padding: 20px; text-align: center;">No se encontraron resultados</div>';
    return;
  }
  
  resultsContainer.innerHTML = results.map((item, index) => `
    <div class="midori-command-item ${index === selectedIndex ? 'selected' : ''}" data-index="${index}">
      <span class="midori-command-icon">${item.icon || '🔗'}</span>
      <div class="midori-command-content">
        <div class="midori-command-name">${item.name}</div>
        <div class="midori-command-description">${item.description || item.url || ''}</div>
      </div>
      <span class="midori-category-label category-${item.category}">${item.category}</span>
    </div>
  `).join('');
  
  // Event listeners para clicks
  resultsContainer.querySelectorAll('.midori-command-item').forEach((el, index) => {
    el.addEventListener('click', () => executeCommand(results[index]));
  });
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
    updateSelection();
  }
  
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
  }
  
  if (e.key === 'Enter') {
    e.preventDefault();
    if (currentResults[selectedIndex]) {
      executeCommand(currentResults[selectedIndex]);
    }
  }
}

function updateSelection() {
  document.querySelectorAll('.midori-command-item').forEach((el, index) => {
    if (index === selectedIndex) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
