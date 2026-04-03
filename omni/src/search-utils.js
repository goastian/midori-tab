(function (root, factory) {
  var api = factory();
  root.OmniLegacyUtils = api;
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function addHttp(url) {
    return /^(?:f|ht)tps?\:\/\//.test(url) ? url : 'http://' + url;
  }

  function validURL(str) {
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

  function filterByText(list, query) {
    return (list || []).filter(function (item) {
      var title = String((item && item.title) || '').toLowerCase();
      var desc = String((item && (item.desc || item.url)) || '').toLowerCase();
      return title.includes(query) || desc.includes(query);
    });
  }

  return {
    escapeHtml: escapeHtml,
    addHttp: addHttp,
    validURL: validURL,
    filterByText: filterByText,
  };
});
