/**
 * Top-N selection per authority — NATIONWIDE-PLAN.md §3.3 ("the score
 * SELECTS, not only filters") + §3.7 quotas. Pure.
 *
 * Rules:
 * - only routeScore ≥ 70 and not red can be selected — no exceptions;
 * - official-dataset routes scoring 55-70 → manual_review (never auto-picked);
 * - diversity: ≤2 routes per park/promenade, ≤2 per 1 km grid cell, no length
 *   bucket (short <3 km / medium 3-8 / long >8) above half the quota;
 * - park loops and cycling routes capped by the quota; the best cycling route
 *   and the best park loops (up to the quota minimum) are reserved first;
 * - the quota is a ceiling: no relaxation pass, so a city with few good routes
 *   gets a small set (quality over quantity).
 * Everything not selected stays a hidden `candidate` (owner decision Q13).
 */
import type { AuthorityQuota } from './quota';
import type { RouteScore, RouteScoreInput } from './types';
import { MANUAL_REVIEW_MIN_SCORE, NAMED_PLACE_PATTERN, SELECTION_MIN_SCORE } from './weights';
import { SURFACE_CLASSES, type SurfaceClass } from './surface-class';

export type SelectionDecision = 'selected' | 'candidate' | 'manual_review' | 'rejected';

export interface ScoredRoute {
  input: RouteScoreInput;
  score: RouteScore;
}

export interface SelectionRow {
  id: string;
  decision: SelectionDecision;
  reason: string;
  score: number;
}

export interface SelectionResult {
  rows: SelectionRow[];
  selectedIds: string[];
  counts: Record<SelectionDecision, number> & { parkLoops: number; cycling: number };
  /** Selected routes per surface class. */
  selectedBySurface: Record<SurfaceClass, number>;
}

export const MAX_PER_ANCHOR = 2;
export const MAX_PER_CELL = 2;
export const CELL_DEG_LAT = 0.009; // ≈1 km
export const CELL_DEG_LNG = 0.0107; // ≈1 km at Israel's latitude

export type LengthBucket = 'short' | 'medium' | 'long' | 'unknown';

export function lengthBucket(km: number | null): LengthBucket {
  if (km == null || !(km > 0)) return 'unknown';
  if (km < 3) return 'short';
  if (km <= 8) return 'medium';
  return 'long';
}

/** The park/promenade a route belongs to, for the ≤2-per-anchor rule. Null = no named anchor. */
export function anchorKey(i: RouteScoreInput): string | null {
  if (i.parkRef) return `park:${i.parkRef.id}`;
  const n = i.name.replace(/^הקפת\s+/, '').replace(/\s+/g, ' ').trim();
  if (n && NAMED_PLACE_PATTERN.test(i.name)) return `name:${n}`;
  return null;
}

export function gridCell(i: RouteScoreInput): string | null {
  if (!i.path.length) return null;
  let lng = 0;
  let lat = 0;
  for (const [x, y] of i.path) { lng += x; lat += y; }
  lng /= i.path.length;
  lat /= i.path.length;
  return `${Math.floor(lat / CELL_DEG_LAT)}:${Math.floor(lng / CELL_DEG_LNG)}`;
}

export const isParkLoop = (i: RouteScoreInput) => !!i.parkRef || (i.sourceTier === 'named_place' && i.shape === 'loop');
export const isCycling = (i: RouteScoreInput) => i.activityType === 'cycling';

