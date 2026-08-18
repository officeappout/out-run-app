/**
 * garden-dedup.service.ts — Stage 5 "needs prep" gate (route-enrichment-
 * pipeline plan, 17.08.2026): the hard rule for any future OSM point-entity
 * layer (benches, fitness stations, etc.) — the ~1000 curated `parks` docs
 * are the source of truth, an OSM-discovered point within range of one is
 * NOT a new garden, it's a duplicate to skip (or, later, a candidate for
 * backfilling equipment onto an existing location-only garden — a separate,
 * not-yet-built step).
 *
 * Deliberately pure and I/O-free, same discipline as every other join
 * primitive in this plan (route-adjacency.service.ts, route-enrichment.service.ts,
 * route-comfort-tags.service.ts). The Firestore-facing half (a geohash-bounded
 * query against `parks` once backfill-parks-geohash.ts has run) lives in
 * whatever future script/service actually ingests OSM points — not built yet;
 * this module only ships the matching primitive the gate is built on.
 *
 * Point-to-point, not path-to-path — reuses geoUtils.ts's existing
 * haversineMeters directly rather than route-adjacency.service.ts's
 * findNearestContactPoint (that one is for polyline-vs-polyline nearest-
 * vertex search; a plain point-to-point distance is simpler and doesn't
 * need that machinery).
 */
import { haversineMeters } from './geoUtils';

/**
 * Max distance for an OSM-discovered point to count as "the same garden" as
 * an existing curated park. Starting default — tighter than Stage 3's climb-
 * route threshold (40m there too, but for a different reason: this is about
 * confidently being the SAME physical location, not "passes near"). Named,
 * tunable — same "surface for review" discipline as every other threshold
 * in this plan; revisit once real OSM fitness-POI data is run through it.
 */
export const GARDEN_DEDUP_RADIUS_METERS = 40;

export interface GardenCandidate {
  id: string;
  lat: number;
  lng: number;
}

export interface GardenDedupMatch {
  parkId: string;
  distanceMeters: number;
}

/**
 * Pure: finds the NEAREST existing park within `thresholdMeters` of a point,
 * among a caller-provided candidate list (the caller is responsible for a
 * reasonably-scoped candidate list — e.g. a geohash-bounded query around the
 * point — not passing every park in the city). Returns null when nothing is
 * within range: the point is a genuine new discovery, never a guessed match.
 */
export function findNearestGardenMatch(
  point: { lat: number; lng: number },
  candidates: GardenCandidate[],
  thresholdMeters: number = GARDEN_DEDUP_RADIUS_METERS,
): GardenDedupMatch | null {
  let best: GardenDedupMatch | null = null;
  for (const candidate of candidates) {
    const distanceMeters = haversineMeters(point.lat, point.lng, candidate.lat, candidate.lng);
    if (distanceMeters <= thresholdMeters && (!best || distanceMeters < best.distanceMeters)) {
      best = { parkId: candidate.id, distanceMeters };
    }
  }
  return best;
}

/** True when a point should be SKIPPED as a duplicate of an existing garden. */
export function isDuplicateOfExistingGarden(
  point: { lat: number; lng: number },
  candidates: GardenCandidate[],
  thresholdMeters: number = GARDEN_DEDUP_RADIUS_METERS,
): boolean {
  return findNearestGardenMatch(point, candidates, thresholdMeters) !== null;
}
