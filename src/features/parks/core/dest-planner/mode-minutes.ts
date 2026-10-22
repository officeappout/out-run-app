/**
 * Mode tabs (הליכה / ריצה / רכיבה): minutes for each mode, and the default
 * mode. Pure. Speeds are the app's one pace table (SPEED_KMH); the active
 * mode shows the generator's own minutes for its shortest option so the tab
 * and the card never disagree.
 */
import { SPEED_KMH } from '../services/route-request.utils';
import type { PlannerMode } from './types';

export const PLANNER_MODES: readonly PlannerMode[] = ['walking', 'running', 'cycling'];

const finitePos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Minutes to cover `km` in `mode` (≥ 1), or null without a usable distance. */
export function minutesForKm(km: number | null | undefined, mode: PlannerMode): number | null {
  if (!finitePos(km)) return null;
  return Math.max(1, Math.round((km / SPEED_KMH[mode]) * 60));
}

/**
 * Minutes per tab. `km` = the shortest known distance to the destination;
 * `active` = the mode whose routes are on screen and its shortest option's
 * minutes (wins over the estimate for that tab).
 */
export function modeMinutes(
  km: number | null | undefined,
  active?: { mode: PlannerMode; minutes: number | null | undefined } | null,
): Record<PlannerMode, number | null> {
  const out = {} as Record<PlannerMode, number | null>;
  for (const m of PLANNER_MODES) out[m] = minutesForKm(km, m);
  if (active && finitePos(active.minutes)) out[active.mode] = Math.round(active.minutes);
  return out;
}

/** Default tab = the user's last activity; anything else (strength, unknown) → walking. */
export function defaultPlannerMode(lastActivity: unknown): PlannerMode {
  return lastActivity === 'running' || lastActivity === 'cycling' || lastActivity === 'walking'
    ? lastActivity
    : 'walking';
}
