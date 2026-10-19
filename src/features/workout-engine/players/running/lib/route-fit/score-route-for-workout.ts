/**
 * scoreRouteForWorkout — how well one route suits today's planned run (0..100
 * + Hebrew reasons), and workoutFitForRoute — the Discover-side verdict
 * ("מתאים" / "מתאים ב-N סיבובים" / "לא מתאים לאימון של היום"). Pure.
 *
 * Weights per run kind (each part 0..1, unknown data = neutral 0.5):
 *   hill      distance .20 · climb .50 · access .15 · light .10 · path .05
 *   interval  distance .30 · flat .20 · path .10 · crossings .10 · turns .10 · access .10 · light .10
 *   tempo/long distance .35 · crossings .15 · turns .10 · flat .10 · path .10 · access .10 · light .10
 *   easy      distance .35 · comfort .30 · access .20 · light .15
 * Light only matters after dark (lit 1 · unknown .5 · unlit 0); in daylight it's a constant 1.
 * A stored official route gets +3 over a generated one (the owner prefers real routes).
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { climbReason, findClimbForRoute } from './climb-match';
import { fitDistance, lapsLabel } from './distance-fit';
import { accessKm, comfort, crossings, dedicatedPath, flatness, lighting, turns } from './route-traits';
import type { ClimbMatch, DistanceFit, RouteScoreContext, RouteWorkoutScore, WorkoutRouteNeeds } from './types';

export type ScorableRoute = Route & { elevationProfile?: unknown };

export const DEFAULT_RADIUS_KM = 2.5;
const OFFICIAL_BONUS = 3;

/** Access: on the route (≤ 200 m) → 1, at the radius edge → 0. */
function accessScore(km: number, radiusKm: number): number {
  if (!Number.isFinite(km)) return 0;
  if (km <= 0.2) return 1;
  return Math.max(0, 1 - (km - 0.2) / Math.max(0.1, radiusKm - 0.2));
}

