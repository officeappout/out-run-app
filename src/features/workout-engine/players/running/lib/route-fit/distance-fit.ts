/**
 * Does the planned distance fit this route — and how many laps? Pure.
 *
 *   • loop           → whole laps end at the start (best); half laps are
 *                      allowed but end on the far side of the loop.
 *   • out_and_back   → stored distance is the round trip; turn round early
 *                      for a shorter run, repeat it for a longer one — always
 *                      ends at the start.
 *   • point_to_point → run it as out-and-back (turn round at target / 2), or
 *     (and any other   repeat that for a longer run.
 *     non-loop line)
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { pathLengthMeters, isOutAndBackPath } from '@/features/parks/core/services/geoUtils';
import { isLoopRoute } from '@/features/parks/core/services/route-shape';
import type { DistanceFit } from './types';

/** Within this fraction of the target counts as a fit (or FIT_MIN_KM, whichever is larger). */
export const FIT_TOLERANCE = 0.15;
export const FIT_MIN_KM = 0.3;
/** Within this fraction is "close" — shown, but ranked lower. */
export const CLOSE_TOLERANCE = 0.25;
/** More laps than this is a route too short for the run. */
export const MAX_LAPS = 8;

export type RouteRunShape = 'loop' | 'out_and_back' | 'line';

export function routeRunShape(route: Pick<Route, 'routeShape' | 'path'>): RouteRunShape {
  if (route.routeShape === 'out_and_back') return 'out_and_back';
  if (route.routeShape === 'point_to_point') return 'line';
  if (isLoopRoute(route)) return 'loop';
  if (Array.isArray(route.path) && route.path.length >= 3 && isOutAndBackPath(route.path)) return 'out_and_back';
  return 'line';
}

/** Route length in km: the stored distance, else measured from the path. */
export function routeKm(route: Pick<Route, 'distance' | 'path'>): number {
  if (typeof route.distance === 'number' && route.distance > 0) return route.distance;
  return Array.isArray(route.path) && route.path.length >= 2 ? pathLengthMeters(route.path) / 1000 : 0;
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "סיבוב אחד" / "1.5 סיבובים" / "3 סיבובים". */
export function lapsLabel(laps: number): string {
  return laps === 1 ? 'סיבוב אחד' : `${fmtNum(laps)} סיבובים`;
}

function tolKm(targetKm: number, frac: number): number {
  return Math.max(targetKm * frac, FIT_MIN_KM);
}

const NONE: DistanceFit = {
  verdict: 'unknown', laps: null, endsAtStart: false, turnaroundKm: null, score: 0.5, reason: null, caution: null,
};

/** Fewer laps read better for a continuous run; a light touch only. */
function lapPenalty(laps: number): number {
  return laps <= 2 ? 0 : Math.min(0.25, (laps - 2) * 0.05);
}

export function fitDistance(route: Pick<Route, 'distance' | 'path' | 'routeShape'>, targetKm: number | null): DistanceFit {
  const D = routeKm(route);
  if (!targetKm || targetKm <= 0 || !(D > 0)) return NONE;
  const shape = routeRunShape(route);

  if (shape === 'loop') {
    const laps = targetKm / D;
    if (laps > MAX_LAPS + 0.5) return no(`מסלול קצר מדי (${fmtNum(round1(D))} ק״מ)`);
    const whole = Math.max(1, Math.round(laps));
    if (Math.abs(whole * D - targetKm) <= tolKm(targetKm, FIT_TOLERANCE)) {
      return {
        verdict: whole === 1 ? 'fits' : 'laps', laps: whole, endsAtStart: true, turnaroundKm: null,
        score: 1 - lapPenalty(whole), reason: whole === 1 ? null : lapsLabel(whole), caution: null,
      };
    }
    const half = Math.max(1, Math.round(laps * 2) / 2);
    if (!Number.isInteger(half) && Math.abs(half * D - targetKm) <= tolKm(targetKm, FIT_TOLERANCE)) {
      return {
        verdict: 'laps', laps: half, endsAtStart: false, turnaroundKm: null,
        score: 0.8 - lapPenalty(half), reason: lapsLabel(half), caution: 'מסיים בצד השני של הלולאה',
      };
    }
    const best = Math.abs(half * D - targetKm) < Math.abs(whole * D - targetKm) ? half : whole;
    if (Math.abs(best * D - targetKm) <= tolKm(targetKm, CLOSE_TOLERANCE)) {
      return {
        verdict: 'close', laps: best, endsAtStart: Number.isInteger(best), turnaroundKm: null,
        score: 0.45, reason: best === 1 ? null : lapsLabel(best),
        caution: `${fmtNum(round1(best * D))} ק״מ מתוך ${fmtNum(targetKm)}`,
      };
    }
    return no(D > targetKm ? `ארוך מהאימון (${fmtNum(round1(D))} ק״מ)` : `${fmtNum(round1(best * D))} ק״מ מתוך ${fmtNum(targetKm)}`);
  }

  // Out-and-back (round trip D) or a line run there-and-back (round trip 2D):
  // you can always turn round early, so any distance ends at the start.
  const roundTrip = shape === 'out_and_back' ? D : 2 * D;
  const reps = targetKm / roundTrip;
  if (reps > MAX_LAPS + 0.5) return no(`מסלול קצר מדי (${fmtNum(round1(D))} ק״מ)`);
  if (reps <= 1 + FIT_TOLERANCE) {
    const turn = round1(Math.min(targetKm, roundTrip) / 2);
    const fullLength = Math.abs(roundTrip - targetKm) <= tolKm(targetKm, FIT_TOLERANCE);
    return {
      verdict: 'fits', laps: 1, endsAtStart: true, turnaroundKm: turn,
      // Turning round mid-route is fine, a touch below running the route as designed.
      score: fullLength ? 1 : 0.9,
      reason: fullLength && shape === 'out_and_back' ? null : `הלוך-חזור · סיבוב בק״מ ${fmtNum(turn)}`,
      caution: null,
    };
  }
  const laps = Math.round(reps * 2) / 2;
  return {
    verdict: 'laps', laps, endsAtStart: true, turnaroundKm: null,
    score: 0.9 - lapPenalty(laps),
    reason: `הלוך-חזור · ${lapsLabel(laps)}`,
    caution: null,
  };

  function no(caution: string): DistanceFit {
    return { verdict: 'no', laps: null, endsAtStart: false, turnaroundKm: null, score: 0, reason: null, caution };
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
