(function (root, factory) {
  var api = factory();
  root.OmniLegacyRuntime = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function sendMessage(payload, callback) {
    try {
      chrome.runtime.sendMessage(payload, function (response) {
        if (chrome.runtime.lastError) {
          if (typeof callback === 'function') callback(null);
          return;
        }
        if (typeof callback === 'function') callback(response);
      });
    } catch (_) {
      if (typeof callback === 'function') callback(null);
    }
  }

  function addMessageListener(listener) {
    try {
      chrome.runtime.onMessage.addListener(listener);
      return true;
    } catch (_) {
      return false;
    }
  }

  function removeMessageListener(listener) {
    try {
      chrome.runtime.onMessage.removeListener(listener);
      return true;
    } catch (_) {
      return false;
    }
  }

  return {
    sendMessage: sendMessage,
    addMessageListener: addMessageListener,
    removeMessageListener: removeMessageListener,
  };
});
