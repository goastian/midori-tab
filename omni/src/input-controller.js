(function (root, factory) {
  var api = factory();
  root.OmniLegacyInputController = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createInputController(cfg) {
    var isOpen = typeof cfg.isOpen === 'function' ? cfg.isOpen : function () { return false; };
    var moveSelection = typeof cfg.moveSelection === 'function' ? cfg.moveSelection : function () {};
    var closeOmni = typeof cfg.closeOmni === 'function' ? cfg.closeOmni : function () {};
    var handleAction = typeof cfg.handleAction === 'function' ? cfg.handleAction : function () {};
    var sendMessage = typeof cfg.sendMessage === 'function' ? cfg.sendMessage : function () {};
    var hasAction = typeof cfg.hasAction === 'function' ? cfg.hasAction : function () { return false; };
    var refreshActions = typeof cfg.refreshActions === 'function' ? cfg.refreshActions : function () {};
    var runSearch = typeof cfg.runSearch === 'function' ? cfg.runSearch : function () {};
    var getInputValue =
      typeof cfg.getInputValue === 'function'
        ? cfg.getInputValue
        : function () {
            return '';
          };

    var downKeys = new Set();

    function isAltShiftShortcut(e, code, key) {
      var hasModifiers = !!(e && e.altKey && e.shiftKey);
      var hasKey = typeof e.key === 'string' && e.key.toLowerCase() === key;
      if (hasModifiers && hasKey) return true;
      return downKeys.has(18) && downKeys.has(16) && downKeys.has(code);
    }

    function onDocumentKeydown(e) {
      downKeys.add(e.keyCode);

      if (!isOpen()) return;

      if (e.keyCode === 38) {
        e.preventDefault();
        moveSelection(-1);
      } else if (e.keyCode === 40) {
        e.preventDefault();
        moveSelection(1);
      } else if (e.keyCode === 27) {
        e.preventDefault();
        closeOmni();
      } else if (e.keyCode === 13) {
        e.preventDefault();
        handleAction(e);
      }
    }

    function runAfterShortcut() {
      refreshActions(function () {
        if (isOpen()) runSearch(getInputValue());
      });
    }

    function onDocumentKeyup(e) {
      if (isAltShiftShortcut(e, 80, 'p')) {
        if (hasAction('pin')) {
          sendMessage({ request: 'pin-tab' });
        } else {
          sendMessage({ request: 'unpin-tab' });
        }
        runAfterShortcut();
      } else if (isAltShiftShortcut(e, 77, 'm')) {
        if (hasAction('mute')) {
          sendMessage({ request: 'mute-tab' });
        } else {
          sendMessage({ request: 'unmute-tab' });
        }
        runAfterShortcut();
      } else if (isAltShiftShortcut(e, 67, 'c')) {
        if (typeof window !== 'undefined' && typeof window.open === 'function') {
          window.open('mailto:');
        }
      }

      if (e.key === 'Escape' && isOpen()) {
        sendMessage({ request: 'close-omni' });
      }

      downKeys.clear();
    }

    return {
      onDocumentKeydown: onDocumentKeydown,
      onDocumentKeyup: onDocumentKeyup,
    };
  }

  return {
    createInputController: createInputController,
  };
});