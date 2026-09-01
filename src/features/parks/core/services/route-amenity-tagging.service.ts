/**
 * route-amenity-tagging.service.ts — Phase 3 of the route↔amenity tagging
 * plan (David-approved 01.09.2026): the `osm_amenities` ↔ `official_routes`
 * spatial join.
 *
 * Deliberately I/O-free, same discipline as route-adjacency.service.ts /
 * route-enrichment.service.ts (this directory's own precedent) — every
 * export here takes plain in-memory structs, never touches Firestore. The
 * Firestore-facing fetch/write step lives in scripts/tag-route-amenities.ts.
 *
 * Built as a FRESH, standalone pipeline rather than extending
 * route-enrichment.service.ts / InventoryService.recomputeRouteEnrichmentForCity
 * — investigation before this build found that pipeline's route-side output
 * (`Route.terrainFeatures`) has never actually landed in production (0/158
 * routes, live-checked 01.09.2026) and its climb-side cross-refs
 * (`climb_segments.routeIds`) point at route ids that no longer exist. Its
 * flag (`IS_ROUTE_ENRICHMENT_ORCHESTRATOR_ENABLED`) is also off in prod. Only
 * its GEOMETRY PRIMITIVE (`findNearestContactPoint`) is reused below — not
 * its orchestration, its flag, or any assumption that its existing output is
 * trustworthy.
 *
 * HONESTY RULE (do not relax): a route's `qualitySignals.amenities.status`
 * is `'no_coverage'` when its city has ZERO `osm_amenities` docs of any
 * status — meaning the ingester was never run there. It is `'computed'`
 * once the city has ANY coverage, and every count from then on (including a
 * real `0`) reflects an actual check. A route must never show a false "no
 * benches" just because coverage doesn't exist yet.
 *
 * SOURCING (David-approved 01.09.2026): amenities with `status` `'pending'`
 * OR `'published'` are included; `'rejected'` is excluded. OSM amenity
 * points are reliable factual data on their own — gating on moderation
 * status (`'published'` only) would leave this feature empty today (Haifa's
 * osm_amenities is >90% `'pending'` for every category except crossing, live-
 * checked 01.09.2026). `sourceStatuses` on the summary records this choice
 * so it's transparent and auditable, not silently baked in.
 */
import type { AmenityCategory, CourtSport } from '../types/osm-amenity.types';
import type { Route, RouteAmenityRef } from '../types/route.types';
import { findNearestContactPoint } from './route-adjacency.service';

/**
 * Per-category max distance from an amenity's point to the route's path for
 * it to count as "on the route." Tighter than CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS
 * (40m, route-enrichment.service.ts) for bench/drinking_water/crossing —
 * those should mean "you'd actually pass it," not "it's somewhere in the
 * same park." crossing reuses SIDEWALK_PROXIMITY_M's own value (geo-
 * discovery-routes.ts, 15m) — a crossing is definitionally on the path.
 * court/fitness_station match the existing 40m climb/garden-dedup precedent
 * (GARDEN_DEDUP_RADIUS_METERS, CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS) — a
 * small park facility set back a bit from the path. dog_park is wider still
 * (50m) — a fenced area the path may only skirt. Named, tunable — same
 * "surface for review, don't silently pick" discipline as every other
 * threshold in this codebase.
 */
export const ROUTE_AMENITY_THRESHOLDS_METERS: Record<AmenityCategory, number> = {
  crossing: 15,
  bench: 20,
  drinking_water: 25,
  court: 40,
  fitness_station: 40,
  dog_park: 50,
};

export interface AmenityJoinInput {
  id: string; // osm_amenities doc id
  category: AmenityCategory;
  sport?: CourtSport;
  location: { lat: number; lng: number };
}

/**
 * Checks one route's path against a candidate amenity list — same "caller
 * decides scope/prefiltering" split as findNearestAssociations
 * (route-enrichment.service.ts). At today's per-city amenity scale (a few
 * thousand, same order of magnitude as garden-dedup's already-brute-forced
 * ~1,165 parks), the caller is expected to pass the FULL city amenity list
 * fetched once — no geohash prefilter needed yet. Each amenity is checked
 * as a single-point "path" against findNearestContactPoint, exactly how
 * route-enrichment.service.ts already treats climbs; degenerates cleanly to
 * nearest-vertex-on-route-vs-point (see RouteAmenityRef's own doc comment
 * for the inherited approximation this implies).
 */
export function findAmenityMatchesForRoute(
  routePath: [number, number][],
  amenities: AmenityJoinInput[],
): RouteAmenityRef[] {
  const matches: RouteAmenityRef[] = [];
  if (routePath.length === 0) return matches;
  for (const amenity of amenities) {
    const threshold = ROUTE_AMENITY_THRESHOLDS_METERS[amenity.category];
    const amenityPath: [number, number][] = [[amenity.location.lng, amenity.location.lat]];
    const contact = findNearestContactPoint(routePath, amenityPath);
    if (contact.gapMeters <= threshold) {
      matches.push({
        amenityId: amenity.id,
        category: amenity.category,
        ...(amenity.sport ? { sport: amenity.sport } : {}),
        distanceFromPathMeters: contact.gapMeters,
        location: amenity.location,
      });
    }
  }
  return matches;
}

const EMPTY_COUNTS: Record<AmenityCategory, number> = {
  court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0,
};

/**
 * Pure aggregation: a route's matched amenities -> the flat summary's
 * counts/has. `has` deliberately omits `crossing` — see
 * Route.qualitySignals.amenities' doc comment (route.types.ts) for why a
 * crossing must never become a positive-badge flag.
 */
export function summarizeAmenityMatches(matches: RouteAmenityRef[]): {
  counts: Record<AmenityCategory, number>;
  has: Record<Exclude<AmenityCategory, 'crossing'>, boolean>;
} {
  const counts: Record<AmenityCategory, number> = { ...EMPTY_COUNTS };
  for (const m of matches) counts[m.category]++;
  return {
    counts,
    has: {
      court: counts.court > 0,
      bench: counts.bench > 0,
      drinking_water: counts.drinking_water > 0,
      fitness_station: counts.fitness_station > 0,
      dog_park: counts.dog_park > 0,
    },
  };
}

/**
 * Builds the full `qualitySignals.amenities` value for one route, minus
 * `computedAt` (I/O — the caller sets `FieldValue.serverTimestamp()` at
 * write time, same split every other computedAt in this codebase follows).
 * `hasCityCoverage` = the city has at least one osm_amenities doc of ANY
 * status — see this file's own header for the honesty rule this encodes.
 */
export function buildAmenitiesSignal(
  hasCityCoverage: boolean,
  matches: RouteAmenityRef[],
  sourceStatuses: Array<'pending' | 'published'>,
): Omit<NonNullable<NonNullable<Route['qualitySignals']>['amenities']>, 'computedAt'> {
  if (!hasCityCoverage) {
    return {
      status: 'no_coverage',
      counts: { ...EMPTY_COUNTS },
      has: { court: false, bench: false, drinking_water: false, fitness_station: false, dog_park: false },
      sourceStatuses,
      source: 'osm_amenities_join_v1',
    };
  }
  const { counts, has } = summarizeAmenityMatches(matches);
  return { status: 'computed', counts, has, sourceStatuses, source: 'osm_amenities_join_v1' };
}
