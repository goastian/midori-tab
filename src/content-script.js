// Content Script - Se ejecuta en TODAS las páginas web
// Permite abrir la paleta de comandos con Ctrl+Alt+Space desde cualquier sitio

// Compatibilidad Firefox/Chrome
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Estado del content script
let paletteInjected = false;
let paletteOpen = false;

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
    backdrop-filter: blur(8px);
    z-index: 999999999;
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;
  
  // Crear paleta
  const palette = document.createElement('div');
  palette.id = 'midori-command-palette';
  palette.style.cssText = `
    background: #1a1a1a;
    border-radius: 12px;
    width: 90%;
    max-width: 600px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    animation: slideDown 0.2s ease-out;
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
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    box-sizing: border-box;
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
  
  // Agregar animación
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideDown {
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
      background: rgba(255, 255, 255, 0.2);
      border-radius: 4px;
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
      background: rgba(255, 255, 255, 0.1);
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
    
    .category-productivity { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
    .category-communication { background: rgba(16, 185, 129, 0.2); color: #34d399; }
    .category-development { background: rgba(139, 92, 246, 0.2); color: #a78bfa; }
    .category-design { background: rgba(236, 72, 153, 0.2); color: #f472b6; }
    .category-social { background: rgba(251, 146, 60, 0.2); color: #fb923c; }
    .category-utilities { background: rgba(156, 163, 175, 0.2); color: #9ca3af; }
    .category-history { background: rgba(234, 179, 8, 0.2); color: #facc15; }
    .category-bookmarks { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
  `;
  document.head.appendChild(style);
  
  // Event listeners
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeCommandPalette();
    }
  });
  
  searchInput.addEventListener('input', handleSearch);
  searchInput.addEventListener('keydown', handleKeyNavigation);
  
  document.body.appendChild(overlay);
  paletteInjected = true;
  
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
    
    // Cargar comandos predefinidos
    loadPredefinedCommands();
    
  }
}

// Cerrar paleta
function closeCommandPalette() {
  const overlay = document.getElementById('midori-command-palette-overlay');
  if (overlay) {
    overlay.style.display = 'none';
    paletteOpen = false;
  }
}

// Toggle paleta
function toggleCommandPalette() {
  if (paletteOpen) {
    closeCommandPalette();
  } else {
    openCommandPalette();
  }
}

// Manejar búsqueda
let selectedIndex = 0;
let currentResults = [];

async function handleSearch(e) {
  const query = e.target.value.trim();
  const resultsContainer = document.getElementById('midori-results');
  
  if (!query) {
    // Mostrar comandos predefinidos
    loadPredefinedCommands();
    return;
  }
  
  // Buscar en comandos predefinidos, historial y marcadores
  try {
    const results = await searchAll(query);
    currentResults = results;
    selectedIndex = 0;
    renderResults(results);
  } catch (error) {
    resultsContainer.innerHTML = '<div style="color: rgba(255,255,255,0.5); padding: 20px; text-align: center;">Error al buscar</div>';
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
    console.log('📜 History search response:', response);
    if (response && response.success && response.data) {
      console.log('✅ History results:', response.data.length);
      results.push(...response.data);
    } else {
      console.warn('⚠️ History search failed:', response);
    }
  } catch (e) {
    console.error('❌ History search error:', e);
  }
  
  // Marcadores
  try {
    const response = await browserAPI.runtime.sendMessage({
      type: 'SEARCH_BOOKMARKS',
      query: query
    });
    console.log('🔖 Bookmarks search response:', response);
    if (response && response.success && response.data) {
      console.log('✅ Bookmarks results:', response.data.length);
      results.push(...response.data);
    } else {
      console.warn('⚠️ Bookmarks search failed:', response);
    }
  } catch (e) {
    console.error('❌ Bookmarks search error:', e);
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
    // Abrir URL
    browserAPI.runtime.sendMessage({
      type: 'OPEN_URL',
      url: command.url,
      newTab: true
    });
  } else if (command.action) {
    // Ejecutar acción
    command.action();
  }
  
  closeCommandPalette();
}

// Comandos predefinidos
function getPredefinedCommands() {
  return [
    { id: 'notion', name: 'Notion', description: 'Abrir Notion', icon: '📝', url: 'https://notion.so', category: 'productivity' },
    { id: 'github', name: 'GitHub', description: 'Abrir GitHub', icon: '🐙', url: 'https://github.com', category: 'development' },
    { id: 'gmail', name: 'Gmail', description: 'Abrir Gmail', icon: '📧', url: 'https://mail.google.com', category: 'communication' },
    { id: 'youtube', name: 'YouTube', description: 'Abrir YouTube', icon: '📺', url: 'https://youtube.com', category: 'social' },
    { id: 'figma', name: 'Figma', description: 'Abrir Figma', icon: '🎨', url: 'https://figma.com', category: 'design' },
    { id: 'slack', name: 'Slack', description: 'Abrir Slack', icon: '💬', url: 'https://slack.com', category: 'communication' },
    { id: 'trello', name: 'Trello', description: 'Abrir Trello', icon: '📋', url: 'https://trello.com', category: 'productivity' },
    { id: 'drive', name: 'Google Drive', description: 'Abrir Google Drive', icon: '📁', url: 'https://drive.google.com', category: 'utilities' },
  ];
}

function loadPredefinedCommands() {
  currentResults = getPredefinedCommands();
  renderResults(currentResults);
}

// Escuchar mensajes del background (desde comando del navegador)
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TOGGLE_COMMAND_PALETTE') {
    toggleCommandPalette();
    sendResponse({ success: true });
    return true;
  }
  
  // Responder a PING para verificar que el content script está cargado
  if (message.type === 'PING') {
    sendResponse({ success: true, loaded: true });
    return true;
  }
});
