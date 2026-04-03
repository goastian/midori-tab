// Midori Tab — Content Script (trigger)
// Lightweight script injected into all pages. Loads the full launcher UI on demand.
'use strict';

(function () {
  if (window.__midoriOmniLoaded) return;
  window.__midoriOmniLoaded = true;

  let overlay = null;
  let isOpen = false;

  // ── Escape listener for pages with aggressive Esc capture ──────────────
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeOverlay();
    }
  }, { capture: true });

  // ── Message listener ────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.request === 'open-omni') {
      if (isOpen) {
        closeOverlay();
      } else {
        openOverlay();
      }
    }
  });

  // ── Build overlay ────────────────────────────────────────────────────────
  function openOverlay() {
    if (!overlay) {
      overlay = buildOverlay();
      document.body.appendChild(overlay);
    }
    isOpen = true;
    overlay.style.display = '';
    overlay.classList.remove('omni-cs-closing');
    requestAnimationFrame(() => {
      const input = overlay.querySelector('.omni-cs-input');
      input && input.focus();
    });
    // Populate data
    chrome.runtime.sendMessage({ request: 'get-data' }, (data) => {
      if (!data) return;
      renderResults(data.tabs, data.bookmarks, data.actions, '');
    });
  }

  function closeOverlay() {
    if (!overlay) return;
    isOpen = false;
    overlay.classList.add('omni-cs-closing');
    setTimeout(() => {
      if (overlay) overlay.style.display = 'none';
    }, 200);
  }

  // ── Build DOM ────────────────────────────────────────────────────────────
  function buildOverlay() {
    const host = document.createElement('div');
    host.id = 'midori-omni-cs';
    host.innerHTML = `
      <div class="omni-cs-backdrop" id="omni-cs-backdrop"></div>
      <div class="omni-cs-dialog" role="dialog" aria-modal="true" aria-label="Midori Omni">
        <div class="omni-cs-search-row">
          <span class="omni-cs-search-icon" aria-hidden="true">🔍</span>
          <input
            class="omni-cs-input"
            type="text"
            placeholder="Type a command or search…"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <ul class="omni-cs-list" id="omni-cs-list" role="listbox"></ul>
        <div class="omni-cs-footer" aria-hidden="true">
          <span class="omni-cs-count" id="omni-cs-count">0 results</span>
          <span class="omni-cs-hint">↑↓ navigate · ↵ select · Esc dismiss</span>
        </div>
      </div>
    `;

    // Inject styles
    const style = document.createElement('style');
    style.textContent = getStyles();
    host.prepend(style);

    // Events
    host.querySelector('#omni-cs-backdrop').addEventListener('click', closeOverlay);
    const input = host.querySelector('.omni-cs-input');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeydown);
    host.querySelector('.omni-cs-dialog').addEventListener('click', (e) => e.stopPropagation());

    return host;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let allItems = [];
  let visibleItems = [];
  let selectedIdx = 0;
  let debounceTimer = null;
  const memoCache = new Map();

  function onInput(e) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => executeSearch(e.target.value), 250);
  }

  function onKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    } else if (e.key === 'Escape') {
      closeOverlay();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = visibleItems[selectedIdx];
      if (item) handleAction(item, e.ctrlKey || e.metaKey);
    }
  }

  function moveSelection(delta) {
    const next = selectedIdx + delta;
    if (next >= 0 && next < visibleItems.length) {
      selectedIdx = next;
      highlightSelected();
      const el = overlay.querySelector(`[data-idx="${selectedIdx}"]`);
      el && el.scrollIntoView({ block: 'nearest' });
    }
  }

  function highlightSelected() {
    overlay.querySelectorAll('.omni-cs-item').forEach((el, i) => {
      el.classList.toggle('omni-cs-item--selected', i === selectedIdx);
      el.setAttribute('aria-selected', String(i === selectedIdx));
    });
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function executeSearch(rawQuery) {
    const query = expandShorthand(rawQuery).toLowerCase().trim();

    const cached = memoCache.get(query);
    if (cached) {
      renderResults(null, null, null, rawQuery, cached);
      return;
    }

    if (query.startsWith('/history')) {
      const q = query.replace('/history', '').trim();
      chrome.runtime.sendMessage({ request: 'search-history', query: q }, (r) => {
        const results = r?.history ?? [];
        memoCache.set(query, results);
        renderResults(null, null, null, rawQuery, results);
      });
      return;
    }
    if (query.startsWith('/bookmarks')) {
      const q = query.replace('/bookmarks', '').trim();
      if (q) {
        chrome.runtime.sendMessage({ request: 'search-bookmarks', query: q }, (r) => {
          const results = r?.bookmarks ?? [];
          memoCache.set(query, results);
          renderResults(null, null, null, rawQuery, results);
        });
      } else {
        const results = allItems.filter((i) => i.type === 'bookmark');
        memoCache.set(query, results);
        renderResults(null, null, null, rawQuery, results);
      }
      return;
    }

    let results = filterItems(query, rawQuery);
    memoCache.set(query, results);
    renderResults(null, null, null, rawQuery, results);
  }

  function expandShorthand(q) {
    if (q === '/t') return '/tabs ';
    if (q === '/b') return '/bookmarks ';
    if (q === '/h') return '/history ';
    if (q === '/r') return '/remove ';
    if (q === '/a') return '/actions ';
    return q;
  }

  function filterItems(lower, rawQuery) {
    const match = (i) =>
      (i.title || '').toLowerCase().includes(lower) ||
      (i.url || '').toLowerCase().includes(lower);

    if (lower === '') return allItems;
    if (lower.startsWith('/tabs')) {
      const q = lower.replace('/tabs', '').trim();
      return allItems.filter((i) => i.type === 'tab' && (q === '' || match(i)));
    }
    if (lower.startsWith('/actions')) {
      const q = lower.replace('/actions', '').trim();
      return allItems.filter((i) => i.type === 'action' && (q === '' || match(i)));
    }
    if (lower.startsWith('/remove')) {
      const q = lower.replace('/remove', '').trim();
      return allItems.filter((i) => (i.type === 'tab' || i.type === 'bookmark') && (q === '' || match(i)));
    }

    const base = allItems.filter(match);
    if (isValidUrl(lower)) {
      return [{ type: 'special', action: 'goto', title: rawQuery, desc: 'Go to URL', emoji: true, emojiChar: '🔗', keycheck: false }, ...base];
    }
    if (lower) {
      return [{ type: 'special', action: 'search', title: `"${rawQuery}"`, desc: 'Search the web', emoji: true, emojiChar: '🔍', keycheck: false }, ...base];
    }
    return base;
  }

  function isValidUrl(str) {
    return /^(https?:\/\/)?((([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3}))(\:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(\#[-a-z\d_]*)?$/i.test(str);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderResults(tabs, bookmarks, actions, rawQuery, overrideItems) {
    if (tabs !== null) {
      allItems = [...(tabs || []), ...(bookmarks || []), ...(actions || [])];
      memoCache.clear();
    }

    visibleItems = overrideItems !== undefined ? overrideItems : filterItems(rawQuery.toLowerCase().trim(), rawQuery);
    visibleItems = visibleItems.slice(0, 100);
    selectedIdx = 0;

    const list = overlay.querySelector('#omni-cs-list');
    const count = overlay.querySelector('#omni-cs-count');
    if (!list) return;

    list.innerHTML = '';
    visibleItems.forEach((item, idx) => {
      const li = document.createElement('li');
      li.className = 'omni-cs-item' + (idx === 0 ? ' omni-cs-item--selected' : '');
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(idx === 0));
      li.setAttribute('data-idx', idx);

      const icon = item.emoji
        ? `<span class="omni-cs-icon" aria-hidden="true">${item.emojiChar || '📄'}</span>`
        : `<img class="omni-cs-icon omni-cs-icon--img" src="${item.favIconUrl || ''}" alt="" aria-hidden="true" onerror="this.src='${chrome.runtime.getURL('globe.svg')}'" />`;

      const keys = item.keycheck && item.keys
        ? `<div class="omni-cs-keys" aria-hidden="true">${item.keys.map((k) => `<kbd class="omni-cs-key">${k}</kbd>`).join('')}</div>`
        : '';

      li.innerHTML = `${icon}<div class="omni-cs-body"><div class="omni-cs-title">${escapeHtml(item.title || '')}</div><div class="omni-cs-desc">${escapeHtml(item.desc || item.url || '')}</div></div>${keys}`;
      li.addEventListener('click', () => handleAction(item, false));
      li.addEventListener('pointerenter', () => { selectedIdx = idx; highlightSelected(); });
      list.appendChild(li);
    });

    if (count) count.textContent = `${visibleItems.length} results`;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Action handler ─────────────────────────────────────────────────────────
  function handleAction(item, newTab) {
    const input = overlay ? overlay.querySelector('.omni-cs-input') : null;
    const query = input ? input.value : '';
    const isRemoveMode = query.toLowerCase().startsWith('/remove');

    closeOverlay();

    if (isRemoveMode) {
      chrome.runtime.sendMessage({ request: 'remove', type: item.type, action: item });
      return;
    }

    switch (item.action) {
      case 'switch-tab':
        chrome.runtime.sendMessage({ request: 'switch-tab', tab: item });
        break;
      case 'bookmark':
      case 'history':
        window.open(item.url, newTab ? '_blank' : '_self');
        break;
      case 'goto':
        window.open(addHttp(query), newTab ? '_blank' : '_self');
        break;
      case 'search':
        chrome.runtime.sendMessage({ request: 'search', query });
        break;
      case 'url':
        window.open(item.url, newTab ? '_blank' : '_self');
        break;
      case 'new-tab':
        window.open('', '_blank');
        break;
      case 'email':
        window.open('mailto:');
        break;
      case 'print':
        window.print();
        break;
      case 'fullscreen':
        document.documentElement.requestFullscreen?.();
        break;
      case 'scroll-top':
        window.scrollTo(0, 0);
        break;
      case 'scroll-bottom':
        window.scrollTo(0, document.body.scrollHeight);
        break;
      default:
        if (item.url) {
          window.open(item.url, newTab ? '_blank' : '_self');
        } else {
          chrome.runtime.sendMessage({ request: item.action, tab: item, query });
        }
    }
  }

  function addHttp(url) {
    return /^(?:f|ht)tps?\:\/\//.test(url) ? url : 'http://' + url;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────
  function getStyles() {
    return `
      #midori-omni-cs { all: initial; }
      #midori-omni-cs *, #midori-omni-cs *::before, #midori-omni-cs *::after { box-sizing: border-box; }

      @media (prefers-color-scheme: dark) {
        #midori-omni-cs {
          --omni-bg: #1e2128; --omni-bg2: #292d36; --omni-border: #35373e;
          --omni-text: #f1f1f1; --omni-text2: #c5c6ca; --omni-text3: #a5a5ae;
          --omni-select: #17191e; --omni-accent: #6068d2; --omni-kbd: #383e4a;
          --omni-placeholder: #63687b;
        }
      }
      @media (prefers-color-scheme: light) {
        #midori-omni-cs {
          --omni-bg: #fafcff; --omni-bg2: #f4f6fb; --omni-border: #e8eaf2;
          --omni-text: #2b2d41; --omni-text2: #555770; --omni-text3: #929db2;
          --omni-select: #eff3f9; --omni-accent: #6068d2; --omni-kbd: #dadeea;
          --omni-placeholder: #bac2d1;
        }
      }

      .omni-cs-backdrop {
        position: fixed; inset: 0; background: rgba(0,0,0,.55);
        z-index: 2147483645;
        transition: opacity .15s ease;
      }
      .omni-cs-closing .omni-cs-backdrop { opacity: 0; }

      .omni-cs-dialog {
        position: fixed; inset: 0; margin: auto;
        width: min(700px, 96vw); height: fit-content;
        max-height: 560px;
        background: var(--omni-bg);
        border: 1px solid var(--omni-border);
        border-radius: 10px;
        z-index: 2147483646;
        overflow: hidden;
        display: flex; flex-direction: column;
        box-shadow: 0 24px 64px rgba(0,0,0,.35);
        font-family: system-ui, -apple-system, sans-serif;
        transition: transform .18s cubic-bezier(.05,.03,.35,1), opacity .18s ease;
      }
      .omni-cs-closing .omni-cs-dialog { transform: scale(.93); opacity: 0; }

      .omni-cs-search-row {
        display: flex; align-items: center;
        padding: 0 16px;
        border-bottom: 1px solid var(--omni-border);
        flex-shrink: 0;
      }
      .omni-cs-search-icon { font-size: 18px; margin-right: 8px; }
      .omni-cs-input {
        all: unset; flex: 1;
        height: 52px; font-size: 18px; font-weight: 400;
        color: var(--omni-text);
        caret-color: var(--omni-accent);
      }
      .omni-cs-input::placeholder { color: var(--omni-placeholder); }

      .omni-cs-list {
        list-style: none; margin: 0; padding: .25rem 0;
        overflow-y: auto; flex: 1;
        max-height: 400px;
      }
      .omni-cs-list::-webkit-scrollbar { width: 6px; }
      .omni-cs-list::-webkit-scrollbar-thumb { background: rgba(127,127,127,.4); border-radius: 3px; }

      .omni-cs-item {
        display: flex; align-items: center; gap: 12px;
        padding: 9px 16px; cursor: pointer;
        transition: background .1s;
      }
      .omni-cs-item:hover, .omni-cs-item--selected {
        background: var(--omni-select);
      }

      .omni-cs-icon {
        width: 24px; height: 24px; font-size: 19px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; border-radius: 4px;
      }
      .omni-cs-icon--img { object-fit: contain; }

      .omni-cs-body { flex: 1; min-width: 0; }
      .omni-cs-title {
        font-size: 14px; font-weight: 500;
        color: var(--omni-text); white-space: nowrap;
        overflow: hidden; text-overflow: ellipsis;
      }
      .omni-cs-desc {
        font-size: 12px; color: var(--omni-text3);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .omni-cs-keys { display: flex; gap: .2rem; flex-shrink: 0; }
      .omni-cs-key {
        display: inline-flex; align-items: center; justify-content: center;
        font-size: 11px; min-width: 20px; height: 20px; padding: 0 4px;
        background: var(--omni-kbd); border-radius: 4px;
        color: var(--omni-text); font-family: inherit;
      }

      .omni-cs-footer {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 16px;
        border-top: 1px solid var(--omni-border);
        flex-shrink: 0;
      }
      .omni-cs-count { font-size: 12px; color: var(--omni-text3); }
      .omni-cs-hint { font-size: 11px; color: var(--omni-text3); }

      @media (prefers-reduced-motion: reduce) {
        .omni-cs-dialog, .omni-cs-backdrop { transition: none !important; }
      }
    `;
  }
})();
