import { useOmniStore } from '../../stores/useOmniStore.js';

const MEMO_TTL = 5_000; // 5 s
const memo = new Map(); // lowercase-query → { results, ts }

// ─── URL helpers ─────────────────────────────────────────────────────────────
const URL_RE = /^(https?:\/\/)?((([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3}))(\:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(\#[-a-z\d_]*)?$/i;

function isValidUrl(str) {
  return URL_RE.test(str);
}

function addHttp(url) {
  return /^(?:f|ht)tps?\:\/\//.test(url) ? url : 'http://' + url;
}

// ─── Shorthand expansion ─────────────────────────────────────────────────────
function expandShorthand(q) {
  if (q === '/t') return '/tabs ';
  if (q === '/b') return '/bookmarks ';
  if (q === '/h') return '/history ';
  if (q === '/r') return '/remove ';
  if (q === '/a') return '/actions ';
  return q;
}

// ─── Item matching ───────────────────────────────────────────────────────────
function matchItem(item, lower) {
  return (
    (item.title || '').toLowerCase().includes(lower) ||
    (item.url || '').toLowerCase().includes(lower) ||
    (item.desc || '').toLowerCase().includes(lower)
  );
}

// ─── Background message helpers ─────────────────────────────────────────────
function sendMessage(request) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(request, (response) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        resolve(response);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

// ─── Core search ─────────────────────────────────────────────────────────────
async function runSearch(rawQuery, dataCache) {
  const expanded = expandShorthand(rawQuery);
  const lower = expanded.toLowerCase().trim();

  const cached = memo.get(lower);
  if (cached && Date.now() - cached.ts < MEMO_TTL) {
    return cached.results;
  }

  const { tabs = [], bookmarks = [], actions = [] } = dataCache || {};

  let results = [];

  if (lower === '') {
    results = [...actions];
  } else if (lower.startsWith('/history')) {
    const q = lower.replace('/history', '').trim();
    const resp = await sendMessage({ request: 'search-history', query: q });
    results = resp?.history ?? [];
  } else if (lower.startsWith('/bookmarks')) {
    const q = lower.replace('/bookmarks', '').trim();
    if (q) {
      const resp = await sendMessage({ request: 'search-bookmarks', query: q });
      results = resp?.bookmarks ?? [];
    } else {
      results = bookmarks;
    }
  } else if (lower.startsWith('/tabs')) {
    const q = lower.replace('/tabs', '').trim();
    results = q ? tabs.filter((t) => matchItem(t, q)) : tabs;
  } else if (lower.startsWith('/actions')) {
    const q = lower.replace('/actions', '').trim();
    results = q ? actions.filter((a) => matchItem(a, q)) : actions;
  } else if (lower.startsWith('/remove')) {
    const q = lower.replace('/remove', '').trim();
    const removables = [...tabs, ...bookmarks];
    results = q ? removables.filter((i) => matchItem(i, q)) : removables;
  } else {
    // General search across all items
    const all = [...tabs, ...bookmarks, ...actions];
    const matched = all.filter((i) => matchItem(i, lower));

    if (isValidUrl(lower)) {
      results = [
        { type: 'special', action: 'goto', title: rawQuery, desc: addHttp(rawQuery), emoji: true, emojiChar: '🔗', keycheck: false },
        ...matched,
      ];
    } else {
      results = [
        { type: 'special', action: 'search', title: `"${rawQuery}"`, desc: 'Search the web', emoji: true, emojiChar: '🔍', keycheck: false },
        ...matched,
      ];
    }
  }

  memo.set(lower, { results, ts: Date.now() });
  return results;
}

// ─── Composable ──────────────────────────────────────────────────────────────
export function useOmniSearch() {
  const store = useOmniStore();
  let debounceTimer = null;

  /** Invalidate memoisation cache (call when data is refreshed) */
  function invalidateMemo() {
    memo.clear();
  }

  /**
   * Trigger a debounced search for `query`.
   * Updates store.results asynchronously after 280 ms.
   */
  function search(query) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const data = await store.fetchData();
      const results = await runSearch(query, data);
      store.setResults(results, 0);
    }, 280);
  }

  return { search, invalidateMemo };
}
