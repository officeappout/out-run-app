/**
 * hybrid-walk-state — what the live hybrid layer shows on an aerobic leg (G3.1, Sderot pilot,
 * behind `enable_walk_to_first_stop`). Pure; HybridStationLayer applies it.
 *
 * Root cause this fixes: the big "📍 הגעתי לתחנה" CTA was gated on proximity ALONE
 * (isApproachingStation). A station within the approach radius of the drop-in point (a park at /
 * near the loop start — common, since generated loops start at the user and stops are any park
 * within 180 m of the path) showed the CTA on the very first GPS fix: the user "landed" in an
 * arrived state without walking anywhere.
 *
 * Fix: the big CTA needs the leg to be ARMED — at least one fix OUTSIDE the radius seen on this
 * leg (i.e. the user really walked INTO the radius). Until then a persistent walking card shows
 * "התחל ללכת · בעוד X מ׳ תחנה ראשונה" (live distance) with a small secondary "הגעתי" — so a user
 * who genuinely starts at the park can still arrive. Same for every stop.
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';
import { formatApproxDistance } from './hybrid-intro-format';

export type WalkUiState = 'none' | 'final' | 'approach' | 'walking';

export interface WalkUiInput {
  phase: string;
  isFinalLeg: boolean;
  /** The next segment is a station (its coordinates may still be unknown). */
  hasNextStation: boolean;
  /** Inside the approach radius right now (false without a fix / coordinates). */
  withinRadius: boolean;
  /** A fix outside the radius has been seen on this leg. */
  armed: boolean;
}

export function resolveWalkUiState(i: WalkUiInput): WalkUiState {
  if (i.phase !== 'aerobic') return 'none';
  if (i.isFinalLeg) return 'final';
  if (!i.hasNextStation) return 'none';
  return i.withinRadius && i.armed ? 'approach' : 'walking';
}

/**
 * Arming rule: armed once a real fix lands OUTSIDE the radius on this leg. Needs a distance —
 * no fix / no coordinates never arms (the walking card's manual "הגעתי" covers that case).
 */
export function nextArmed(armed: boolean, distanceM: number | null, withinRadius: boolean): boolean {
  return armed || (distanceM != null && !withinRadius);
}

/** The walking card's line, e.g. "התחל ללכת · בעוד 350 מ׳ תחנה ראשונה". */
export function walkingLine(
  gender: AppGender | null | undefined,
  stationNumber: number | null,
  distanceM: number | null,
): string {
  const first = stationNumber == null || stationNumber <= 1;
  const verb = first
    ? g(gender, 'התחל ללכת', 'התחילי ללכת', 'מתחילים ללכת')
    : g(gender, 'המשך ללכת', 'המשיכי ללכת', 'ממשיכים ללכת');
  const target = first ? 'תחנה ראשונה' : 'התחנה הבאה';
  return distanceM != null
    ? `${verb} · בעוד ${formatApproxDistance(distanceM)} ${target}`
    : `${verb} · ${first ? 'לתחנה הראשונה' : 'לתחנה הבאה'}`;
}
