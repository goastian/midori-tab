(() => {
  const root = document.documentElement;
  const shell = document.getElementById('early-search');
  const form = document.getElementById('early-search-form');
  const input = document.getElementById('early-search-input');
  const button = form.querySelector('button');
  function saved(key, maximum = 4096) {
    try {
      const raw = localStorage.getItem(key);
      return raw && raw.length <= maximum ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  const labels = {
    en: ['Search with AstianGO...', 'Search'],
    es: ['Buscar con AstianGO...', 'Buscar'],
    pt: ['Pesquisar com AstianGO...', 'Pesquisar'],
    fr: ['Rechercher avec AstianGO...', 'Rechercher'],
    de: ['Suchen mit AstianGO...', 'Suchen'],
    ru: ['Искать с помощью AstianGO...', 'Поиск'],
    zh: ['使用 AstianGO 搜索...', '搜索'],
    ja: ['AstianGO で検索...', '検索'],
    it: ['Cerca con AstianGO...', 'Cerca'],
  };
  const candidate = saved('i18nStore')?.locale || navigator.languages?.[0] || navigator.language;
  const requested = String(candidate || '').trim().toLowerCase().split('-')[0];
  const locale = Object.hasOwn(labels, requested) ? requested : 'en';
  root.lang = locale;
  input.placeholder = labels[locale][0];
  input.setAttribute('aria-label', labels[locale][1]);
  button.setAttribute('aria-label', labels[locale][1]);
  const tab = saved('tabStore', 16384);
  const widgets = saved('widgetsStore', 16384);
  const visible = widgets?.enabled?.search ?? widgets?.search ?? true;
  const target = tab?.openLink === 'New Tab' ? '_blank' : '_self';
  form.target = target;
  form.rel = 'noopener';
  if (saved('spacesStore', 16384)?.enabled) shell.classList.add('early-dashboard--spaces');
  let composing = false;
  let submitted = false;
  let pendingHandoff;
  const listeners = new AbortController();
  const options = { signal: listeners.signal };
  input.addEventListener('input', () => { submitted = false; }, options);
  input.addEventListener('compositionstart', () => { composing = true; }, options);
  input.addEventListener('compositionend', () => {
    composing = false;
    if (pendingHandoff) setTimeout(pendingHandoff, 0);
  }, options);
  form.addEventListener('submit', event => {
    if (composing || submitted || !input.value.trim()) {
      event.preventDefault();
      return;
    }
    input.value = input.value.trim();
    submitted = true;
  }, options);
  const state = {
    locale,
    readyAt: visible ? performance.now() : null,
    handoff(adopt) {
      function transfer() {
        if (!shell.isConnected) return;
        const snapshot = {
          value: submitted ? '' : input.value,
          focused: document.activeElement === input,
          buttonFocused: document.activeElement === button,
          selectionStart: input.selectionStart,
          selectionEnd: input.selectionEnd,
          selectionDirection: input.selectionDirection,
        };
        listeners.abort();
        pendingHandoff = null;
        delete root.dataset.earlySearch;
        adopt(snapshot);
        shell.remove();
        state.handoff = null;
        state.handoffAt = performance.now();
      }
      if (composing) pendingHandoff = transfer;
      else transfer();
    },
  };
  window.__midoriEarlySearch = state;
  if (visible) {
    root.dataset.earlySearch = 'pending';
    performance.mark('early-search-ready');
  } else {
    listeners.abort();
    shell.remove();
    state.handoff = null;
  }
})();
