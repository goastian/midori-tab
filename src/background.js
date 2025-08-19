const handlers = {
  loadUser: async () => {
    const module = await import('./services/User');
    return module.default.LoadUser();
  },
};

//routes
chrome.webNavigation.onCommitted.addListener(async (details) => {
  const url = new URL(details.url);
  console.log(url)
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
      chrome.runtime.sendMessage({ type: 'LOGIN_SUCCESS' });
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
 const handler = handlers[msg.type];
  if (handler) {
    Promise.resolve(handler(msg, sender))
      .then((result) => sendResponse({ success: true, data: result }))
      .catch((error) =>
        sendResponse({ success: false, error: error.message || 'Error desconocido' })
      );
    return true; // respuesta asíncrona
  } else {
    sendResponse({ success: false, error: 'Comando no reconocido' });
  }
});