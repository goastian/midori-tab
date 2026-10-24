export const UNDO_WINDOW_MS = 8000;

/**
 * Keeps the last deletions restorable for a fixed window after the most recent one. Each entry is
 * { label, restore }; onChange receives { label, count, undo, dismiss } for the newest entry, or null when empty.
 */
export function createUndoBuffer(onChange, { windowMs = UNDO_WINDOW_MS, limit = 5 } = {}) {
  const entries = [];
  let timer = null;
  const publish = () => onChange(entries.length ? { label: entries.at(-1).label, count: entries.length, undo, dismiss: clear } : null);
  const arm = () => {
    clearTimeout(timer);
    timer = entries.length ? setTimeout(clear, windowMs) : null;
  };
  function clear() {
    entries.length = 0;
    arm();
    publish();
  }
  function undo() {
    const entry = entries.pop();
    arm();
    publish();
    if (!entry) return false;
    entry.restore();
    return true;
  }
  return {
    push(entry) {
      entries.push(entry);
      if (entries.length > limit) entries.shift();
      arm();
      publish();
    },
    /** Restores the newest deletion; returns false when nothing is left. */
    undo,
    clear,
  };
}
