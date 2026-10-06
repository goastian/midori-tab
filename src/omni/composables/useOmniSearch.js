import { useOmniStore } from '../../stores/useOmniStore.js';

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

// ─── Composable ──────────────────────────────────────────────────────────────
export function useOmniSearch() {
  const store = useOmniStore();
  let debounceTimer = null;
  let generation = 0;

  async function runSearch(query, requestId) {
    const response = await sendMessage({ request: 'query-omni', query });
    if (requestId !== generation || !store.isOpen) return;
    store.setResults(response?.results ?? [], 0);
  }

  /**
   * Trigger a debounced search for `query`.
   * Updates store.results asynchronously after a short delay.
   */
  function search(query, options = {}) {
    const requestId = ++generation;
    const wait = options.immediate ? 0 : 160;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      await runSearch(query, requestId);
    }, wait);
  }

  return { search };
}
