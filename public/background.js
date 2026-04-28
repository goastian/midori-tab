// Midori Tab — Background Service Worker
// Replaces the original Omni background.js with a differential cache approach.
// No jQuery, no global resets on every tab event.

'use strict';

const OMNI_CONTENT_SCRIPT_FILES = ['omni-content.js'];
const OMNI_QUERY_TTL = 5_000;
const OMNI_MAX_RESULTS = 100;
const omniQueryCache = new Map();

function callChrome(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      const callback = (result) => {
        const lastError = chrome.runtime?.lastError;
        if (lastError) {
          reject(new Error(lastError.message));
          return;
        }
        resolve(result);
      };

      const maybePromise = method(...args, callback);
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(resolve, reject);
      }
    } catch (error) {
      reject(error);
    }
  });
}

function safeCallChrome(method, ...args) {
  return callChrome(method, ...args).catch(() => undefined);
}

function clearOmniQueryCache() {
  omniQueryCache.clear();
}

function isRestrictedOmniUrl(url) {
  return (
    !url ||
    url.startsWith('chrome://') ||
    url.startsWith('about:') ||
    url.startsWith('chrome-extension://') ||
    url.includes('chrome.google.com')
  );
}

async function ensureOmniContentScript(tabId) {
  const ready = await safeCallChrome(
    chrome.tabs.sendMessage.bind(chrome.tabs),
    tabId,
    { request: 'omni-handshake' }
  );

  if (ready?.ok) {
    return true;
  }

  if (chrome.scripting?.executeScript) {
    await callChrome(
      chrome.scripting.executeScript.bind(chrome.scripting),
      {
        target: { tabId },
        files: OMNI_CONTENT_SCRIPT_FILES,
      }
    );
    return true;
  }

  if (chrome.tabs?.executeScript) {
    await callChrome(
      chrome.tabs.executeScript.bind(chrome.tabs),
      tabId,
      {
        file: OMNI_CONTENT_SCRIPT_FILES[0],
        runAt: 'document_idle',
      }
    );
    return true;
  }

  return false;
}

// ─── Differential Tabs Cache ───────────────────────────────────────────────
const tabsCache = new Map(); // tabId → normalised tab object
let tabsCacheReady = false;
const TABS_CACHE_MAX = 500;

function normaliseTab(tab) {
  return {
    id: tab.id,
    index: tab.index,
    windowId: tab.windowId,
    title: tab.title || '',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || '',
    mutedInfo: tab.mutedInfo || { muted: false },
    pinned: !!tab.pinned,
    type: 'tab',
    action: 'switch-tab',
    desc: 'Open tab',
    emoji: false,
    keycheck: false,
  };
}

async function ensureTabsCache() {
  if (tabsCacheReady) return;
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), {});
  for (const tab of tabs || []) {
    tabsCache.set(tab.id, normaliseTab(tab));
  }
  tabsCacheReady = true;
}

chrome.tabs.onCreated.addListener((tab) => {
  tabsCache.set(tab.id, normaliseTab(tab));
  clearOmniQueryCache();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabsCache.delete(tabId);
  clearOmniQueryCache();
});

chrome.tabs.onReplaced.addListener((addedTabId, removedTabId) => {
  tabsCache.delete(removedTabId);
  clearOmniQueryCache();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tabsCache.has(tabId)) {
    const existing = tabsCache.get(tabId);
    tabsCache.set(tabId, {
      ...existing,
      title: tab.title ?? existing.title,
      url: tab.url ?? existing.url,
      favIconUrl: tab.favIconUrl ?? existing.favIconUrl,
      mutedInfo: tab.mutedInfo ?? existing.mutedInfo,
      pinned: tab.pinned !== undefined ? tab.pinned : existing.pinned,
    });
  } else {
    // Tab appeared without onCreated (e.g. restored session)
    tabsCache.set(tabId, normaliseTab(tab));
  }
  clearOmniQueryCache();
});

chrome.tabs.onActivated.addListener(() => {
  clearOmniQueryCache();
});

