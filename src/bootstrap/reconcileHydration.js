function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function reconcileHydration(initial, current, loaded) {
  if (same(initial, current)) return loaded;

  if (Array.isArray(initial) && Array.isArray(current) && Array.isArray(loaded)
    && [...initial, ...current, ...loaded].every(item => isObject(item) && item.id)) {
    const before = new Map(initial.map(item => [item.id, item]));
    const edited = new Map(current.map(item => [item.id, item]));
    const merged = [];
    for (const item of loaded) {
      if (before.has(item.id) && !edited.has(item.id)) continue;
      if (edited.has(item.id)) {
        merged.push(reconcileHydration(before.get(item.id), edited.get(item.id), item));
        edited.delete(item.id);
      } else {
        merged.push(item);
      }
    }
    for (const item of edited.values()) {
      if (!before.has(item.id) || !same(before.get(item.id), item)) merged.push(item);
    }
    return merged;
  }

  if (isObject(initial) && isObject(current) && isObject(loaded)) {
    const merged = { ...loaded };
    for (const key of new Set([...Object.keys(initial), ...Object.keys(current)])) {
      if (!(key in current)) {
        if (key in initial) delete merged[key];
      } else if (!(key in initial)) {
        merged[key] = current[key];
      } else {
        merged[key] = reconcileHydration(initial[key], current[key], loaded[key]);
      }
    }
    return merged;
  }

  return current;
}

export function snapshotHydration(value) {
  return JSON.parse(JSON.stringify(value));
}
