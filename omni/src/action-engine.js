(function (root, factory) {
  var api = factory();
  root.OmniLegacyActions = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createActionEngine(cfg) {
    var sendMessage = typeof cfg.sendMessage === 'function' ? cfg.sendMessage : function () {};
    var addHttp = typeof cfg.addHttp === 'function' ? cfg.addHttp : function (url) { return url; };
    var showToast = typeof cfg.showToast === 'function' ? cfg.showToast : function () {};
    var closeOmni = typeof cfg.closeOmni === 'function' ? cfg.closeOmni : function () {};
    var windowRef = cfg.windowRef || (typeof window !== 'undefined' ? window : null);
    var documentRef = cfg.documentRef || (typeof document !== 'undefined' ? document : null);

    function openUrl(url, event) {
      if (!windowRef || !url) return;
      if (event && (event.ctrlKey || event.metaKey)) {
        windowRef.open(url);
      } else {
        windowRef.open(url, '_self');
      }
    }

    function runSideEffects(action, event, queryValue) {
      if (!action) return;
      switch (action.action) {
        case 'bookmark':
        case 'navigation':
        case 'url':
          openUrl(action.url, event);
          break;
        case 'scroll-bottom':
          if (windowRef && documentRef && documentRef.body) {
            windowRef.scrollTo(0, documentRef.body.scrollHeight);
          }
          showToast(action);
          break;
        case 'scroll-top':
          if (windowRef) windowRef.scrollTo(0, 0);
          break;
        case 'fullscreen':
          if (documentRef && documentRef.documentElement && documentRef.documentElement.requestFullscreen) {
            documentRef.documentElement.requestFullscreen();
          }
          break;
        case 'new-tab':
          if (windowRef) windowRef.open('');
          break;
        case 'email':
          if (windowRef) windowRef.open('mailto:');
          break;
        case 'goto':
          openUrl(addHttp(queryValue || ''), event);
          break;
        case 'print':
          if (windowRef && typeof windowRef.print === 'function') windowRef.print();
          break;
        case 'remove-all':
        case 'remove-history':
        case 'remove-cookies':
        case 'remove-cache':
        case 'remove-local-storage':
        case 'remove-passwords':
          showToast(action);
          break;
        default:
          break;
      }
    }

    function execute(action, context) {
      if (!action) return;

      var queryValue = (context && context.queryValue) || '';
      var queryLower = String(queryValue).toLowerCase();
      var event = context && context.event;

      closeOmni();

      if (queryLower.startsWith('/remove')) {
        sendMessage({ request: 'remove', type: action.type, action: action });
        return;
      }

      if (queryLower.startsWith('/history') || queryLower.startsWith('/bookmarks')) {
        openUrl(action.url, event);
        return;
      }

      sendMessage({ request: action.action, tab: action, query: queryValue });
      runSideEffects(action, event, queryValue);
    }

    return {
      execute: execute,
    };
  }

  return {
    createActionEngine: createActionEngine,
  };
});
