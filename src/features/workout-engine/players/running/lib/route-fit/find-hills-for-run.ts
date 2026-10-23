/**
 * findHillsForRun — the I/O edge of the hill finder (enable_hill_finder_v1).
 * Gathers the two sources and hands them to the pure findHillsNear:
 *   • published climb_segments around the origin — a geohash range read
 *     (same geofire-common pattern inventory.service uses for street_segments;
 *     single-field index, no composite), status filtered here, capped per bound;
 *   • the EXISTING in-memory official-routes cache (getCachedOfficialRoutes —
 *     no new read) for climbs on their stored elevationProfile.
 * Either source failing just drops it — never throws. Reads only.
 *
 * I/O is injected (deps) so the wiring is unit-tested without Firebase.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import {
  findHillsNear, HILL_FINDER_RADIUS_KM, type FindHillsOptions, type HillCandidate, type HillClimbSegmentInput,
  type HillLatLng, type HillRouteInput,
} from './hill-finder';
import type { HillRepSpec } from './types';

export interface FindHillsDeps {
  getClimbsNear: (origin: HillLatLng, radiusM: number) => Promise<HillClimbSegmentInput[]>;
  getOfficialRoutes: () => Promise<Route[]>;
}

/** Docs read per geohash bound at most — a dense city never turns this into a big scan. */
const PER_BOUND_LIMIT = 150;

const defaultDeps: FindHillsDeps = {
  async getClimbsNear(origin, radiusM) {
    const [{ db }, { collection, endAt, getDocs, limit, orderBy, query, startAt }, { geohashQueryBounds }] = await Promise.all([
      import('@/lib/firebase'),
      import('firebase/firestore'),
      import('geofire-common'),
    ]);
    const bounds = geohashQueryBounds([origin.lat, origin.lng], radiusM);
    const snaps = await Promise.all(bounds.map(([start, end]) =>
      getDocs(query(collection(db, 'climb_segments'), orderBy('geohash'), startAt(start), endAt(end), limit(PER_BOUND_LIMIT)))));
    const seen = new Set<string>();
    const out: HillClimbSegmentInput[] = [];
    for (const snap of snaps) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const data = d.data() as Partial<HillClimbSegmentInput>;
        if (data?.status !== 'published') continue;
        out.push({
          id: d.id,
          type: data.type ?? 'terrain',
          status: 'published',
          geometry: Array.isArray(data.geometry) ? data.geometry : [],
          lengthM: typeof data.lengthM === 'number' ? data.lengthM : 0,
          avgGrade: typeof data.avgGrade === 'number' ? data.avgGrade : null,
          dir: data.dir ?? null,
          wayName: data.wayName ?? null,
          center: data.center,
        });
      }
    }
    return out;
  },
  async getOfficialRoutes() {
    const { getCachedOfficialRoutes } = await import('@/features/parks/core/services/inventory.service');
    return getCachedOfficialRoutes();
  },
};

export async function findHillsForRun(
  origin: HillLatLng,
  spec: HillRepSpec,
  opts: FindHillsOptions & { deps?: Partial<FindHillsDeps> } = {},
): Promise<HillCandidate[]> {
  const deps = { ...defaultDeps, ...opts.deps };
  const radiusKm = opts.radiusKm ?? HILL_FINDER_RADIUS_KM;
  const [climbs, routes] = await Promise.all([
    deps.getClimbsNear(origin, radiusKm * 1000).catch((err) => {
      console.warn('[hill-finder] climb_segments unavailable', err);
      return [] as HillClimbSegmentInput[];
    }),
    deps.getOfficialRoutes().catch((err) => {
      console.warn('[hill-finder] official routes unavailable', err);
      return [] as Route[];
    }),
  ]);
  return findHillsNear(origin, spec, { climbs, routes: routes as unknown as HillRouteInput[] }, { radiusKm, limit: opts.limit });
}
