// Compatibilidad Firefox/Chrome
const isBrowser = typeof browser !== 'undefined';
var browserAPI = isBrowser ? browser : chrome;

function promisifyChrome(fn, ...args) {
  return new Promise((resolve, reject) => {
    fn(...args, (result) => {
      const err = chrome.runtime?.lastError;
      if (err) reject(new Error(err.message));
      else resolve(result);
    });
  });
}

function tabsQuery(queryInfo) {
  return isBrowser ? browserAPI.tabs.query(queryInfo) : promisifyChrome(browserAPI.tabs.query, queryInfo);
}

function tabsSendMessage(tabId, message) {
  return isBrowser ? browserAPI.tabs.sendMessage(tabId, message) : promisifyChrome(browserAPI.tabs.sendMessage, tabId, message);
}

function runtimeSendMessage(message) {
  return isBrowser ? browserAPI.runtime.sendMessage(message) : promisifyChrome(browserAPI.runtime.sendMessage, message);
}

function scriptingExecuteScript(details) {
  if (!browserAPI.scripting?.executeScript) return Promise.reject(new Error('scripting.executeScript not available'));
  return isBrowser ? browserAPI.scripting.executeScript(details) : promisifyChrome(browserAPI.scripting.executeScript, details);
}

function tabsExecuteScript(tabId, details) {
  if (!browserAPI.tabs?.executeScript) return Promise.reject(new Error('tabs.executeScript not available'));
  return isBrowser ? browserAPI.tabs.executeScript(tabId, details) : promisifyChrome(browserAPI.tabs.executeScript, tabId, details);
}

async function injectContentScript(tabId) {
  try {
    await scriptingExecuteScript({ target: { tabId }, files: ['content-script.js'] });
  } catch (e) {
    try {
      await tabsExecuteScript(tabId, { file: 'content-script.js' });
    } catch (e2) {
      throw e2;
    }
  }
}

function historySearch(query) {
  return isBrowser ? browserAPI.history.search(query) : promisifyChrome(browserAPI.history.search, query);
}

function bookmarksSearch(query) {
  return isBrowser ? browserAPI.bookmarks.search(query) : promisifyChrome(browserAPI.bookmarks.search, query);
}

function tabsCreate(createProperties) {
  return isBrowser ? browserAPI.tabs.create(createProperties) : promisifyChrome(browserAPI.tabs.create, createProperties);
}

function tabsUpdate(tabIdOrUpdateProperties, updateProperties) {
  if (typeof tabIdOrUpdateProperties === 'number') {
    return isBrowser ? browserAPI.tabs.update(tabIdOrUpdateProperties, updateProperties) : promisifyChrome(browserAPI.tabs.update, tabIdOrUpdateProperties, updateProperties);
  }
  return isBrowser ? browserAPI.tabs.update(tabIdOrUpdateProperties) : promisifyChrome(browserAPI.tabs.update, tabIdOrUpdateProperties);
}

// ⚡ INYECTAR CONTENT SCRIPT EN TODAS LAS PESTAÑAS AL INSTALAR/ACTUALIZAR
async function injectContentScriptInAllTabs() {
  try {
    // Obtener todas las pestañas
    const tabs = await tabsQuery({});
    
    for (const tab of tabs) {
      // Solo inyectar en páginas web normales (http/https)
      if (tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        try {
          // Intentar enviar un mensaje de prueba para ver si ya está cargado
          await tabsSendMessage(tab.id, { type: 'PING' });
        } catch (error) {
          // Si falla, el content script no está cargado - inyectarlo
          try {
            await injectContentScript(tab.id);
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
      const [tab] = await tabsQuery({ active: true, currentWindow: true });
      
      if (!tab || !tab.id) {
        return;
      }

      const tabUrl = tab.url || '';
      const isWebPage = tabUrl.startsWith('http://') || tabUrl.startsWith('https://');
      if (!isWebPage) {
        try {
          await runtimeSendMessage({ type: 'TOGGLE_COMMAND_PALETTE_NEW_TAB' });
        } catch (e) {
        }
        return;
      }
      
      const sendToggle = async () => {
        await tabsSendMessage(tab.id, { type: 'TOGGLE_COMMAND_PALETTE' });
      };
      
      // Intentar enviar mensaje al content script existente
      try {
        await sendToggle();
      } catch (error) {
        
        try {
          await injectContentScript(tab.id);
        } catch (e) {
        }

        const delays = [50, 200, 600];
        for (const delay of delays) {
          await new Promise(r => setTimeout(r, delay));
          try {
            await sendToggle();
            break;
          } catch (e) {
          }
        }
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
      const results = await historySearch({
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
      const bookmarks = await bookmarksSearch(msg.query);
      
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
        await tabsCreate({ url: msg.url, active: true });
      } else {
        const [currentTab] = await tabsQuery({ active: true, currentWindow: true });
        await tabsUpdate(currentTab.id, { url: msg.url });
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
