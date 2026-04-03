// Omni legacy content script (modernized): vanilla JS runtime without jQuery/virtualized-list.
(function () {
  if (window.__omniLegacyLoaded) return;
  window.__omniLegacyLoaded = true;

  const state = {
    isOpen: false,
    actions: [],
    visibleItems: [],
    selectedIndex: 0,
    downKeys: new Set(),
    newTabUrl: chrome.runtime.getURL('newtab.html'),
  };

  const dom = {
    root: null,
    list: null,
    input: null,
    results: null,
    toast: null,
    toastText: null,
    toastImg: null,
  };

  const legacyUtils = window.OmniLegacyUtils || {};
  const runtimeApi = window.OmniLegacyRuntime || {};
  const domApi = window.OmniLegacyDom || {};
  const searchApi = window.OmniLegacySearch || {};
  const actionsApi = window.OmniLegacyActions || {};
  let listRenderer = null;
  let searchEngine = null;
  let actionEngine = null;

  function q(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function escapeHtml(text) {
    if (typeof legacyUtils.escapeHtml === 'function') {
      return legacyUtils.escapeHtml(text);
    }
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function sendRuntimeMessage(payload, callback) {
    if (typeof runtimeApi.sendMessage === 'function') {
      runtimeApi.sendMessage(payload, callback);
      return;
    }
    try {
      chrome.runtime.sendMessage(payload, (response) => {
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

  function updateResultsCount() {
    if (!dom.results) return;
    dom.results.textContent = state.visibleItems.length + ' results';
  }

  function setSelectedIndex(idx) {
    if (listRenderer && typeof listRenderer.setSelectedIndex === 'function') {
      const next = listRenderer.setSelectedIndex(idx);
      state.selectedIndex = next;
      return;
    }

    if (!state.visibleItems.length) {
      state.selectedIndex = 0;
      return;
    }
    const next = Math.max(0, Math.min(idx, state.visibleItems.length - 1));
    state.selectedIndex = next;

    const nodes = qa('.omni-item', dom.list);
    nodes.forEach((node, i) => {
      if (i === next) {
        node.classList.add('omni-item-active');
      } else {
        node.classList.remove('omni-item-active');
      }
    });

    const active = nodes[next];
    if (active) {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function createKeysHtml(action) {
    if (!action.keycheck || !Array.isArray(action.keys) || !action.keys.length) return '';
    const keys = action.keys.map((key) => '<span class="omni-shortcut">' + escapeHtml(key) + '</span>').join('');
    return '<div class="omni-keys">' + keys + '</div>';
  }

  function createIconHtml(action) {
    if (action.emoji) {
      return '<span class="omni-emoji-action">' + escapeHtml(action.emojiChar || '📄') + '</span>';
    }
    const src = escapeHtml(action.favIconUrl || chrome.runtime.getURL('/assets/globe.svg'));
    const fallback = escapeHtml(chrome.runtime.getURL('/assets/globe.svg'));
    return '<img src="' + src + '" alt="favicon" class="omni-icon" onerror="this.src=\'' + fallback + '\'">';
  }

  function createItemNode(item, idx) {
    const node = document.createElement('div');
    node.className = 'omni-item' + (idx === state.selectedIndex ? ' omni-item-active' : '');
    node.dataset.index = String(idx);
    node.dataset.type = item.type || '';
    if (item.url) node.dataset.url = item.url;

    const title = escapeHtml(item.title || '');
    const desc = escapeHtml(item.desc || item.url || '');
    node.innerHTML =
      createIconHtml(item) +
      '<div class="omni-item-details">' +
      '<div class="omni-item-name">' + title + '</div>' +
      '<div class="omni-item-desc">' + desc + '</div>' +
      '</div>' +
      createKeysHtml(item) +
      '<div class="omni-select">Select <span class="omni-shortcut">⏎</span></div>';

    node.addEventListener('mouseover', () => {
      setSelectedIndex(idx);
    });

    node.addEventListener('click', (e) => {
      setSelectedIndex(idx);
      handleAction(e);
    });

    return node;
  }

  function renderItems(items) {
    state.visibleItems = items.slice(0, 300);
    state.selectedIndex = 0;

    if (listRenderer && typeof listRenderer.render === 'function') {
      state.visibleItems = listRenderer.render(state.visibleItems, state.selectedIndex);
      state.selectedIndex = listRenderer.setSelectedIndex(0);
      return;
    }

    if (!dom.list) return;
    dom.list.innerHTML = '';

    const frag = document.createDocumentFragment();
    state.visibleItems.forEach((item, idx) => {
      frag.appendChild(createItemNode(item, idx));
    });
    dom.list.appendChild(frag);
    updateResultsCount();
  }

  function addHttp(url) {
    if (typeof legacyUtils.addHttp === 'function') {
      return legacyUtils.addHttp(url);
    }
    return /^(?:f|ht)tps?\:\/\//.test(url) ? url : 'http://' + url;
  }

  function filterByText(list, query) {
    if (typeof legacyUtils.filterByText === 'function') {
      return legacyUtils.filterByText(list, query);
    }
    return list.filter((item) => {
      const title = String(item.title || '').toLowerCase();
      const desc = String(item.desc || item.url || '').toLowerCase();
      return title.includes(query) || desc.includes(query);
    });
  }

  function runSearch(value) {
    if (!searchEngine || typeof searchEngine.applyQuery !== 'function') {
      const fallback = filterByText(state.actions, String(value || '').toLowerCase());
      renderItems(fallback);
      return;
    }
    searchEngine.applyQuery(value || '', renderItems);
  }

  function applySearch(e) {
    if (!dom.input) return;

    const keyCode = e && typeof e.keyCode === 'number' ? e.keyCode : 0;
    if ([37, 38, 39, 40, 13].includes(keyCode)) return;

    if (searchEngine && typeof searchEngine.normalizeShortcut === 'function') {
      const normalized = searchEngine.normalizeShortcut(keyCode, dom.input.value.toLowerCase());
      if (normalized !== dom.input.value) {
        dom.input.value = normalized;
      }
    }

    runSearch(dom.input.value);
  }

  function showToast(action) {
    if (!dom.toast || !dom.toastText) return;
    dom.toastText.textContent = '"' + (action.title || 'Action') + '" has been successfully performed';
    dom.toast.classList.add('omni-show-toast');
    window.setTimeout(() => {
      if (dom.toast) dom.toast.classList.remove('omni-show-toast');
    }, 3000);
  }

  function closeOmni() {
    if (window.location.href === state.newTabUrl) {
      sendRuntimeMessage({ request: 'restore-new-tab' });
      return;
    }
    state.isOpen = false;
    if (dom.root) dom.root.classList.add('omni-closing');
  }

  function openOmni() {
    refreshActions(() => {
      state.isOpen = true;
      if (!dom.root || !dom.input) return;
      dom.input.value = '';
      dom.root.classList.remove('omni-closing');
      runSearch('');
      window.setTimeout(() => {
        dom.input.focus();
        if (window.focusLock && typeof window.focusLock.on === 'function') {
          window.focusLock.on(dom.input);
        }
        dom.input.focus();
      }, 100);
    });
  }

  function refreshActions(onDone) {
    sendRuntimeMessage({ request: 'get-actions' }, (response) => {
      state.actions = (response && response.actions) || [];
      if (typeof onDone === 'function') onDone();
    });
  }

  function handleAction(e) {
    const action = state.visibleItems[state.selectedIndex];
    if (!action) return;

    const queryValue = dom.input ? dom.input.value : '';

    if (actionEngine && typeof actionEngine.execute === 'function') {
      actionEngine.execute(action, { queryValue: queryValue, event: e });
    } else {
      closeOmni();
      sendRuntimeMessage({ request: action.action, tab: action, query: queryValue });
    }

    refreshActions(() => {
      if (state.isOpen) runSearch(dom.input ? dom.input.value : '');
    });
  }

  function moveSelection(delta) {
    if (!state.visibleItems.length) return;
    setSelectedIndex(state.selectedIndex + delta);
  }

  function openShortcuts() {
    sendRuntimeMessage({ request: 'extensions/shortcuts' });
  }

  function onDocumentKeydown(e) {
    state.downKeys.add(e.keyCode);

    if (!state.isOpen) return;

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

  function onDocumentKeyup(e) {
    if (state.downKeys.has(18) && state.downKeys.has(16) && state.downKeys.has(80)) {
      if (state.actions.find((x) => x.action === 'pin')) {
        sendRuntimeMessage({ request: 'pin-tab' });
      } else {
        sendRuntimeMessage({ request: 'unpin-tab' });
      }
      refreshActions(() => {
        if (state.isOpen) runSearch(dom.input ? dom.input.value : '');
      });
    } else if (state.downKeys.has(18) && state.downKeys.has(16) && state.downKeys.has(77)) {
      if (state.actions.find((x) => x.action === 'mute')) {
        sendRuntimeMessage({ request: 'mute-tab' });
      } else {
        sendRuntimeMessage({ request: 'unmute-tab' });
      }
      refreshActions(() => {
        if (state.isOpen) runSearch(dom.input ? dom.input.value : '');
      });
    } else if (state.downKeys.has(18) && state.downKeys.has(16) && state.downKeys.has(67)) {
      window.open('mailto:');
    }

    if (e.key === 'Escape' && state.isOpen) {
      sendRuntimeMessage({ request: 'close-omni' });
    }

    state.downKeys.clear();
  }

  function onRuntimeMessage(message) {
    if (message.request === 'open-omni') {
      if (state.isOpen) closeOmni();
      else openOmni();
    } else if (message.request === 'close-omni') {
      closeOmni();
    }
  }

  function attachUiListeners() {
    if (!dom.input || !dom.root) return;

    dom.input.addEventListener('keyup', applySearch);

    const overlay = q('#omni-overlay', dom.root);
    if (overlay) {
      overlay.addEventListener('click', closeOmni);
    }

    const shortcutsButton = q('#open-page-omni-extension-thing', dom.root);
    if (shortcutsButton) {
      shortcutsButton.addEventListener('click', openShortcuts);
    }
  }

  function injectTemplateAndBoot() {
    fetch(chrome.runtime.getURL('/content.html'))
      .then((res) => res.text())
      .then((html) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = html;
        const children = Array.from(wrap.children);
        children.forEach((child) => document.body.appendChild(child));

        dom.root = q('#omni-extension');
        dom.list = q('#omni-list');
        dom.input = q('#omni-extension input');
        dom.results = q('#omni-results');
        dom.toast = q('#omni-extension-toast');
        dom.toastText = q('#omni-extension-toast span');
        dom.toastImg = q('#omni-extension-toast img');

        if (typeof domApi.createRenderer === 'function') {
          listRenderer = domApi.createRenderer({
            listEl: dom.list,
            resultsEl: dom.results,
            escapeHtml: escapeHtml,
            getFallbackIconUrl: function () {
              return chrome.runtime.getURL('/assets/globe.svg');
            },
            onHover: function (idx) {
              setSelectedIndex(idx);
            },
            onSelect: function (idx, e) {
              setSelectedIndex(idx);
              handleAction(e);
            },
          });
        }

        if (typeof searchApi.createSearchEngine === 'function') {
          searchEngine = searchApi.createSearchEngine({
            getActions: function () {
              return state.actions;
            },
            sendMessage: sendRuntimeMessage,
            filterByText: filterByText,
            validURL:
              typeof legacyUtils.validURL === 'function'
                ? legacyUtils.validURL
                : function (str) {
                    return /^(https?:\/\/)?((([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3}))(\:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(\#[-a-z\d_]*)?$/i.test(
                      str || ''
                    );
                  },
          });
        }

        if (typeof actionsApi.createActionEngine === 'function') {
          actionEngine = actionsApi.createActionEngine({
            sendMessage: sendRuntimeMessage,
            addHttp: addHttp,
            showToast: showToast,
            closeOmni: closeOmni,
            windowRef: window,
            documentRef: document,
          });
        }

        if (dom.toastImg) {
          dom.toastImg.src = chrome.runtime.getURL('assets/check.svg');
        }

        attachUiListeners();

        refreshActions();

        if (window.location.href === state.newTabUrl) {
          state.isOpen = true;
          if (dom.root) dom.root.classList.remove('omni-closing');
          window.setTimeout(() => {
            if (dom.input) dom.input.focus();
          }, 100);
        }
      })
      .catch(() => {
        // Ignore template injection errors in unsupported contexts.
      });
  }

  function destroy() {
    document.removeEventListener('keydown', onDocumentKeydown, true);
    document.removeEventListener('keyup', onDocumentKeyup, true);
    window.removeEventListener('pagehide', destroy);
    if (typeof runtimeApi.removeMessageListener === 'function') {
      runtimeApi.removeMessageListener(onRuntimeMessage);
    } else {
      try {
        chrome.runtime.onMessage.removeListener(onRuntimeMessage);
      } catch (_) {
        // noop
      }
    }
  }

  document.addEventListener('keydown', onDocumentKeydown, true);
  document.addEventListener('keyup', onDocumentKeyup, true);
  if (typeof runtimeApi.addMessageListener === 'function') {
    runtimeApi.addMessageListener(onRuntimeMessage);
  } else {
    try {
      chrome.runtime.onMessage.addListener(onRuntimeMessage);
    } catch (_) {
      // Ignore missing runtime context.
    }
  }
  window.addEventListener('pagehide', destroy);

  injectTemplateAndBoot();
})();
