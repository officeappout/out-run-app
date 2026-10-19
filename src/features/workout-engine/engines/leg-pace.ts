/**
 * leg-pace — the owner's short-leg rule, shared by both engines.
 *
 * A run leg under 400 m gets NO pace: not live, not in the result. The
 * threshold constants come from the planned-run results module so the
 * hybrid / timed engines and the interval player can never disagree.
 */
import {
  MIN_PACE_METERS,
  SHORT_LEG_METERS,
  SHORT_LEG_SECONDS,
} from '../players/running/lib/planned-rep-results';

export { SHORT_LEG_METERS };

export interface LegTarget {
  /** Planned distance (m), when the leg is distance-based. */
  distanceM?: number | null;
  /** Planned duration (s), when the leg is time-based. */
  durationSec?: number | null;
}

/**
 * True when the PLAN makes this a short leg (no live pace shown). A
 * distance target wins; a time target under 90 s counts as short (same
 * interpretation as the interval player). No target ⇒ not short.
 */
export function isShortLegTarget(t: LegTarget | null | undefined): boolean {
  if (!t) return false;
  if (t.distanceM != null && t.distanceM > 0) return t.distanceM < SHORT_LEG_METERS;
  if (t.durationSec != null && t.durationSec > 0) return t.durationSec < SHORT_LEG_SECONDS;
  return false;
}

/**
 * Average pace (sec/km) for a leg, or null when the rule forbids one:
 * planned leg under 400 m, covered distance under 400 m, or too little
 * movement to be anything but GPS noise.
 */
export function legPaceSecPerKm(
  coveredM: number,
  durationSec: number,
  target?: LegTarget | null,
): number | null {
  if (isShortLegTarget(target)) return null;
  if (!(coveredM >= SHORT_LEG_METERS) || coveredM < MIN_PACE_METERS) return null;
  if (!(durationSec > 0)) return null;
  return Math.round(durationSec / (coveredM / 1000));
}

/** Live pace is visible only on legs planned at 400 m or more. */
export function showsLivePace(target: LegTarget | null | undefined): boolean {
  return !isShortLegTarget(target);
}
