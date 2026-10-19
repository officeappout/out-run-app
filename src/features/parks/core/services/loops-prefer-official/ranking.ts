/**
 * v1 (Mapbox) ranking bonus for loops along our mapped routes. The v1 ranking
 * key is turnsPerKm × (1 + quality penalty) (lower = better); with this flag it
 * is further multiplied by (1 − OUR_ROUTES_RANK_WEIGHT × share on our routes).
 *
 * It only REORDERS candidates that already passed the distance window, and it
 * never moves a loop across the clean / fallback split (the v1 acceptance bars
 * decide that, unchanged). 0.35 → a loop entirely on our routes ranks like one
 * with ~35 % fewer turns per km; a loop with a quarter on them, ~9 %. Tunable.
 */
import { ourRoutesShare, type LngLat, type OurRoutesIndex } from '@/lib/route-quality';

export const OUR_ROUTES_RANK_WEIGHT = 0.35;

export function ourRoutesRankFactor(share: number, weight = OUR_ROUTES_RANK_WEIGHT): number {
  const s = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  return 1 - weight * s;
}

/** Rank factor for one finished loop line. */
export function rankFactorForPath(path: LngLat[], index: OurRoutesIndex): number {
  return ourRoutesRankFactor(ourRoutesShare(path, index).share);
}
