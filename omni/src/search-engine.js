(function (root, factory) {
  var api = factory();
  root.OmniLegacySearch = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function defaultFilterByText(list, query) {
    return (list || []).filter(function (item) {
      var title = String((item && item.title) || '').toLowerCase();
      var desc = String((item && (item.desc || item.url)) || '').toLowerCase();
      return title.includes(query) || desc.includes(query);
    });
  }

  function defaultValidUrl(str) {
    var pattern = new RegExp(
      '^(https?:\\/\\/)?' +
        '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|((\\d{1,3}\\.){3}\\d{1,3}))' +
        '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' +
        '(\\?[;&a-z\\d%_.~+=-]*)?' +
        '(\\#[-a-z\\d_]*)?$',
      'i'
    );
    return pattern.test(str || '');
  }

  function createSearchEngine(cfg) {
    var getActions = typeof cfg.getActions === 'function' ? cfg.getActions : function () { return []; };
    var sendMessage = typeof cfg.sendMessage === 'function' ? cfg.sendMessage : function (_payload, cb) { if (cb) cb(null); };
    var filterByText = typeof cfg.filterByText === 'function' ? cfg.filterByText : defaultFilterByText;
    var validURL = typeof cfg.validURL === 'function' ? cfg.validURL : defaultValidUrl;

    var requestSeq = 0;

    function normalizeShortcut(keyCode, value) {
      if (keyCode !== 8) {
        if (value === '/t') return '/tabs ';
        if (value === '/b') return '/bookmarks ';
        if (value === '/h') return '/history ';
        if (value === '/r') return '/remove ';
        if (value === '/a') return '/actions ';
        return value;
      }

      if (
        value === '/tabs' ||
        value === '/bookmarks' ||
        value === '/actions' ||
        value === '/remove' ||
        value === '/history'
      ) {
        return '';
      }

      return value;
    }

    function getSearchAction(actions) {
      return actions.find(function (x) { return x.action === 'search'; }) || null;
    }

    function getGotoAction(actions) {
      return actions.find(function (x) { return x.action === 'goto'; }) || null;
    }

    function renderGeneralQuery(actions, value) {
      var lower = value.toLowerCase();
      var searchAction = getSearchAction(actions);
      var gotoAction = getGotoAction(actions);

      var base = actions.filter(function (item) {
        return item.action !== 'search' && item.action !== 'goto';
      });
      base = filterByText(base, lower);

      if (!value) return base;

      if (validURL(lower) && gotoAction) {
        var gotoItem = Object.assign({}, gotoAction, { title: value, desc: 'Go to website' });
        return [gotoItem].concat(base);
      }

      if (searchAction) {
        var searchItem = Object.assign({}, searchAction, { title: '"' + value + '"', desc: 'Search for a query' });
        return [searchItem].concat(base);
      }

      return base;
    }

    function applyQuery(rawValue, done) {
      var actions = getActions();
      var value = String(rawValue || '');
      var lower = value.toLowerCase();
      var seq = ++requestSeq;

      function doneLatest(items) {
        if (seq !== requestSeq) return;
        if (typeof done === 'function') done(items || []);
      }

      if (lower.startsWith('/history')) {
        var historyTemp = lower.replace('/history ', '');
        var historyQuery = historyTemp !== '/history' ? historyTemp : '';
        sendMessage({ request: 'search-history', query: historyQuery }, function (response) {
          doneLatest((response && response.history) || []);
        });
        return;
      }

      if (lower.startsWith('/bookmarks')) {
        var bookmarksTemp = lower.replace('/bookmarks ', '');
        if (bookmarksTemp && bookmarksTemp !== '/bookmarks') {
          sendMessage({ request: 'search-bookmarks', query: bookmarksTemp }, function (response) {
            doneLatest((response && response.bookmarks) || []);
          });
        } else {
          doneLatest(actions.filter(function (x) { return x.type === 'bookmark'; }));
        }
        return;
      }

      if (lower.startsWith('/tabs')) {
        var tabsTemp = lower.replace('/tabs ', '').trim();
        var tabs = actions.filter(function (x) { return x.type === 'tab'; });
        if (tabsTemp && tabsTemp !== '/tabs') tabs = filterByText(tabs, tabsTemp);
        doneLatest(tabs);
        return;
      }

      if (lower.startsWith('/remove')) {
        var removeTemp = lower.replace('/remove ', '').trim();
        var removables = actions.filter(function (x) {
          return x.type === 'bookmark' || x.type === 'tab';
        });
        if (removeTemp && removeTemp !== '/remove') removables = filterByText(removables, removeTemp);
        doneLatest(removables);
        return;
      }

      if (lower.startsWith('/actions')) {
        var actionsTemp = lower.replace('/actions ', '').trim();
        var actionItems = actions.filter(function (x) { return x.type === 'action'; });
        if (actionsTemp && actionsTemp !== '/actions') actionItems = filterByText(actionItems, actionsTemp);
        doneLatest(actionItems);
        return;
      }

      doneLatest(renderGeneralQuery(actions, value));
    }

    return {
      normalizeShortcut: normalizeShortcut,
      applyQuery: applyQuery,
    };
  }

  return {
    createSearchEngine: createSearchEngine,
  };
});
