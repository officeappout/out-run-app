/**
 * Plan for backfill-route-surface-class.ts (owner-approved 23.10.2026): copy the
 * `surfaceClass` already computed on a route's `route_scores/{routeId}` doc onto
 * the official_routes doc itself, so the client can filter by surface without
 * reading route_scores.
 *
 * Pure, in-memory: "does the doc already have the field" is decided HERE on the
 * read data, never by a `== null` query (axiom §33 — that matches only an
 * explicit null, not an absent key). The join key is the doc id: route_scores
 * docs are written at `route_scores/{routeId}` (route-scores-doc.ts) and carry
 * `routeId` + `routeCollection` which are cross-checked.
 *
 * Only a KNOWN class (walk_run_paved | hike_offroad | bike_road | bike_offroad)
 * is ever written; 'unknown' and "no score doc" are left unset and listed — the
 * client derives them (routeSurfaceClass) so nothing is guessed here.
 */
import { isSurfaceClass, SURFACE_CLASSES, type SurfaceClass } from '../route-score/surface-class';

export type SurfaceClassPlan =
  | { kind: 'fill'; surfaceClass: SurfaceClass }
  | { kind: 'already_set'; surfaceClass: SurfaceClass }
  | { kind: 'invalid_existing'; reason: string }
  | { kind: 'no_score' }
  | { kind: 'score_unknown' }
  | { kind: 'score_mismatch'; reason: string };

export function planSurfaceClass(routeId: string, routeData: Record<string, any> | undefined, score: Record<string, any> | undefined): SurfaceClassPlan {
  const existing = routeData?.surfaceClass;
  if (existing !== undefined && existing !== null) {
    return isSurfaceClass(existing) ? { kind: 'already_set', surfaceClass: existing } : { kind: 'invalid_existing', reason: `surfaceClass=${JSON.stringify(existing)}` };
  }
  if (!score) return { kind: 'no_score' };
  if (typeof score.routeId === 'string' && score.routeId && score.routeId !== routeId) return { kind: 'score_mismatch', reason: `score.routeId=${score.routeId}` };
  if (typeof score.routeCollection === 'string' && score.routeCollection !== 'official_routes') return { kind: 'score_mismatch', reason: `score.routeCollection=${score.routeCollection}` };
  const cls = score.surfaceClass;
  if (cls === undefined || cls === null || cls === 'unknown') return { kind: 'score_unknown' };
  if (!isSurfaceClass(cls)) return { kind: 'score_mismatch', reason: `score.surfaceClass=${JSON.stringify(cls)}` };
  return { kind: 'fill', surfaceClass: cls };
}

export interface SurfaceClassPlanSummary {
  total: number;
  alreadySet: number;
  fill: number;
  fillByClass: Record<string, number>;
  noScore: number;
  scoreUnknown: number;
  scoreMismatch: number;
  invalidExisting: number;
}

export function summarizeSurfaceClassPlans(plans: SurfaceClassPlan[]): SurfaceClassPlanSummary {
  const s: SurfaceClassPlanSummary = {
    total: plans.length, alreadySet: 0, fill: 0, fillByClass: Object.fromEntries(SURFACE_CLASSES.map((c) => [c, 0])),
    noScore: 0, scoreUnknown: 0, scoreMismatch: 0, invalidExisting: 0,
  };
  for (const p of plans) {
    if (p.kind === 'fill') { s.fill++; s.fillByClass[p.surfaceClass]++; }
    else if (p.kind === 'already_set') s.alreadySet++;
    else if (p.kind === 'no_score') s.noScore++;
    else if (p.kind === 'score_unknown') s.scoreUnknown++;
    else if (p.kind === 'score_mismatch') s.scoreMismatch++;
    else s.invalidExisting++;
  }
  return s;
}
