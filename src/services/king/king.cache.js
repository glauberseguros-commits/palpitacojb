export const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export function cacheGet(map, key) {
  const entry = map.get(key);
  if (!entry) return null;

  const ts = Number(entry?.ts || 0);
  if (!Number.isFinite(ts) || Date.now() - ts > CACHE_TTL_MS) {
    map.delete(key);
    return null;
  }

  return entry.data ?? null;
}

export function cacheSet(map, key, data) {
  map.set(key, { ts: Date.now(), data });
}
