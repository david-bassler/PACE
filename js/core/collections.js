/**
 * Merge two collections by stable ID and keep the newest representation.
 *
 * Remote items are inserted first and local items second so equal timestamps
 * keep the local version. This preserves PACE's existing offline-first merge
 * behaviour while centralising the rule in one place.
 */
export function mergeUpdatedById(local = [], remote = [], {
  id = item => item?.id,
  updatedAt = item => item?.updatedAt || ''
} = {}) {
  const map = new Map();

  for (const item of [...remote, ...local]) {
    const key = id(item);
    if (!key) continue;

    const previous = map.get(key);
    if (!previous || String(updatedAt(item)) >= String(updatedAt(previous))) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

export function indexById(items = []) {
  return new Map(items.filter(item => item?.id).map(item => [item.id, item]));
}
