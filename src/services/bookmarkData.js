import { stableId } from './itemIds.js';

/** Gives shortcuts saved before ids existed a stable id. Content and order stay as saved. */
export function normalizeBookmarkList(raw, category, seen = new Map()) {
  return (Array.isArray(raw) ? raw : []).filter(entry => entry && typeof entry === 'object').map(entry => ({
    ...entry,
    id: (typeof entry.id === 'string' && entry.id !== '') ? entry.id : stableId('b', `${category}|${entry.url}`, seen),
    rev: Number(entry.rev) || 1,
  }));
}

export function normalizeBookmarks(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const seen = new Map();
  return Object.fromEntries(Object.entries(raw).map(([category, list]) => [category, normalizeBookmarkList(list, category, seen)]));
}