chrome.windows.onFocusChanged.addListener(() => {
  clearOmniQueryCache();
});

// ─── Bookmarks Cache ────────────────────────────────────────────────────────
let bookmarksCache = null;
let bookmarksInvalidateTimer = null;

function invalidateBookmarks() {
  clearTimeout(bookmarksInvalidateTimer);
  bookmarksInvalidateTimer = setTimeout(() => {
    bookmarksCache = null;
    clearOmniQueryCache();
  }, 1000);
}

chrome.bookmarks.onCreated.addListener(invalidateBookmarks);
chrome.bookmarks.onRemoved.addListener(invalidateBookmarks);
chrome.bookmarks.onChanged.addListener(invalidateBookmarks);
chrome.bookmarks.onMoved.addListener(invalidateBookmarks);

async function getBookmarks() {
  if (bookmarksCache) return bookmarksCache;
  const recent = await callChrome(chrome.bookmarks.getRecent.bind(chrome.bookmarks), 100);
  bookmarksCache = (recent || [])
    .filter((b) => Boolean(b.url))
    .map((b) => ({
      id: b.id,
      title: b.title || b.url,
      desc: 'Bookmark',
      url: b.url,
      type: 'bookmark',
      action: 'bookmark',
      emoji: true,
      emojiChar: '⭐️',
      keycheck: false,
    }));
  return bookmarksCache;
}

// ─── Static Actions ─────────────────────────────────────────────────────────
let staticActions = null;
let platformOs = null;

async function getPlatformOs() {
  if (!platformOs) {
    const info = await callChrome(chrome.runtime.getPlatformInfo.bind(chrome.runtime));
    platformOs = info?.os || 'linux';
  }
  return platformOs;
}

async function getOmniUiConfig() {
  const os = await getPlatformOs();
  const openInNewTab = os === 'mac' ? '⌘+↵' : 'Ctrl+↵';

  return {
    maxResults: OMNI_MAX_RESULTS,
    hints: {
      navigate: '↑↓',
      select: '↵',
      openInNewTab,
      dismiss: 'Esc',
    },
  };
}

