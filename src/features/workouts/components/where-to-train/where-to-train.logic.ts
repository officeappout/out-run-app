/**
 * where-to-train.logic — PURE ranking of nearby parks for one workout (enable_where_to_train_v1).
 *
 * A park scores by how much of the workout's gear it has (coverage 0..1) and by how close it is.
 * Coverage is ranking-only: it is never shown and a park with missing gear is never flagged —
 * the workout adapts through the existing equipment normalisation.
 */

/** Parks farther than this are not offered (same radius as useNearbyParks / the compose sheet). */
export const WHERE_TO_TRAIN_RADIUS_M = 2000;
/** How many of the nearest parks are point-fetched for their gear (one getPark read each). */
export const WHERE_TO_TRAIN_FETCH_LIMIT = 6;
/** Cards shown in the carousel. */
export const WHERE_TO_TRAIN_MAX_CARDS = 5;
/** Weight of distance against coverage: a park at the radius edge loses this much score. */
export const DISTANCE_WEIGHT = 0.5;

/** Gear ids that never need a machine (never count toward coverage). */
const NO_GEAR = new Set(['bodyweight', 'none', 'unknown_gear', '']);

export interface RankableCandidate {
  id: string;
  distanceM: number;
  /** Canonical gear ids the park has (normalised). */
  gearIds: readonly string[];
}

/** Share of the workout's gear the park has. A workout with no gear is fully covered everywhere. */
export function gearCoverage(workoutGear: readonly string[], parkGear: readonly string[]): number {
  const needed = Array.from(new Set(workoutGear.filter((g) => !NO_GEAR.has(g))));
  if (needed.length === 0) return 1;
  const have = new Set(parkGear);
  return needed.filter((g) => have.has(g)).length / needed.length;
}

export function parkScore(coverage: number, distanceM: number, radiusM = WHERE_TO_TRAIN_RADIUS_M): number {
  const d = Math.min(Math.max(distanceM, 0), radiusM) / radiusM;
  return coverage - DISTANCE_WEIGHT * d;
}

/**
 * Best park first. Drops parks outside the radius; ties break on distance, then id (stable).
 */
export function rankParksForWorkout<T extends RankableCandidate>(
  candidates: readonly T[],
  workoutGear: readonly string[],
  maxCards = WHERE_TO_TRAIN_MAX_CARDS,
): T[] {
  return candidates
    .filter((c) => c.distanceM <= WHERE_TO_TRAIN_RADIUS_M)
    .map((c) => ({ c, score: parkScore(gearCoverage(workoutGear, c.gearIds), c.distanceM) }))
    .sort((a, b) => b.score - a.score || a.c.distanceM - b.c.distanceM || a.c.id.localeCompare(b.c.id))
    .slice(0, maxCards)
    .map((x) => x.c);
}

/** The nearest `limit` parks inside the radius — the ones worth a point-fetch. */
export function nearestWithin<T extends { distanceM: number }>(
  items: readonly T[],
  limit = WHERE_TO_TRAIN_FETCH_LIMIT,
  radiusM = WHERE_TO_TRAIN_RADIUS_M,
): T[] {
  return items
    .filter((p) => Number.isFinite(p.distanceM) && p.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, limit);
}
