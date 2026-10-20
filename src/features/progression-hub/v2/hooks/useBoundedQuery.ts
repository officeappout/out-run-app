'use client';

/**
 * One-shot read with a short in-memory cache (progress tab v2).
 *
 * - `enabled=false` → nothing is read (a tab that was never opened costs 0).
 * - Results are kept per `key` for CACHE_MS, so flipping week/month or
 *   switching activity tabs back and forth doesn't re-read Firestore.
 * - No listeners: a late result after unmount is simply dropped.
 */
import { useEffect, useState } from 'react';

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; value: unknown }>();

export interface BoundedQueryState<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
}

export function useBoundedQuery<T>(key: string | null, fetcher: () => Promise<T>, enabled = true): BoundedQueryState<T> {
  const hit = key ? cache.get(key) : undefined;
  const fresh = hit && Date.now() - hit.at < CACHE_MS ? (hit.value as T) : null;
  const [state, setState] = useState<BoundedQueryState<T> & { key: string | null }>({
    key,
    data: fresh,
    loading: !fresh && enabled && !!key,
    error: false,
  });

  useEffect(() => {
    if (!key || !enabled) return;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      setState({ key, data: cached.value as T, loading: false, error: false });
      return;
    }
    let alive = true;
    setState({ key, data: null, loading: true, error: false });
    fetcher()
      .then((value) => {
        cache.set(key, { at: Date.now(), value });
        if (alive) setState({ key, data: value, loading: false, error: false });
      })
      .catch((e) => {
        console.warn('[progress] read failed', key, e);
        if (alive) setState({ key, data: null, loading: false, error: true });
      });
    return () => {
      alive = false;
    };
    // fetcher is recreated every render; the key fully describes the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  // A key change renders once before the effect runs: never hand out the
  // previous key's data for the new key.
  if (state.key !== key) {
    return { data: fresh, loading: !fresh && enabled && !!key, error: false };
  }
  return { data: state.data, loading: state.loading, error: state.error };
}

/** Test helper. */
export function clearProgressQueryCache(): void {
  cache.clear();
}
