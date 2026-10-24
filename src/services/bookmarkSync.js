import { getJson } from './StorageService.js';
import { mergeById } from './listMerge.js';
import { normalizeBookmarks } from './bookmarkData.js';
import { writeBookmarkSnapshot } from '../bootstrap/bookmarkSnapshot.js';

/**
 * Cross-tab merging and undo for the speed dial grid. The grid imports this file only when another
 * New Tab saves or the user deletes something, so none of it is part of startup.
 */

const STORAGE_KEY = 'midori_bookmarks';
const CATEGORIES_KEY = 'midori_bookmark_categories';
const named = names => names.map(id => ({ id }));

/** Order-independent text for comparing two bookmark states. */
export function fingerprint({ bookmarks, categories }) {
  return JSON.stringify([categories, categories.map(name => bookmarks[name] || [])]);
}

/**
 * Merges the two persisted keys as one state: { bookmarks: { name: items }, categories: names }.
 */
export function mergeBookmarkState(base, local, remote) {
  const categories = mergeById(named(base.categories), named(local.categories), named(remote.categories)).value.map(item => item.id);
  const bookmarks = {};
  const conflicts = [];
  for (const name of categories) {
    const merged = mergeById(base.bookmarks[name], local.bookmarks[name], remote.bookmarks[name]);
    bookmarks[name] = merged.value;
    conflicts.push(...merged.conflicts);
  }
  return { state: { bookmarks, categories }, conflicts };
}

/**
 * Merges what another New Tab saved into the grid without discarding the edits made here, one run
 * at a time. If the merge cannot run, a pending edit is still saved.
 */
export function requestSync(grid, mirrorAt) {
  clearTimeout(grid.remoteSyncTimer);
  grid.remoteSyncTimer = setTimeout(() => { void run(grid, mirrorAt); }, 40);
}

async function run(grid, mirrorAt) {
  if (!grid.bookmarksReady || grid.faviconsDisposed) return;
  if (grid.remoteSyncing) { grid.remoteSyncAgain = true; return; }
  grid.remoteSyncing = true;
  let merged = false;
  try {
    merged = await syncBookmarks(grid, mirrorAt);
  } catch (error) {
    console.warn('[Midori] Could not merge bookmarks saved by another tab', error);
  } finally {
    grid.remoteSyncing = false;
    if (!merged && grid.bookmarkSavePending) {
      grid.syncedAt = mirrorAt();
      grid.saveBookmarksDebounced();
    }
    if (grid.remoteSyncAgain) { grid.remoteSyncAgain = false; requestSync(grid, mirrorAt); }
  }
}

async function syncBookmarks(grid, mirrorAt) {
  const [rawBookmarks, rawCategories] = await Promise.all([getJson(STORAGE_KEY, null), getJson(CATEGORIES_KEY, null)]);
  if (grid.faviconsDisposed || !rawBookmarks || !Array.isArray(rawCategories)) return false;
  const remote = { bookmarks: normalizeBookmarks(rawBookmarks), categories: rawCategories.filter(name => typeof name === 'string' && name.trim()) };
  const local = grid.bookmarkState();
  const { state } = mergeBookmarkState(grid.syncedState, local, remote);
  if (!state.categories.length) return false;
  grid.syncedState = remote;
  grid.syncedAt = mirrorAt();
  const merged = fingerprint(state);
  if (merged !== fingerprint(local)) {
    grid.bookmarks = state.bookmarks;
    grid.categories = state.categories;
    if (!grid.categories.includes(grid.activeTab)) grid.activeTab = grid.categories[0];
    writeBookmarkSnapshot(grid.categories, grid.activeTab, grid.currentBookmarks);
  }
  // A queued save carries the local state; replace it unless the merge left that state unchanged.
  const needsSave = merged !== fingerprint(grid.bookmarkSavePending ? local : remote);
  if (needsSave) grid.saveBookmarksDebounced();
  return true;
}

export function restoreBookmark(grid, category, bookmark, index) {
  if (!grid.bookmarksReady || !grid.categories.includes(category)) return;
  if (!grid.bookmarks[category]) grid.bookmarks[category] = [];
  const list = grid.bookmarks[category];
  if (list.some(item => item.id === bookmark.id)) return;
  list.splice(Math.min(index, list.length), 0, bookmark);
  grid.activeTab = category;
  grid.saveBookmarksDebounced();
}

export function restoreCategory(grid, category, items, index) {
  if (!grid.bookmarksReady || grid.categories.includes(category)) return;
  grid.categories.splice(Math.min(index, grid.categories.length), 0, category);
  grid.bookmarks[category] = items;
  grid.activeTab = category;
  grid.saveBookmarksDebounced();
}

/** Makes a deletion undoable; the undo buffer is created with the first one. */
export async function remember(grid, label, restore) {
  grid.undoBuffer ||= (await import('./undoBuffer.js')).createUndoBuffer(entry => { grid.undo = entry; });
  grid.undoBuffer.push({ label, restore });
}
