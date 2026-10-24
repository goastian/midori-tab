import { stableId } from './itemIds.js';

/**
 * Three-way merge helpers for editable lists. `base` is the version this document
 * last read or wrote, `local` what the user sees now and `remote` what another New Tab saved.
 */

export function deepEqual(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every(key => Object.hasOwn(right, key) && deepEqual(left[key], right[key]));
}

const REVISION_FIELDS = ['rev', 'updatedAt'];

export function contentEqual(left, right, ignored = []) {
  const skip = new Set([...REVISION_FIELDS, ...ignored]);
  const strip = item => Object.fromEntries(Object.entries(item || {}).filter(([key]) => !skip.has(key)));
  return deepEqual(strip(left), strip(right));
}

function conflictCopy(remote) {
  const seen = new Map();
  return { ...remote, id: stableId('c', `${remote.id}\n${JSON.stringify(remote)}`, seen), conflictOf: remote.id };
}

/**
 * Merges arrays of objects that carry a stable `id`.
 * - Changes made by only one side are kept; an edit beats a delete on the other side.
 * - When both sides edited the same item differently the local edit stays in place and the other
 *   version is kept as a conflict copy (`conflictOf`) right after it.
 * options.same(a, b): content equality (default ignores rev and updatedAt)
 * options.settle(chosen, local, remote): lets a caller reconcile volatile fields
 */
export function mergeById(base = [], local = [], remote = [], options = {}) {
  const same = options.same || ((a, b) => contentEqual(a, b));
  const settle = options.settle || (item => item);
  const copy = options.copy || conflictCopy;
  const byId = list => new Map(list.map(item => [item.id, item]));
  const baseById = byId(base);
  const localById = byId(local);
  const remoteById = byId(remote);
  const result = [];
  const conflicts = [];

  for (const theirs of remote) {
    const mine = localById.get(theirs.id);
    const original = baseById.get(theirs.id);
    if (!mine) {
      if (!original || !same(original, theirs)) result.push(theirs);
      continue;
    }
    const localChanged = !original || !same(original, mine);
    const remoteChanged = !original || !same(original, theirs);
    if (!localChanged) result.push(settle(theirs, mine, theirs));
    else if (!remoteChanged || same(mine, theirs)) result.push(settle(mine, mine, theirs));
    else {
      result.push(settle(mine, mine, theirs));
      const duplicate = copy(theirs);
      if (!remote.some(item => item.id === duplicate.id)) { result.push(duplicate); conflicts.push(duplicate.id); }
    }
  }

  let anchor = -1;
  for (const mine of local) {
    const position = result.findIndex(item => item.id === mine.id);
    if (position >= 0) { anchor = position; continue; }
    if (remoteById.has(mine.id)) continue;
    const original = baseById.get(mine.id);
    if (original && same(original, mine)) continue;
    anchor += 1;
    result.splice(anchor, 0, mine);
  }
  return { value: result, conflicts };
}

/** Unions the conflict copies kept inside a single record such as a note. */
function unionCopies(...lists) {
  const seen = new Set();
  return lists.flat().filter(copy => copy && !seen.has(copy.text) && seen.add(copy.text)).slice(0, 5);
}

/**
 * Merges a single-text record: `{ id, text, rev, updatedAt, conflicts }`. Dismissing or swapping a
 * kept copy in one tab reaches the others; copies from edits made on both sides are added together.
 */
export function mergeNote(base, local, remote) {
  const same = (left, right) => left.text === right.text && deepEqual(left.conflicts || [], right.conflicts || []);
  if (same(base, remote)) return { value: local, conflicts: [] };
  if (same(base, local) || same(local, remote)) return { value: remote, conflicts: [] };
  const copies = unionCopies(local.conflicts || [], remote.conflicts || []);
  if (local.text === remote.text) {
    return { value: { ...remote, conflicts: copies.filter(copy => copy.text !== remote.text) }, conflicts: [] };
  }
  const withRemote = unionCopies(copies, [{ text: remote.text, at: remote.updatedAt || Date.now() }]);
  return { value: { ...local, conflicts: withRemote }, conflicts: [remote.id] };
}