function accessReason(km: number): string | null {
  if (!Number.isFinite(km)) return null;
  if (km <= 0.15) return 'מתחיל לידך';
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} מ׳ ממך`;
  return `${km.toFixed(1)} ק״מ ממך`;
}

/** Climb part 0..1: meets spec 1; profile-proven but short/shallow scaled by grade; terrain hint .6; maxGrade hint .35. */
function climbScore(c: ClimbMatch | null, minGrade: number): number {
  if (!c) return 0;
  if (c.meetsSpec) return c.source === 'profile' ? 1 : 0.75;
  if (c.source === 'maxGrade') return c.avgGradePct >= minGrade ? 0.35 : 0.1;
  return Math.min(0.6, (c.avgGradePct / minGrade) * 0.6);
}

export function scoreRouteForWorkout(
  route: ScorableRoute,
  workout: WorkoutRouteNeeds,
  ctx: RouteScoreContext = {},
): RouteWorkoutScore {
  const reasons: string[] = [];
  const cautions: string[] = [];
  const fit = fitDistance(route, workout.targetKm);
  if (fit.reason) reasons.push(fit.reason);
  if (fit.caution) cautions.push(fit.caution);

  const radiusKm = ctx.radiusKm ?? DEFAULT_RADIUS_KM;
  const access = ctx.origin ? accessKm(route, ctx.origin) : null;
  const accessPart = access == null ? 0.5 : accessScore(access, radiusKm);

  const light = lighting(route);
  const lightPart = !workout.afterDark ? 1 : light === 'lit' ? 1 : light === 'unlit' ? 0 : 0.5;
  if (light === 'lit' && (workout.afterDark || workout.kind === 'interval')) reasons.push('מואר');
  if (workout.afterDark && light === 'unlit') cautions.push('לא מואר');

  const path = dedicatedPath(route);
  const pathReason = path.pct == null ? null : path.pct >= 80 ? 'שביל ייעודי' : path.pct >= 60 ? 'רוב שביל ייעודי' : null;

  let climb: ClimbMatch | null = null;
  let total: number;

  if (workout.hill) {
    climb = findClimbForRoute(route, workout.hill);
    if (climb && (climb.meetsSpec || climb.avgGradePct >= workout.hill.minGradePct * 0.6)) reasons.unshift(climbReason(climb));
    if (!climb) cautions.push('אין נתוני גובה למסלול');
    else if (!climb.meetsSpec) cautions.push(climb.source === 'profile' ? 'אין עלייה מתאימה לחזרות' : 'לא ידוע אם העלייה ארוכה מספיק');
    total =
      0.2 * fit.score + 0.5 * climbScore(climb, workout.hill.minGradePct) + 0.15 * accessPart + 0.1 * lightPart + 0.05 * path.score;
  } else if (workout.kind === 'interval') {
    const flat = flatness(route);
    const cross = crossings(route);
    const tr = turns(route);
    if (flat.known && flat.score >= 0.8) reasons.push('מישורי');
    if (pathReason) reasons.push(pathReason);
    if (cross.perKm != null && cross.perKm <= 1.5) reasons.push('מעט מעברי חצייה');
    if (tr.perKm != null && tr.perKm <= 2) reasons.push('מעט פניות');
    if (cross.perKm != null && cross.perKm >= 5) cautions.push('הרבה מעברי חצייה');
    total = 0.3 * fit.score + 0.2 * flat.score + 0.1 * path.score + 0.1 * cross.score + 0.1 * tr.score + 0.1 * accessPart + 0.1 * lightPart;
  } else if (workout.kind === 'tempo' || workout.kind === 'long') {
    const flat = flatness(route);
    const cross = crossings(route);
    const tr = turns(route);
    const continuous = (cross.perKm == null || cross.perKm <= 1.5) && (tr.perKm == null || tr.perKm <= 2) && (cross.known || tr.known);
    if (continuous) reasons.push('רציף, מעט עצירות');
    if (pathReason) reasons.push(pathReason);
    if (cross.perKm != null && cross.perKm >= 5) cautions.push('הרבה מעברי חצייה');
    total = 0.35 * fit.score + 0.15 * cross.score + 0.1 * tr.score + 0.1 * flat.score + 0.1 * path.score + 0.1 * accessPart + 0.1 * lightPart;
  } else {
    const c = comfort(route);
    if (pathReason) reasons.push(pathReason);
    if (c.water) reasons.push('ברזייה בדרך');
    if (c.shaded) reasons.push('מוצל');
    total = 0.35 * fit.score + 0.3 * c.score + 0.2 * accessPart + 0.15 * lightPart;
  }

  const accessText = access == null ? null : accessReason(access);
  if (accessText) reasons.push(accessText);

  let score = total * 100 + (ctx.isGenerated ? 0 : OFFICIAL_BONUS);
  // A run that doesn't fit at all can't outrank one that does.
  if (fit.verdict === 'no') score = Math.min(score, 30);
  if (workout.hill && climb?.source === 'profile' && !climb.meetsSpec) score = Math.min(score, 50);

  return {
    routeId: route.id,
    score: Math.round(Math.max(0, Math.min(100, score))),
    fit,
    climb,
    reasons: dedupe(reasons),
    cautions: dedupe(cautions),
  };
}

function dedupe(a: string[]): string[] {
  return a.filter((x, i) => a.indexOf(x) === i);
}

// ── Discover: does today's run fit this route? ────────────────────────────

export interface WorkoutFitVerdict {
  fits: boolean;
  /** "מתאים" · "מתאים ב-2 סיבובים" · "כמעט מתאים" · "לא מתאים לאימון של היום"; null = can't tell. */
  label: string | null;
  fit: DistanceFit;
  climb: ClimbMatch | null;
  reasons: string[];
  cautions: string[];
}

export function workoutFitForRoute(route: ScorableRoute, workout: WorkoutRouteNeeds): WorkoutFitVerdict {
  const s = scoreRouteForWorkout(route, workout, { isGenerated: false });
  const { fit, climb } = s;
  // A hill workout on a route whose profile proves there's no usable climb doesn't fit.
  const hillFails = !!workout.hill && climb?.source === 'profile' && !climb.meetsSpec;
  let fits: boolean;
  let label: string | null;
  if (fit.verdict === 'unknown') {
    fits = !hillFails;
    label = hillFails ? 'לא מתאים לאימון של היום' : null;
  } else if (fit.verdict === 'no' || hillFails) {
    fits = false;
    label = 'לא מתאים לאימון של היום';
  } else if (fit.verdict === 'close') {
    fits = false;
    label = 'כמעט מתאים';
  } else {
    fits = true;
    label = fit.laps != null && fit.laps !== 1 ? `מתאים ב-${lapsLabel(fit.laps)}` : 'מתאים';
  }
  return { fits, label, fit, climb, reasons: s.reasons, cautions: s.cautions };
}
