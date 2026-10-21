/**
 * requestGovernor — two small keyed registries for coordinating async work
 * that can race itself: a newer call superseding a stale in-flight one, or
 * multiple concurrent callers wanting the same result.
 *
 * Not a novel abstraction — this generalizes two patterns already proven
 * live in this codebase into reusable, keyed versions:
 *   - `withCoalesce` generalizes `parks.service.ts`'s `_inflightParksFetch`
 *     (single hardcoded slot) and `DiscoverLayer.tsx`'s `hybridTrioInflight`
 *     (already keyed) — concurrent callers for the same key share one
 *     in-flight promise instead of firing duplicate work.
 *   - `withCancelPrevious` generalizes `CommunityAddressSearch.tsx`'s local
 *     `abortRef` pattern — a new call for a key aborts whatever's still
 *     pending for that key, via a real `AbortController`, not just a
 *     discard-the-stale-result flag.
 *
 * See .claude/plans/cryptic-munching-gadget.md for the call sites this was
 * built for (Mapbox Directions/geocoding calls that can race user input).
 */

// ── Coalesce: concurrent callers for the same key share one promise ────────
// Caller is responsible for key uniqueness per type — the registry is untyped
// (Promise<unknown>) since one Map holds every key's promise regardless of T.
// The same key used with two different T's is undefined behaviour; give each
// distinct kind of work its own key namespace (e.g. `geo:${lat},${lng}`).
const coalesceRegistry = new Map<string, Promise<unknown>>();

export function withCoalesce<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = coalesceRegistry.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    if (coalesceRegistry.get(key) === promise) coalesceRegistry.delete(key);
  });
  coalesceRegistry.set(key, promise);
  return promise;
}

// ── Cancel-previous: a new call for a key aborts the stale in-flight one ───
const cancelRegistry = new Map<string, AbortController>();

export function withCancelPrevious<T>(
  key: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  cancelRegistry.get(key)?.abort();

  const controller = new AbortController();
  cancelRegistry.set(key, controller);

  return fn(controller.signal).finally(() => {
    if (cancelRegistry.get(key) === controller) cancelRegistry.delete(key);
  });
}