function buildStaticActions(isMac) {
  const mod = isMac ? '⌘' : 'Ctrl';
  const alt = isMac ? '⌥' : 'Alt';
  const shift = '⇧';

  return [
    { title: 'New tab', desc: 'Open a new tab', type: 'action', action: 'new-tab', emoji: true, emojiChar: '✨', keycheck: true, keys: [mod, 'T'] },
    { title: 'Bookmark page', desc: 'Bookmark the current page', type: 'action', action: 'create-bookmark', emoji: true, emojiChar: '📕', keycheck: true, keys: [mod, 'D'] },
    { title: 'Fullscreen', desc: 'Toggle fullscreen', type: 'action', action: 'fullscreen', emoji: true, emojiChar: '🖥', keycheck: true, keys: isMac ? [mod, 'Ctrl', 'F'] : ['F11'] },
    { title: 'Reload', desc: 'Reload the page', type: 'action', action: 'reload', emoji: true, emojiChar: '♻️', keycheck: true, keys: isMac ? [mod, shift, 'R'] : ['F5'] },
    { title: 'Compose email', desc: 'Compose a new email', type: 'action', action: 'email', emoji: true, emojiChar: '✉️', keycheck: true, keys: [alt, shift, 'C'] },
    { title: 'Print page', desc: 'Print the current page', type: 'action', action: 'print', emoji: true, emojiChar: '🖨️', keycheck: true, keys: [mod, 'P'] },
    { title: 'Scroll to top', desc: 'Scroll to the top of the page', type: 'action', action: 'scroll-top', emoji: true, emojiChar: '👆', keycheck: true, keys: isMac ? [mod, '↑'] : ['Home'] },
    { title: 'Scroll to bottom', desc: 'Scroll to the bottom of the page', type: 'action', action: 'scroll-bottom', emoji: true, emojiChar: '👇', keycheck: true, keys: isMac ? [mod, '↓'] : ['End'] },
    { title: 'Go back', desc: 'Go back in history', type: 'action', action: 'go-back', emoji: true, emojiChar: '👈', keycheck: true, keys: isMac ? [mod, '←'] : ['Alt', '←'] },
    { title: 'Go forward', desc: 'Go forward in history', type: 'action', action: 'go-forward', emoji: true, emojiChar: '👉', keycheck: true, keys: isMac ? [mod, '→'] : ['Alt', '→'] },
    { title: 'Duplicate tab', desc: 'Duplicate the current tab', type: 'action', action: 'duplicate-tab', emoji: true, emojiChar: '📋', keycheck: true, keys: [alt, shift, 'D'] },
    { title: 'Close tab', desc: 'Close the current tab', type: 'action', action: 'close-tab', emoji: true, emojiChar: '🗑', keycheck: true, keys: [mod, 'W'] },
    { title: 'Close window', desc: 'Close the current window', type: 'action', action: 'close-window', emoji: true, emojiChar: '💥', keycheck: true, keys: [mod, shift, 'W'] },
    { title: 'Incognito mode', desc: 'Open an incognito window', type: 'action', action: 'incognito', emoji: true, emojiChar: '🕵️', keycheck: true, keys: [mod, shift, 'N'] },
    { title: 'Browsing history', desc: 'Open browsing history', type: 'action', action: 'history', emoji: true, emojiChar: '🗂', keycheck: true, keys: isMac ? [mod, 'Y'] : ['Ctrl', 'H'] },
    { title: 'Downloads', desc: 'Browse your downloads', type: 'action', action: 'downloads', emoji: true, emojiChar: '📦', keycheck: true, keys: isMac ? [mod, shift, 'J'] : ['Ctrl', 'J'] },
    { title: 'Extensions', desc: 'Manage extensions', type: 'action', action: 'extensions', emoji: true, emojiChar: '🧩', keycheck: false },
    { title: 'Settings', desc: 'Open browser settings', type: 'action', action: 'settings', emoji: true, emojiChar: '⚙️', keycheck: false },
    { title: 'Manage browsing data', desc: 'Clear browsing data', type: 'action', action: 'manage-data', emoji: true, emojiChar: '🔬', keycheck: false },
    { title: 'Clear all browsing data', desc: 'Remove all browsing data', type: 'action', action: 'remove-all', emoji: true, emojiChar: '🧹', keycheck: false },
    { title: 'Clear history', desc: 'Clear browsing history', type: 'action', action: 'remove-history', emoji: true, emojiChar: '🗂', keycheck: false },
    { title: 'Clear cookies', desc: 'Clear all cookies', type: 'action', action: 'remove-cookies', emoji: true, emojiChar: '🍪', keycheck: false },
    { title: 'Clear cache', desc: 'Clear the browser cache', type: 'action', action: 'remove-cache', emoji: true, emojiChar: '🗄', keycheck: false },
    { title: 'Clear local storage', desc: 'Clear local storage', type: 'action', action: 'remove-local-storage', emoji: true, emojiChar: '📦', keycheck: false },
    { title: 'Clear passwords', desc: 'Clear saved passwords', type: 'action', action: 'remove-passwords', emoji: true, emojiChar: '🔑', keycheck: false },
    // — Quick-create URLs
    { title: 'New Notion page', desc: 'Create a new Notion page', type: 'action', action: 'url', url: 'https://notion.new', emoji: true, emojiChar: '📓', keycheck: false },
    { title: 'New Google Doc', desc: 'Create a new Google Doc', type: 'action', action: 'url', url: 'https://docs.new', emoji: true, emojiChar: '📄', keycheck: false },
    { title: 'New Google Sheet', desc: 'Create a new spreadsheet', type: 'action', action: 'url', url: 'https://sheets.new', emoji: true, emojiChar: '📊', keycheck: false },
    { title: 'New Google Slides', desc: 'Create a new presentation', type: 'action', action: 'url', url: 'https://slides.new', emoji: true, emojiChar: '📑', keycheck: false },
    { title: 'New GitHub repo', desc: 'Create a new GitHub repository', type: 'action', action: 'url', url: 'https://github.new', emoji: true, emojiChar: '🐙', keycheck: false },
    { title: 'New GitHub gist', desc: 'Create a new Gist', type: 'action', action: 'url', url: 'https://gist.new', emoji: true, emojiChar: '📝', keycheck: false },
    { title: 'New CodePen pen', desc: 'Create a new CodePen pen', type: 'action', action: 'url', url: 'https://pen.new', emoji: true, emojiChar: '🖊', keycheck: false },
    { title: 'New Figma file', desc: 'Create a new Figma file', type: 'action', action: 'url', url: 'https://figma.new', emoji: true, emojiChar: '🎨', keycheck: false },
    { title: 'New Linear issue', desc: 'Create a new Linear issue', type: 'action', action: 'url', url: 'https://linear.new', emoji: true, emojiChar: '🔷', keycheck: false },
    { title: 'New Google Meet', desc: 'Start a Google Meet meeting', type: 'action', action: 'url', url: 'https://meet.new', emoji: true, emojiChar: '📹', keycheck: false },
    { title: 'New Google Calendar event', desc: 'Add a Google Calendar event', type: 'action', action: 'url', url: 'https://cal.new', emoji: true, emojiChar: '📅', keycheck: false },
    { title: 'New note (Google Keep)', desc: 'Add a note to Google Keep', type: 'action', action: 'url', url: 'https://note.new', emoji: true, emojiChar: '🗒', keycheck: false },
    { title: 'Convert to PDF', desc: 'Convert a file to PDF', type: 'action', action: 'url', url: 'https://pdf.new', emoji: true, emojiChar: '📄', keycheck: false },
  ];
}