export function selectTopN(routes: ScoredRoute[], quota: AuthorityQuota): SelectionResult {
  const rows = new Map<string, SelectionRow>();
  const eligible: ScoredRoute[] = [];
  for (const r of routes) {
    const s = r.score.score;
    if (r.score.band === 'red') rows.set(r.input.id, { id: r.input.id, decision: 'rejected', reason: 'red band', score: s });
    else if (s >= SELECTION_MIN_SCORE) eligible.push(r);
    else if (r.input.sourceTier === 'official' && s >= MANUAL_REVIEW_MIN_SCORE) {
      rows.set(r.input.id, { id: r.input.id, decision: 'manual_review', reason: `official source, score ${s} (55-70)`, score: s });
    } else rows.set(r.input.id, { id: r.input.id, decision: 'candidate', reason: `score ${s} < ${SELECTION_MIN_SCORE}`, score: s });
  }
  eligible.sort((a, b) => b.score.score - a.score.score || b.score.confidence - a.score.confidence || a.input.id.localeCompare(b.input.id));

  const anchors = new Map<string, number>();
  const cells = new Map<string, number>();
  const buckets = new Map<LengthBucket, number>();
  const bucketCap = Math.ceil(quota.total.max / 2);
  let parkLoops = 0;
  let cycling = 0;
  const picked: string[] = [];

  const blocker = (r: ScoredRoute): string | null => {
    const i = r.input;
    if (picked.length >= quota.total.max) return `quota full (${quota.total.max})`;
    const a = anchorKey(i);
    if (a && (anchors.get(a) ?? 0) >= MAX_PER_ANCHOR) return `already ${MAX_PER_ANCHOR} routes for ${a}`;
    const c = gridCell(i);
    if (c && (cells.get(c) ?? 0) >= MAX_PER_CELL) return `already ${MAX_PER_CELL} routes in this 1 km cell`;
    const b = lengthBucket(i.distanceKm);
    if (b !== 'unknown' && (buckets.get(b) ?? 0) >= bucketCap) return `length mix: ${b} bucket full`;
    if (isParkLoop(i) && parkLoops >= quota.parkLoops.max) return `park-loop quota full (${quota.parkLoops.max})`;
    if (isCycling(i) && cycling >= quota.cycling.max) return `cycling quota full (${quota.cycling.max})`;
    return null;
  };
  const take = (r: ScoredRoute, why: string) => {
    const i = r.input;
    picked.push(i.id);
    const a = anchorKey(i);
    if (a) anchors.set(a, (anchors.get(a) ?? 0) + 1);
    const c = gridCell(i);
    if (c) cells.set(c, (cells.get(c) ?? 0) + 1);
    const b = lengthBucket(i.distanceKm);
    buckets.set(b, (buckets.get(b) ?? 0) + 1);
    if (isParkLoop(i)) parkLoops++;
    if (isCycling(i)) cycling++;
    rows.set(i.id, { id: i.id, decision: 'selected', reason: why, score: r.score.score });
  };

  // Reserve: best cycling (≥1 when any exists, up to the quota minimum), then best park loops.
  const cyclingWant = Math.min(quota.cycling.max, Math.max(1, quota.cycling.min));
  for (const r of eligible.filter((x) => isCycling(x.input))) {
    if (cycling >= cyclingWant) break;
    if (!blocker(r)) take(r, 'reserved: cycling');
  }
  for (const cls of SURFACE_CLASSES) {
    if (picked.some((id) => eligible.find((e) => e.input.id === id)?.input.surfaceClass === cls)) continue;
    const best = eligible.find((x) => x.input.surfaceClass === cls && !rows.has(x.input.id) && !blocker(x));
    if (best) take(best, `reserved: surface ${cls}`);
  }
  for (const r of eligible.filter((x) => isParkLoop(x.input))) {
    if (parkLoops >= quota.parkLoops.min) break;
    if (!rows.has(r.input.id) && !blocker(r)) take(r, 'reserved: park loop');
  }
  for (const r of eligible) {
    if (rows.has(r.input.id)) continue;
    const why = blocker(r);
    if (why) rows.set(r.input.id, { id: r.input.id, decision: 'candidate', reason: why, score: r.score.score });
    else take(r, `top score ${r.score.score}`);
  }

  const out = routes.map((r) => rows.get(r.input.id)!);
  const counts = { selected: 0, candidate: 0, manual_review: 0, rejected: 0, parkLoops, cycling };
  for (const row of out) counts[row.decision]++;
  const selectedBySurface: Record<SurfaceClass, number> = { walk_run_paved: 0, hike_offroad: 0, bike_road: 0, bike_offroad: 0, unknown: 0 };
  const byId = new Map(routes.map((r) => [r.input.id, r.input]));
  for (const id of picked) selectedBySurface[byId.get(id)?.surfaceClass ?? 'unknown']++;
  return { rows: out, selectedIds: picked, counts, selectedBySurface };
}
