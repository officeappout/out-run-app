/**
 * Our mapped routes near a loop start, from the EXISTING authorized readers
 * only (no new route-collection queries — scripts/safety-check.sh):
 *   - getCachedOfficialRoutes() (inventory.service) — the map's own published
 *     official_routes set, already in memory once the map has loaded;
 *   - fetchPublishedCorridorsForCity (route-generator.service, passed in by the
 *     caller to avoid an import cycle) — published official_routes of the
 *     user's city, for cities beyond the map set's 200-doc cap.
 * curated_routes: the only existing reader is per-authority
 * (fetchCuratedRoutesByAuthority) and loop requests carry no authority id —
 * phase 2 (a geo/city reader through the route-collections chokepoint).
 *
 * Each source is cached for SOURCE_TTL_MS, so regenerating at the same spot
 * reads nothing. Any failure → that source contributes nothing (fail-soft).
 * The whole load is bounded by a wait (prepareOurRoutes) so it never holds a
 * generation up for long.
 */
import { buildOurRoutesIndex, ourRoutesNear, type LngLat, type OurRouteLine, type OurRoutesIndex } from '@/lib/route-quality';

export type OurRoutesFetcher = () => Promise<OurRouteLine[]>;

const SOURCE_TTL_MS = 15 * 60 * 1000;
/** How long a generation waits for our routes before going on without them. */
export const OUR_ROUTES_WAIT_MS = 1200;

const cache = new Map<string, { at: number; lines: Promise<OurRouteLine[]> }>();

/** Test hook. */
export function clearOurRoutesCache(): void { cache.clear(); }

function cached(key: string, fetcher: OurRoutesFetcher): Promise<OurRouteLine[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < SOURCE_TTL_MS) return hit.lines;
  const lines = fetcher().catch(() => [] as OurRouteLine[]);
  cache.set(key, { at: Date.now(), lines });
  // A failed / empty read is not kept for the full TTL.
  lines.then(l => { if (l.length === 0) cache.delete(key); });
  return lines;
}

/** Route-like docs ({ id, path: [lng, lat][] }) → lines. */
export function toOurRouteLines(routes: Array<{ id: string; path?: unknown; name?: string }>, kind: OurRouteLine['kind']): OurRouteLine[] {
  const out: OurRouteLine[] = [];
  for (const r of routes) {
    if (!r?.id || !Array.isArray(r.path)) continue;
    const path = (r.path as unknown[]).filter((p): p is LngLat => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (path.length >= 2) out.push({ id: r.id, path, kind, ...(r.name ? { name: r.name } : {}) });
  }
  return out;
}

/** The map's cached official set (zero reads once the map has loaded it). */
export const mapOfficialRoutesFetcher: OurRoutesFetcher = async () => {
  const { getCachedOfficialRoutes } = await import('../inventory.service');
  return toOurRouteLines(await getCachedOfficialRoutes(), 'official');
};

export async function loadOurRoutesNear(
  center: { lat: number; lng: number },
  radiusKm: number,
  sources: Record<string, OurRoutesFetcher>,
): Promise<OurRouteLine[]> {
  const all = await Promise.all(Object.entries(sources).map(([k, f]) => cached(k, f)));
  const byId = new Map<string, OurRouteLine>();
  for (const lines of all) for (const l of lines) if (!byId.has(l.id)) byId.set(l.id, l);
  return ourRoutesNear(Array.from(byId.values()), [center.lng, center.lat], radiusKm * 1000);
}

export interface OurRoutesContext {
  lines: OurRouteLine[];
  index: OurRoutesIndex | null;
}

const EMPTY: OurRoutesContext = { lines: [], index: null };

/** Lines + scoring index, or empty once OUR_ROUTES_WAIT_MS passes. */
export async function prepareOurRoutes(
  center: { lat: number; lng: number },
  radiusKm: number,
  sources: Record<string, OurRoutesFetcher>,
  waitMs = OUR_ROUTES_WAIT_MS,
): Promise<OurRoutesContext> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<OurRoutesContext>(r => { timer = setTimeout(() => r(EMPTY), waitMs); });
  const load = loadOurRoutesNear(center, radiusKm, sources)
    .then(lines => ({ lines, index: buildOurRoutesIndex(lines, [center.lng, center.lat]) }))
    .catch(() => EMPTY);
  const out = await Promise.race([load, timeout]);
  clearTimeout(timer);
  return out;
}
