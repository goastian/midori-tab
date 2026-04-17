const DDG_AC_URL = 'https://duckduckgo.com/ac/?q=';

let controller = null;

/**
 * Fetches autocomplete suggestions from DuckDuckGo.
 * @param {string} query - The search query.
 * @returns {Promise<string[]>} Array of suggestion strings.
 */
export async function fetchSuggestions(query) {
  if (controller) controller.abort();
  controller = new AbortController();

  const res = await fetch(`${DDG_AC_URL}${encodeURIComponent(query)}`, {
    signal: controller.signal,
  });

  const data = await res.json();
  // DuckDuckGo returns [{ phrase: "..." }, ...]
  if (!Array.isArray(data)) return [];
  return data.map(item => (typeof item === 'object' ? item.phrase : item)).filter(Boolean);
}
