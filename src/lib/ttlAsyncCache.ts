/**
 * ttlAsyncCache — a tiny in-memory TTL cache for ONE async fetcher, with in-flight dedupe.
 *
 * Used for the full-collection catalog reads (exercises, gym equipment) that the route_stops
 * compose used to re-read from Firestore on every run. Semantics:
 *   - fresh entry (younger than `ttlMs`) → returned without calling the fetcher;
 *   - concurrent callers during a fetch share ONE in-flight promise;
 *   - a failed fetch is NOT cached (the next call retries) and clears the in-flight slot;
 *   - `invalidate()` drops the entry so the next call re-fetches.
 * The cached value is returned by reference — callers that might reorder/mutate should copy.
 */
export interface TtlAsyncCache<T> {
  get(): Promise<T>;
  invalidate(): void;
}

export function createTtlAsyncCache<T>(
  fetcher: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): TtlAsyncCache<T> {
  let entry: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      if (entry && now() - entry.at < ttlMs) return Promise.resolve(entry.value);
      if (inflight) return inflight;
      const p: Promise<T> = fetcher()
        .then((value) => {
          entry = { at: now(), value };
          return value;
        })
        .finally(() => {
          if (inflight === p) inflight = null;
        });
      inflight = p;
      return p;
    },
    invalidate(): void {
      entry = null;
    },
  };
}
