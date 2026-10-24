/** Stable identity for editable items, independent of their position in a list. */

export function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function hash(text) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return (value >>> 0).toString(36);
}

/**
 * Deterministic id for data saved before ids existed, so two tabs that migrate the same list at
 * the same time agree on every id. `seen` disambiguates repeated content.
 */
export function stableId(prefix, content, seen) {
  const base = `${prefix}_${hash(content)}`;
  const count = seen.get(base) || 0;
  seen.set(base, count + 1);
  return count ? `${base}_${count}` : base;
}

/** Marks an edited item: its revision grows and it remembers when. */
export function touchItem(item) {
  return { ...item, rev: (Number(item.rev) || 0) + 1, updatedAt: Date.now() };
}
