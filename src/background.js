// Compatibilidad Firefox/Chrome  
var browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// ⚡ INYECTAR CONTENT SCRIPT EN TODAS LAS PESTAÑAS AL INSTALAR/ACTUALIZAR
async function injectContentScriptInAllTabs() {
  try {
    // Obtener todas las pestañas
    const tabs = await browserAPI.tabs.query({});
    
    for (const tab of tabs) {
      // Solo inyectar en páginas web normales (http/https)
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        try {
          // Intentar enviar un mensaje de prueba para ver si ya está cargado
          await browserAPI.tabs.sendMessage(tab.id, { type: 'PING' });
        } catch (error) {
          // Si falla, el content script no está cargado - inyectarlo
          try {
            await browserAPI.scripting.executeScript({
              target: { tabId: tab.id },
              files: ['content-script.js']
            });
          } catch (injectError) {
          }
        }
      }
    }
  } catch (error) {
  }
}

// Escuchar evento de instalación/actualización
browserAPI.runtime.onInstalled.addListener((details) => {  
  // Inyectar content script en todas las pestañas existentes
  injectContentScriptInAllTabs();
});

// También inyectar cuando el background script se inicia (por si acaso)
injectContentScriptInAllTabs();

// Escuchar comando del navegador para abrir paleta
browserAPI.commands.onCommand.addListener(async (command) => {
  
  if (command === 'toggle-command-palette') {
    try {
      // Obtener pestaña activa
      const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        return;
      }

      const tabUrl = tab.url || '';
      const isWebPage = tabUrl.startsWith('http://') || tabUrl.startsWith('https://');
      if (!isWebPage) {
        try {
          await browserAPI.runtime.sendMessage({ type: 'TOGGLE_COMMAND_PALETTE_NEW_TAB' });
        } catch (e) {
        }
        return;
      }
      
      // Intentar enviar mensaje al content script existente
      try {
        await browserAPI.tabs.sendMessage(tab.id, { type: 'TOGGLE_COMMAND_PALETTE' });
      } catch (error) {
        
        await browserAPI.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content-script.js']
        });
        
        // Esperar un poco y abrir la paleta
        setTimeout(async () => {
          try {
            await browserAPI.tabs.sendMessage(tab.id, { type: 'TOGGLE_COMMAND_PALETTE' });
          } catch (e) {
          }
        }, 100);
      }
    } catch (error) {
    }
  }
});

const handlers = {
  // NOTA: loadUser comentado temporalmente por problemas con imports dinámicos
  // TODO: Implementar de forma compatible con el background script
  /*
  loadUser: async () => {
    const module = await import('./services/User');
    return module.default.LoadUser();
  },
  */
  
  SEARCH_HISTORY: async (msg) => {
    try {
      const results = await browserAPI.history.search({
        text: msg.query,
        maxResults: 5,
        startTime: 0,
      });
      
      return results.map(item => ({
        id: `history-${item.id}`,
        name: item.title || item.url,
        description: item.url,
        icon: '🕐',
        url: item.url,
        category: 'history',
      }));
    } catch (error) {
      console.error('Error searching history:', error);
      return [];
    }
  },
  
  SEARCH_BOOKMARKS: async (msg) => {
    try {
      const bookmarks = await browserAPI.bookmarks.search(msg.query);
      
      return bookmarks
        .filter(bookmark => bookmark.url)
        .slice(0, 5)
        .map(bookmark => ({
          id: `bookmark-${bookmark.id}`,
          name: bookmark.title,
          description: bookmark.url,
          icon: '⭐',
          url: bookmark.url,
          category: 'bookmarks',
        }));
    } catch (error) {
      console.error('Error searching bookmarks:', error);
      return [];
    }
  },
  
  OPEN_URL: async (msg) => {
    try {
      if (msg.newTab) {
        await browserAPI.tabs.create({ url: msg.url, active: true });
      } else {
        const [currentTab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
        await browserAPI.tabs.update(currentTab.id, { url: msg.url });
      }
      return { success: true };
    } catch (error) {
      console.error('Error opening URL:', error);
      return { success: false, error: error.message };
    }
  },
};

//routes
// NOTA: Esta sección está comentada temporalmente porque import.meta.env causa problemas en el background script
// TODO: Mover esta lógica al popup o usar una variable de configuración diferente
/*
browserAPI.webNavigation.onCommitted.addListener(async (details) => {
  const url = new URL(details.url);
  let hostUrl = import.meta.env.VITE_PASSPORT_PROXY_SERVER;
  let limpia = hostUrl.replace(/^https?:\/\//, '');
  if (url.hostname === limpia && url.pathname === "/callback") {
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (code && state) {
      const module = await import("./utils/token.ts");
      const token = new module.default();
      token.ngOnInit(url);

      // ✅ Notifica al frontend (popup o content script)
      browserAPI.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
    }
  }
});
*/

browserAPI.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  
  // Responder a PING inmediatamente
  if (msg.type === 'PING') {
    sendResponse({ success: true, pong: true });
    return true;
  }
  
  const handler = handlers[msg.type];
  if (handler) {
    Promise.resolve(handler(msg, sender))
      .then((result) => {
        sendResponse({ success: true, data: result });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message || 'Error desconocido' });
      });
    return true; // respuesta asíncrona
  } else {
    sendResponse({ success: false, error: 'Comando no reconocido' });
    return false;
  }
});
