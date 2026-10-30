/**
 * One aerobic player for every walk, run and ride (enable_combo_flow_v1, boards PlayerFreeRun /
 * PlayerMetrics / PlayerWalkRoute / PlayerRouteWalk). PURE: which mode the live session is in,
 * its title, the three drawer numbers, and whether the lap button shows.
 *
 *                 walk                  run                   ride
 *   to the start  time · arrival · steps  time · arrival · steps  time · arrival · speed
 *   on a route    time · km left · steps  time · km left · pace   time · km left · speed
 *   free          time · km · steps       time · km · pace        time · km · speed
 *   title         route name, else "{activity} free"
 *   lap button    free run only
 */

import { estimateSteps } from '@/lib/steps-estimate';

export type AerobicMode = 'toStart' | 'route' | 'free';
export type AerobicActivity = 'walking' | 'running' | 'cycling';
export type AerobicCellKey = 'time' | 'km' | 'kmLeft' | 'arrival' | 'steps' | 'pace' | 'speed';

export interface AerobicCellSpec {
  key: AerobicCellKey;
  /** Raw number for the caller to format (seconds, km, steps, sec/km, or null = unknown). */
  value: number | null;
}

export function normalizeActivity(a: string | null | undefined): AerobicActivity {
  return a === 'walking' || a === 'cycling' ? a : 'running';
}

export function aerobicMode(sessionMode: string | null | undefined, routeName: string | null | undefined): AerobicMode {
  if (sessionMode === 'commute') return 'toStart';
  return routeName && routeName.trim() ? 'route' : 'free';
}

/** The route's own name when on a route (M26: never "free run" there), else null → "{activity} free". */
export function routeTitle(mode: AerobicMode, routeName: string | null | undefined): string | null {
  return mode === 'route' && routeName && routeName.trim() ? routeName.trim() : null;
}

export const showLapButton = (mode: AerobicMode, activity: AerobicActivity) => mode === 'free' && activity === 'running';

export interface AerobicCellsInput {
  mode: AerobicMode;
  activity: AerobicActivity;
  durationSec: number;
  distanceKm: number;
  /** The route's length (route mode). */
  routeKm: number | null;
  /** Seconds to the start (to-the-start mode). */
  etaSec: number | null;
  /** Live pace, sec/km. */
  paceSec: number;
}

export function aerobicCells(i: AerobicCellsInput): AerobicCellSpec[] {
  const km = Math.max(0, Number.isFinite(i.distanceKm) ? i.distanceKm : 0);
  const middle: AerobicCellSpec =
    i.mode === 'toStart'
      ? { key: 'arrival', value: i.etaSec != null && i.etaSec >= 0 ? i.etaSec : null }
      : i.mode === 'route'
        ? { key: 'kmLeft', value: i.routeKm != null && i.routeKm > 0 ? Math.max(0, i.routeKm - km) : null }
        : { key: 'km', value: km };
  const third: AerobicCellSpec =
    i.activity === 'cycling'
      ? { key: 'speed', value: i.paceSec > 0 ? i.paceSec : null }
      : i.activity === 'walking' || i.mode === 'toStart'
        ? { key: 'steps', value: estimateSteps(km) }
        : { key: 'pace', value: i.paceSec > 0 ? i.paceSec : null };
  return [{ key: 'time', value: Math.max(0, i.durationSec || 0) }, middle, third];
}
