/**
 * route-comfort-tags.service.ts — Stage 5 quick win (route-enrichment-pipeline
 * plan, 17.08.2026): auto-suggest existing `RouteFeatureTag` values from data
 * already flowing through the pipeline, starting with `night_lighting` from
 * `street_segments.tags.lit` (already fetched/scored/stored by
 * osm-segment-importer.ts — the OSM ingestion side of this needed zero new
 * work; only the route-level rollup was missing). This is Stage 4b's "comfort
 * amenities auto-fill the existing tag vocabulary" vision, first application.
 *
 * Deliberately a separate module from route-enrichment.service.ts (the
 * climb↔route/segment join) — different join (route↔lit-segment, not
 * climb↔route), same discipline (pure, I/O-free, structural sibling of
 * route-adjacency.service.ts). Sets up a natural home for future comfort
 * tags (shaded, near_water) without overloading route-enrichment.service.ts's
 * climb-specific scope.
 *
 * Reuses findNearestContactPoint (route-adjacency.service.ts) — no new
 * geometric primitive, same "1-point path degenerates cleanly" pattern
 * Stage 3's climb join already established.
 */
import { findNearestContactPoint, type AdjacencyCorridor } from './route-adjacency.service';

/**
 * Max gap between a route path point and a lit street_segment for that point
 * to count as "on a lit stretch." Deliberately tighter than
 * CLIMB_ROUTE_ASSOCIATION_THRESHOLD_METERS (40m, route-enrichment.service.ts) —
 * lighting is a property of the specific path you're walking, not something
 * "nearby" should count for; a route running parallel to but 35m from a lit
 * street is not itself lit.
 */
export const LIT_TAG_PROXIMITY_METERS = 20;

/**
 * Fraction of a route's sampled points that must be near a lit segment
 * before `night_lighting` is suggested. 0.6 (not "any point" or "100%") —
 * OSM `lit` coverage is inherently patchy (a single unlit gap shouldn't
 * disqualify an otherwise well-lit evening route), but a route that's only
 * incidentally near one lit corner shouldn't qualify either. Named constant,
 * tunable — same "surface for review, don't silently pick" discipline as
 * every other threshold in this plan.
 */
export const LIT_TAG_COVERAGE_THRESHOLD = 0.6;

export interface LitSegmentCandidate extends AdjacencyCorridor {
  lit: boolean;
}

/**
 * Pure: given a route's path and, for EACH path point, the lit-segment
 * candidates already fetched nearby (geohash-prefiltered by the caller — I/O
 * lives in the Firestore-facing script, not here), returns the fraction of
 * points within LIT_TAG_PROXIMITY_METERS of an actually-lit segment.
 *
 * `candidatesPerPoint[i]` corresponds to `routePath[i]` — the caller is
 * responsible for fetching a reasonably-scoped candidate list per point
 * (e.g. a small geohash radius query), not passing every segment in the city
 * for every point.
 */
export function computeLitCoverage(
  routePath: [number, number][],
  candidatesPerPoint: LitSegmentCandidate[][],
  thresholdMeters: number = LIT_TAG_PROXIMITY_METERS,
): number {
  if (routePath.length === 0) return 0;
  let litPoints = 0;
  for (let i = 0; i < routePath.length; i++) {
    const point = routePath[i];
    const candidates = candidatesPerPoint[i] ?? [];
    const isLit = candidates.some((seg) => {
      if (!seg.lit || seg.path.length === 0) return false;
      const contact = findNearestContactPoint([point], seg.path);
      return contact.gapMeters <= thresholdMeters;
    });
    if (isLit) litPoints++;
  }
  return litPoints / routePath.length;
}

/** True when a route's computed lit coverage clears the suggestion threshold. */
export function shouldSuggestNightLighting(
  litCoverage: number,
  threshold: number = LIT_TAG_COVERAGE_THRESHOLD,
): boolean {
  return litCoverage >= threshold;
}
