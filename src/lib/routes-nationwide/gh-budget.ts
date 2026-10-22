/**
 * A GraphHopper client with a hard per-authority call budget and a response
 * cache (RC8). The nationwide runner shares ONE budget between the park-loop
 * inner loops and the neighbourhood loops of an authority, so a city never
 * costs more than `maxCalls` live requests; a re-run (resume, a second
 * dry-run, the owner's --apply after a dry-run) is served from the cache and
 * costs nothing. Pure: the cache store is injected (a JSON file in the run's
 * out dir for the script, a Map in tests).
 */
import type { GhRouteRequest, GraphHopperClient, RoutedPath } from '../routing/graphhopper';

export interface GhCacheStore {
  get(key: string): RoutedPath | null | undefined;
  set(key: string, value: RoutedPath | null): void;
}

export interface GhBudgetStats {
  /** Live requests sent (cache misses). */
  calls: number;
  cacheHits: number;
  /** Requests refused because the budget was spent. */
  refused: number;
  errors: number;
}

export class GhBudgetExhausted extends Error {
  constructor(max: number) {
    super(`GraphHopper call budget (${max}) spent for this authority`);
    this.name = 'GhBudgetExhausted';
  }
}

/** Stable key: the request body with sorted keys (same body → same answer). */
export function ghCacheKey(body: GhRouteRequest): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sort)
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])]))
        : v;
  return JSON.stringify(sort(body));
}

export function mapCacheStore(map = new Map<string, RoutedPath | null>()): GhCacheStore {
  return { get: (k) => map.get(k), set: (k, v) => void map.set(k, v) };
}

export function budgetedClient(base: GraphHopperClient, opts: { maxCalls: number; cache?: GhCacheStore | null }): { client: GraphHopperClient; stats: () => GhBudgetStats } {
  const s: GhBudgetStats = { calls: 0, cacheHits: 0, refused: 0, errors: 0 };
  const client: GraphHopperClient = {
    async route(body, signal) {
      const key = opts.cache ? ghCacheKey(body) : '';
      const hit = opts.cache?.get(key);
      if (hit !== undefined) { s.cacheHits++; return hit; }
      if (s.calls >= opts.maxCalls) { s.refused++; throw new GhBudgetExhausted(opts.maxCalls); }
      s.calls++;
      try {
        const r = await base.route(body, signal);
        opts.cache?.set(key, r);
        return r;
      } catch (e) {
        s.errors++;
        throw e;
      }
    },
  };
  return { client, stats: () => ({ ...s }) };
}
