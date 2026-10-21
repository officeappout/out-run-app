/**
 * Time-aware route preference (enable_route_time_aware, RC7 step 4; owner
 * decision 21.10.2026). Server side, after GraphHopper:
 *   - hot month (May–Oct) and the sun above ~25° → rank candidates by the
 *     hourly shade at the CURRENT hour (shade/hourly/v1);
 *   - sun below the horizon → rank by lit length share (lighting/v1);
 *   - otherwise neutral: the normal top 3, untouched.
 * Quality bars are never traded: passing loops always first. Within them,
 * loops are compared by their measure rounded to TIE_BUCKET (so a 1%
 * difference does not override the generator's own order), then the
 * generator's order. Unmeasured loops keep their order after measured ones.
 * Pure: the caller supplies the measure.
 */
import { sunPosition } from '../shade-hourly/sun';
import { utcToIsraelLocal } from '../shade-hourly/israel-time';
import { cellForInstant } from '../shade-hourly/time-grid';
import type { ScoredLoop } from './loop-service';

/** Months (1-based, Israel local) where shade is preferred in daylight. */
export const TIME_AWARE_HOT_MONTHS: readonly number[] = [5, 6, 7, 8, 9, 10];
/** Sun elevation above which the midday heat makes shade worth preferring. */
export const TIME_AWARE_MIN_SUN_ELEVATION_DEG = 25;
/** At or below this elevation the street lights matter (after sunset / before sunrise). */
export const TIME_AWARE_DARK_ELEVATION_DEG = 0;
/** Measures closer than this are treated as equal (generator order decides). */
export const TIME_AWARE_TIE_BUCKET = 0.05;
/** Candidates asked from the loop service when a ranking applies (same as "shadiest route"). */
export const TIME_AWARE_POOL = 6;

export type TimeAwareMode = 'shade' | 'lit' | 'neutral';

export interface TimeAwareDecision {
  mode: TimeAwareMode;
  sunElevationDeg: number;
  /** Israel local month (1-based) and hour. */
  month: number;
  hour: number;
  /** Hourly-shade grid cell (06–19), null outside the grid. */
  cell: number | null;
}

export function timeAwareMode(at: Date, lat: number, lng: number): TimeAwareDecision {
  const sun = sunPosition(at, lat, lng);
  const local = utcToIsraelLocal(at);
  const cell = cellForInstant(at)?.index ?? null;
  let mode: TimeAwareMode = 'neutral';
  if (sun.elevationDeg <= TIME_AWARE_DARK_ELEVATION_DEG) mode = 'lit';
  else if (TIME_AWARE_HOT_MONTHS.includes(local.month) && sun.elevationDeg > TIME_AWARE_MIN_SUN_ELEVATION_DEG && cell != null) mode = 'shade';
  return { mode, sunElevationDeg: Math.round(sun.elevationDeg * 10) / 10, month: local.month, hour: local.hour, cell };
}

export type TimeAwareReason = 'applied' | 'neutral' | 'no_data' | 'not_measured' | 'timeout';

export interface TimeAwareMeta {
  requested: true;
  mode: TimeAwareMode;
  applied: boolean;
  reason: TimeAwareReason;
  /** City slug of the layer used, when one exists. */
  city: string | null;
  hour: number;
  sunElevationDeg: number;
}

export interface TimeAwareRanked<T> { loops: Array<T & { measure: number | null }>; applied: boolean }

/** Re-rank by a per-loop measure (higher is better), keeping passing loops first. */
export function rankLoopsByMeasure<T extends { verdict: Pick<ScoredLoop['verdict'], 'pass'> }>(
  loops: T[],
  measure: (l: T) => number | null,
  n: number,
  bucket = TIME_AWARE_TIE_BUCKET,
): TimeAwareRanked<T> {
  const rows = loops.map((l, order) => ({ l, order, m: measure(l) }));
  const key = (m: number) => Math.round(m / bucket);
  rows.sort((a, b) => {
    const pass = Number(b.l.verdict.pass) - Number(a.l.verdict.pass);
    if (pass) return pass;
    if (a.m != null && b.m != null && key(a.m) !== key(b.m)) return key(b.m) - key(a.m);
    if ((a.m == null) !== (b.m == null)) return a.m == null ? 1 : -1;
    return a.order - b.order;
  });
  return { loops: rows.slice(0, n).map((x) => ({ ...x.l, measure: x.m })), applied: rows.some((x) => x.m != null) };
}
