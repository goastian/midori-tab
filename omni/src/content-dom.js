(function (root, factory) {
  var api = factory();
  root.OmniLegacyDom = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function fallbackEscapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function createRenderer(cfg) {
    var listEl = cfg.listEl;
    var resultsEl = cfg.resultsEl;
    var onHover = typeof cfg.onHover === 'function' ? cfg.onHover : function () {};
    var onSelect = typeof cfg.onSelect === 'function' ? cfg.onSelect : function () {};
    var escapeHtml = typeof cfg.escapeHtml === 'function' ? cfg.escapeHtml : fallbackEscapeHtml;
    var getFallbackIconUrl =
      typeof cfg.getFallbackIconUrl === 'function' ? cfg.getFallbackIconUrl : function () { return ''; };

    var visibleItems = [];

    function createKeysHtml(action) {
      if (!action.keycheck || !Array.isArray(action.keys) || !action.keys.length) return '';
      var keys = action.keys
        .map(function (key) { return '<span class="omni-shortcut">' + escapeHtml(key) + '</span>'; })
        .join('');
      return '<div class="omni-keys">' + keys + '</div>';
    }

    function createIconHtml(action) {
      if (action.emoji) {
        return '<span class="omni-emoji-action">' + escapeHtml(action.emojiChar || '📄') + '</span>';
      }
      var fallback = escapeHtml(getFallbackIconUrl());
      var src = escapeHtml(action.favIconUrl || fallback);
      return '<img src="' + src + '" alt="favicon" class="omni-icon" onerror="this.src=\'' + fallback + '\'">';
    }

    function updateResultsCount() {
      if (!resultsEl) return;
      resultsEl.textContent = visibleItems.length + ' results';
    }

    function setSelectedIndex(idx) {
      if (!visibleItems.length) {
        return 0;
      }

      var next = Math.max(0, Math.min(idx, visibleItems.length - 1));
      if (!listEl) return next;

      var nodes = Array.from(listEl.querySelectorAll('.omni-item'));
      nodes.forEach(function (node, i) {
        if (i === next) node.classList.add('omni-item-active');
        else node.classList.remove('omni-item-active');
      });

      var active = nodes[next];
      if (active) {
        active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }

      return next;
    }

    function createItemNode(item, idx) {
      var node = document.createElement('div');
      node.className = 'omni-item';
      node.dataset.index = String(idx);
      node.dataset.type = item.type || '';
      if (item.url) node.dataset.url = item.url;

      var title = escapeHtml(item.title || '');
      var desc = escapeHtml(item.desc || item.url || '');

      node.innerHTML =
        createIconHtml(item) +
        '<div class="omni-item-details">' +
        '<div class="omni-item-name">' + title + '</div>' +
        '<div class="omni-item-desc">' + desc + '</div>' +
        '</div>' +
        createKeysHtml(item) +
        '<div class="omni-select">Select <span class="omni-shortcut">⏎</span></div>';

      node.addEventListener('mouseover', function () {
        onHover(idx);
      });

      node.addEventListener('click', function (e) {
        onSelect(idx, e);
      });

      return node;
    }

    function render(items, selectedIndex) {
      visibleItems = (items || []).slice(0, 300);

      if (!listEl) return visibleItems;
      listEl.innerHTML = '';

      var frag = document.createDocumentFragment();
      visibleItems.forEach(function (item, idx) {
        frag.appendChild(createItemNode(item, idx));
      });
      listEl.appendChild(frag);

      updateResultsCount();
      setSelectedIndex(typeof selectedIndex === 'number' ? selectedIndex : 0);

      return visibleItems;
    }

    return {
      render: render,
      setSelectedIndex: setSelectedIndex,
    };
  }

  return {
    createRenderer: createRenderer,
  };
});