async function ensureStaticActions() {
  if (staticActions) return;
  const os = await getPlatformOs();
  staticActions = buildStaticActions(os === 'mac');
}

function isValidOmniUrl(str) {
  return /^(https?:\/\/)?((([a-z\d]([a-z\d-]*[a-z\d])*)\.)+[a-z]{2,}|((\d{1,3}\.){3}\d{1,3}))(\:\d+)?(\/[-a-z\d%_.~+]*)*(\?[;&a-z\d%_.~+=-]*)?(\#[-a-z\d_]*)?$/i.test(str);
}

function addHttp(url) {
  return /^(?:f|ht)tps?\:\/\//.test(url) ? url : 'http://' + url;
}

function expandOmniShorthand(query) {
  if (query === '/t') return '/tabs ';
  if (query === '/b') return '/bookmarks ';
  if (query === '/h') return '/history ';
  if (query === '/r') return '/remove ';
  if (query === '/a') return '/actions ';
  return query;
}

function matchOmniItem(item, lower) {
  return (
    (item.title || '').toLowerCase().includes(lower) ||
    (item.url || '').toLowerCase().includes(lower) ||
    (item.desc || '').toLowerCase().includes(lower)
  );
}

// ─── Dynamic actions based on current tab ──────────────────────────────────
async function getDynamicActions() {
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), { active: true, currentWindow: true });
  const [tab] = tabs || [];
  if (!tab) return [];
  const isMac = (await getPlatformOs()) === 'mac';
  const alt = isMac ? '⌥' : 'Alt';

  const muteAction = tab.mutedInfo?.muted
    ? { title: 'Unmute tab', desc: 'Unmute the current tab', type: 'action', action: 'unmute', emoji: true, emojiChar: '🔈', keycheck: true, keys: [alt, '⇧', 'M'] }
    : { title: 'Mute tab', desc: 'Mute the current tab', type: 'action', action: 'mute', emoji: true, emojiChar: '🔇', keycheck: true, keys: [alt, '⇧', 'M'] };

  const pinAction = tab.pinned
    ? { title: 'Unpin tab', desc: 'Unpin the current tab', type: 'action', action: 'unpin', emoji: true, emojiChar: '📌', keycheck: true, keys: [alt, '⇧', 'P'] }
    : { title: 'Pin tab', desc: 'Pin the current tab', type: 'action', action: 'pin', emoji: true, emojiChar: '📌', keycheck: true, keys: [alt, '⇧', 'P'] };

  return [muteAction, pinAction];
}

