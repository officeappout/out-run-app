/**
 * cache.server — a tiny per-instance memo for heavy admin reads (plan §2.6: 10 minutes for
 * tools that read whole collections). Time-based on purpose and safe for it: results are
 * read-only aggregates for an assistant answer, never an input to a write or a permission
 * (axiom §28's warning is about caches whose payload gates behavior). `fresh: true` bypasses.
 * Failed computations are not cached.
 */
import 'server-only';

export const HEAVY_TOOL_TTL_MS = 10 * 60 * 1000;
export const LIGHT_TOOL_TTL_MS = 60 * 1000;

const store = new Map<string, { at: number; value: unknown }>();
const MAX_ENTRIES = 200;

export async function cachedCompute<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
  opts: { fresh?: boolean; now?: number } = {},
): Promise<T> {
  const now = opts.now ?? Date.now();
  const hit = store.get(key);
  if (!opts.fresh && hit && now - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  store.set(key, { at: now, value });
  return value;
}

/** Tests only. */
export function clearAnalyticsCache(): void {
  store.clear();
}
