(function (root, factory) {
  var api = factory();
  root.OmniLegacyLifecycle = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createLifecycleController(cfg) {
    var documentRef = cfg.documentRef || (typeof document !== 'undefined' ? document : null);
    var windowRef = cfg.windowRef || (typeof window !== 'undefined' ? window : null);
    var onDocumentKeydown =
      typeof cfg.onDocumentKeydown === 'function' ? cfg.onDocumentKeydown : function () {};
    var onDocumentKeyup = typeof cfg.onDocumentKeyup === 'function' ? cfg.onDocumentKeyup : function () {};
    var onRuntimeMessage =
      typeof cfg.onRuntimeMessage === 'function' ? cfg.onRuntimeMessage : function () {};
    var addMessageListener =
      typeof cfg.addMessageListener === 'function' ? cfg.addMessageListener : function () { return false; };
    var removeMessageListener =
      typeof cfg.removeMessageListener === 'function' ? cfg.removeMessageListener : function () { return false; };

    var isAttached = false;

    function addRuntimeFallback() {
      try {
        chrome.runtime.onMessage.addListener(onRuntimeMessage);
      } catch (_) {
        // Ignore missing runtime context.
      }
    }

    function removeRuntimeFallback() {
      try {
        chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      } catch (_) {
        // noop
      }
    }

    function detach() {
      if (!isAttached) return;
      isAttached = false;

      if (documentRef) {
        documentRef.removeEventListener('keydown', onDocumentKeydown, true);
        documentRef.removeEventListener('keyup', onDocumentKeyup, true);
      }
      if (windowRef) {
        windowRef.removeEventListener('pagehide', detach);
      }

      var removed = removeMessageListener(onRuntimeMessage);
      if (!removed) {
        removeRuntimeFallback();
      }
    }

    function attach() {
      if (isAttached) return;
      isAttached = true;

      if (documentRef) {
        documentRef.addEventListener('keydown', onDocumentKeydown, true);
        documentRef.addEventListener('keyup', onDocumentKeyup, true);
      }

      var added = addMessageListener(onRuntimeMessage);
      if (!added) {
        addRuntimeFallback();
      }

      if (windowRef) {
        windowRef.addEventListener('pagehide', detach);
      }
    }

    return {
      attach: attach,
      detach: detach,
    };
  }

  return {
    createLifecycleController: createLifecycleController,
  };
});