async function collectOmniData() {
  await ensureStaticActions();
  await ensureTabsCache();

  const [bookmarks, dynamicActions] = await Promise.all([
    getBookmarks(),
    getDynamicActions(),
  ]);

  return {
    tabs: Array.from(tabsCache.values()),
    bookmarks,
    actions: [...dynamicActions, ...staticActions],
  };
}

async function queryOmni(rawQuery) {
  const expanded = expandOmniShorthand(rawQuery || '');
  const lower = expanded.toLowerCase().trim();
  const cached = omniQueryCache.get(lower);

  if (cached && Date.now() - cached.ts < OMNI_QUERY_TTL) {
    return cached.results;
  }

  const data = await collectOmniData();
  const { tabs, bookmarks, actions } = data;
  let results = [];

  if (lower === '') {
    results = [...actions];
  } else if (lower.startsWith('/history')) {
    const historyQuery = lower.replace('/history', '').trim();
    const historyResults = await callChrome(chrome.history.search.bind(chrome.history), {
      text: historyQuery,
      maxResults: 50,
      startTime: 0,
    });
    results = (historyResults || []).map((entry) => ({
      id: entry.id,
      title: entry.title || entry.url,
      desc: entry.url,
      url: entry.url,
      type: 'history',
      action: 'history',
      emoji: true,
      emojiChar: '🏛',
      keycheck: false,
    }));
  } else if (lower.startsWith('/bookmarks')) {
    const bookmarkQuery = lower.replace('/bookmarks', '').trim();
    if (bookmarkQuery) {
      const bookmarkResults = await callChrome(chrome.bookmarks.search.bind(chrome.bookmarks), { query: bookmarkQuery });
      results = (bookmarkResults || [])
        .filter((bookmark) => Boolean(bookmark.url))
        .map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title || bookmark.url,
          desc: bookmark.url,
          url: bookmark.url,
          type: 'bookmark',
          action: 'bookmark',
          emoji: true,
          emojiChar: '⭐️',
          keycheck: false,
        }));
    } else {
      results = bookmarks;
    }
  } else if (lower.startsWith('/tabs')) {
    const tabQuery = lower.replace('/tabs', '').trim();
    results = tabQuery ? tabs.filter((tab) => matchOmniItem(tab, tabQuery)) : tabs;
  } else if (lower.startsWith('/actions')) {
    const actionQuery = lower.replace('/actions', '').trim();
    results = actionQuery ? actions.filter((action) => matchOmniItem(action, actionQuery)) : actions;
  } else if (lower.startsWith('/remove')) {
    const removeQuery = lower.replace('/remove', '').trim();
    const removables = [...tabs, ...bookmarks];
    results = removeQuery ? removables.filter((item) => matchOmniItem(item, removeQuery)) : removables;
  } else {
    const matched = [...tabs, ...bookmarks, ...actions].filter((item) => matchOmniItem(item, lower));

    if (isValidOmniUrl(lower)) {
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

  const boundedResults = results.slice(0, OMNI_MAX_RESULTS);
  omniQueryCache.set(lower, { results: boundedResults, ts: Date.now() });
  return boundedResults;
}

// ─── Action Handlers ────────────────────────────────────────────────────────
async function getCurrentTab() {
  const tabs = await callChrome(chrome.tabs.query.bind(chrome.tabs), { active: true, currentWindow: true });
  const [tab] = tabs || [];
  return tab;
}

async function switchTab(tab) {
  await safeCallChrome(chrome.tabs.highlight.bind(chrome.tabs), { tabs: tab.index, windowId: tab.windowId });
  await safeCallChrome(chrome.windows.update.bind(chrome.windows), tab.windowId, { focused: true });
}

async function openUrlFromCurrentTab(url, newTab = false) {
  if (!url) return;

  if (newTab) {
    chrome.tabs.create({ url });
    return;
  }

  const currentTab = await getCurrentTab();
  if (currentTab?.id) {
    chrome.tabs.update(currentTab.id, { url });
    return;
  }

  chrome.tabs.create({ url });
}

async function executeAction(message) {
  switch (message.request) {
    case 'switch-tab':
      await switchTab(message.tab);
      break;
    case 'go-back': {
      const t = await getCurrentTab();
      chrome.tabs.goBack(t.id);
      break;
    }
    case 'go-forward': {
      const t = await getCurrentTab();
      chrome.tabs.goForward(t.id);
      break;
    }
    case 'duplicate-tab': {
      const t = await getCurrentTab();
      chrome.tabs.duplicate(t.id);
      break;
    }
    case 'create-bookmark': {
      const t = await getCurrentTab();
      chrome.bookmarks.create({ title: t.title, url: t.url });
      break;
    }
    case 'mute': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { muted: true });
      break;
    }
    case 'unmute': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { muted: false });
      break;
    }
    case 'reload':
      chrome.tabs.reload();
      break;
    case 'pin': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { pinned: true });
      break;
    }
    case 'unpin': {
      const t = await getCurrentTab();
      chrome.tabs.update(t.id, { pinned: false });
      break;
    }
    case 'new-tab':
      chrome.tabs.create({});
      break;
    case 'incognito':
      chrome.windows.create({ incognito: true });
      break;
    case 'close-tab': {
      const t = await getCurrentTab();
      chrome.tabs.remove(t.id);
      break;
    }
    case 'close-window': {
      const t = await getCurrentTab();
      chrome.windows.remove(t.windowId);
      break;
    }
    case 'remove': {
      if (message.type === 'bookmark') {
        chrome.bookmarks.remove(message.action.id);
        invalidateBookmarks();
      } else if (message.type === 'tab') {
        chrome.tabs.remove(message.action.id);
      }
      break;
    }
    case 'remove-all':
      chrome.browsingData.remove(
        { since: new Date().getTime() },
        { appcache: true, cache: true, cacheStorage: true, cookies: true, downloads: true, fileSystems: true, formData: true, history: true, indexedDB: true, localStorage: true, passwords: true, serviceWorkers: true, webSQL: true }
      );
      break;
    case 'remove-history':
      chrome.browsingData.removeHistory({ since: 0 });
      break;
    case 'remove-cookies':
      chrome.browsingData.removeCookies({ since: 0 });
      break;
    case 'remove-cache':
      chrome.browsingData.removeCache({ since: 0 });
      break;
    case 'remove-local-storage':
      chrome.browsingData.removeLocalStorage({ since: 0 });
      break;
    case 'remove-passwords':
      chrome.browsingData.removePasswords({ since: 0 });
      break;
    case 'history':
    case 'downloads':
    case 'extensions':
    case 'settings':
      chrome.tabs.create({ url: `chrome://${message.request}/` });
      break;
    case 'manage-data':
      chrome.tabs.create({ url: 'chrome://settings/clearBrowserData' });
      break;
    case 'search':
      if (message.query) {
        chrome.search.query({ text: message.query });
      }
      break;
  }
}

