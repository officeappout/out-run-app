/**
 * persistentTtlCache — a TTL cache for ONE async fetcher, two layers deep:
 *   1. in-memory (per JS context — survives client-side navigation), and
 *   2. an optional async persistent store (IndexedDB in the app — survives reloads and
 *      app restarts), consulted only when memory is empty/stale.
 *
 * Semantics (all covered by src/lib/__tests__/persistentTtlCache.test.ts):
 *   - an entry younger than `ttlMs` (memory first, then the store) is served without fetching;
 *   - concurrent callers during a load share ONE in-flight promise (one Firestore read);
 *   - a failed fetch is NOT cached — the error propagates and the next call retries;
 *   - store failures (private mode, quota, no IndexedDB, SSR) are swallowed — it degrades
 *     to memory-only, never to an error;
 *   - `invalidate()` drops memory + the stored record AND fences any load already in flight,
 *     so a fetch that started before the invalidation can never repopulate the cache with
 *     pre-edit data;
 *   - every `get()` returns `clone(value)` (default: structuredClone) so callers keep the
 *     "fresh objects every call" contract of an uncached read — a caller that mutates what
 *     it got can't corrupt the shared copy.
 */
export interface CacheRecord<T> {
  /** epoch ms the value was fetched */
  at: number;
  value: T;
}

export interface AsyncRecordStore<T> {
  read(): Promise<CacheRecord<T> | null>;
  write(record: CacheRecord<T>): Promise<void>;
  clear(): Promise<void>;
}

export interface PersistentTtlCacheOptions<T> {
  fetcher: () => Promise<T>;
  ttlMs: number;
  /** Optional persistent layer; null/undefined = memory only. */
  store?: AsyncRecordStore<T> | null;
  now?: () => number;
  /** Copy applied to every value handed to a caller. */
  clone?: (value: T) => T;
}

export interface PersistentTtlCache<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function defaultClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through (non-cloneable value) */ }
  }
  return Array.isArray(value) ? ([...value] as unknown as T) : value;
}

export function createPersistentTtlCache<T>(opts: PersistentTtlCacheOptions<T>): PersistentTtlCache<T> {
  const { fetcher, ttlMs, store = null } = opts;
  const now = opts.now ?? Date.now;
  const clone = opts.clone ?? defaultClone;

  let memory: CacheRecord<T> | null = null;
  let inflight: Promise<T> | null = null;
  let generation = 0;
  // A store.clear() still pending from invalidate() — loads wait for it so they can't read
  // the record the invalidation is deleting.
  let clearing: Promise<void> | null = null;

  const isFresh = (rec: CacheRecord<T> | null | undefined): rec is CacheRecord<T> => {
    if (!rec || typeof rec.at !== 'number') return false;
    const age = now() - rec.at;
    return age >= 0 && age < ttlMs;
  };

  async function load(gen: number): Promise<T> {
    if (store) {
      if (clearing) await clearing;
      let stored: CacheRecord<T> | null = null;
      try { stored = await store.read(); } catch { stored = null; }
      if (isFresh(stored) && gen === generation) {
        memory = stored;
        return stored.value;
      }
    }
    const value = await fetcher();
    if (gen === generation) {
      memory = { at: now(), value };
      if (store) store.write(memory).catch(() => { /* non-fatal */ });
    }
    return value;
  }

  return {
    get(): Promise<T> {
      if (isFresh(memory)) return Promise.resolve(clone(memory.value));
      if (!inflight) {
        const p: Promise<T> = load(generation).finally(() => {
          if (inflight === p) inflight = null;
        });
        inflight = p;
      }
      return inflight.then(clone);
    },
    invalidate(): void {
      generation += 1;
      memory = null;
      inflight = null;
      if (store) {
        const c: Promise<void> = store.clear()
          .catch(() => { /* non-fatal */ })
          .finally(() => { if (clearing === c) clearing = null; });
        clearing = c;
      }
    },
  };
}
