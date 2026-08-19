/**
 * Tiny in-memory client cache for snappy navigation.
 * Survives client remounts within the same JS session.
 */

type Entry<T> = { value: T; expiresAt: number };

const g = globalThis as unknown as {
  __menuMatchClientCache?: Map<string, Entry<unknown>>;
};

function store() {
  if (!g.__menuMatchClientCache) {
    g.__menuMatchClientCache = new Map();
  }
  return g.__menuMatchClientCache;
}

export function getCache<T>(key: string): T | undefined {
  const e = store().get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store().delete(key);
    return undefined;
  }
  return e.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs = 5 * 60_000) {
  store().set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    store().clear();
    return;
  }
  for (const k of store().keys()) {
    if (k.startsWith(prefix)) store().delete(k);
  }
}

/** Return cached value immediately; always revalidate in background. */
export async function revalidateCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { ttlMs?: number }
): Promise<{ data: T; fromCache: boolean }> {
  const ttl = opts?.ttlMs ?? 5 * 60_000;
  const cached = getCache<T>(key);
  if (cached !== undefined) {
    // background refresh
    void fetcher()
      .then((fresh) => setCache(key, fresh, ttl))
      .catch(() => {
        /* keep stale */
      });
    return { data: cached, fromCache: true };
  }
  const data = await fetcher();
  setCache(key, data, ttl);
  return { data, fromCache: false };
}