async function executeOmniItem(message) {
  const item = message.item || {};
  const query = message.query || '';
  const removeMode = Boolean(message.removeMode);
  const newTab = Boolean(message.newTab);

  if (removeMode) {
    await executeAction({ request: 'remove', type: item.type, action: item });
    return { handled: true };
  }

  switch (item.action) {
    case 'switch-tab':
      await executeAction({ request: 'switch-tab', tab: item });
      return { handled: true };
    case 'bookmark':
    case 'history':
    case 'url':
      if (item.url) {
        await openUrlFromCurrentTab(item.url, newTab);
      }
      return { handled: true };
    case 'goto':
      await openUrlFromCurrentTab(addHttp(query), newTab);
      return { handled: true };
    case 'search':
      await executeAction({ request: 'search', query });
      return { handled: true };
    case 'new-tab':
      await executeAction({ request: 'new-tab' });
      return { handled: true };
    case 'email':
      await openUrlFromCurrentTab('mailto:', newTab);
      return { handled: true };
    case 'print':
    case 'fullscreen':
    case 'scroll-top':
    case 'scroll-bottom':
      return { handled: false, localAction: item.action };
    default:
      if (item.url) {
        await openUrlFromCurrentTab(item.url, newTab);
        return { handled: true };
      }
      if (item.action) {
        await executeAction({ request: item.action, tab: item, query });
        return { handled: true };
      }
      return { handled: false };
  }
}

// ─── Message Handler ─────────────────────────────────────────────────────────
async function handleMessage(message) {
  switch (message.request) {
    case 'get-data': {
      return collectOmniData();
    }

    case 'query-omni': {
      const results = await queryOmni(message.query ?? '');
      return { results };
    }

    case 'get-omni-config': {
      return getOmniUiConfig();
    }

    case 'execute-omni-item': {
      return executeOmniItem(message);
    }

    case 'search-history': {
      const results = await callChrome(chrome.history.search.bind(chrome.history), {
        text: message.query ?? '',
        maxResults: 50,
        startTime: 0,
      });
      return {
        history: (results || []).map((h) => ({
          id: h.id,
          title: h.title || h.url,
          desc: h.url,
          url: h.url,
          type: 'history',
          action: 'history',
          emoji: true,
          emojiChar: '🏛',
          keycheck: false,
        })),
      };
    }

    case 'search-bookmarks': {
      const results = await callChrome(chrome.bookmarks.search.bind(chrome.bookmarks), { query: message.query });
      return {
        bookmarks: (results || [])
          .filter((b) => Boolean(b.url))
          .map((b) => ({
            id: b.id,
            title: b.title || b.url,
            desc: b.url,
            url: b.url,
            type: 'bookmark',
            action: 'bookmark',
            emoji: true,
            emojiChar: '⭐️',
            keycheck: false,
          })),
      };
    }

    case 'switch-tab':
    case 'go-back':
    case 'go-forward':
    case 'duplicate-tab':
    case 'create-bookmark':
    case 'mute':
    case 'unmute':
    case 'reload':
    case 'pin':
    case 'unpin':
    case 'new-tab':
    case 'incognito':
    case 'close-tab':
    case 'close-window':
    case 'remove':
    case 'remove-all':
    case 'remove-history':
    case 'remove-cookies':
    case 'remove-cache':
    case 'remove-local-storage':
    case 'remove-passwords':
    case 'history':
    case 'downloads':
    case 'extensions':
    case 'settings':
    case 'manage-data':
    case 'search':
      await executeAction(message);
      return { ok: true };

    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then((result) => sendResponse(result ?? {}))
    .catch((err) => {
      console.error('[Midori Omni background] Error handling message:', message.request, err);
      sendResponse({ error: String(err) });
    });
  return true; // keep port open for async response
});

// ─── Keyboard shortcut & toolbar click ──────────────────────────────────────
async function openOmniInTab(tab) {
  if (!tab) return;
  const url = tab.url || '';
  // Can't send to privileged system pages
  if (isRestrictedOmniUrl(url)) {
    // Fallback: open a new tab (the new tab IS the omni launcher)
    chrome.tabs.create({});
    return;
  }

  try {
    await ensureOmniContentScript(tab.id);
    await callChrome(chrome.tabs.sendMessage.bind(chrome.tabs), tab.id, { request: 'open-omni' });
  } catch (_) {
    chrome.tabs.create({});
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-omni') {
    const tab = await getCurrentTab();
    await openOmniInTab(tab);
  }
});

const toolbarActionApi = chrome.action || chrome.browserAction;

if (toolbarActionApi?.onClicked) {
  toolbarActionApi.onClicked.addListener(async (tab) => {
    await openOmniInTab(tab);
  });
}

// ─── Install lifecycle ──────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install' || details.reason === 'update') {
    await ensureTabsCache().catch(() => undefined);
    await ensureStaticActions().catch(() => undefined);
  }
});

// Eager initialise caches on service worker start
ensureTabsCache().catch(console.error);
ensureStaticActions().catch(console.error);
