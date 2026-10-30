/**
 * rest-reps-rules — owner rules 30.10.2026 (training-audit PR 8b). Pure.
 *
 *   - A regular dynamic exercise never gets fewer than 3 reps; only true skills
 *     (one-arm pull-up, levers, planche, HSPU, muscle-up, flag, pistol) keep 1–3.
 *   - Beginners (level ≤ 5) rest less on work at or below their level — the load is low:
 *     ×0.6 of the tier rest, never under 45 s. Above-level work keeps its full rest.
 *   - Rest is shortened for time mainly on easier work (1+ levels below the user): an
 *     at-level exercise gives up at most down to 90 s, above-level work never. Exception:
 *     sessions of 20 min or less, where the minimum-exercise floor would otherwise blow the
 *     time — there at-level work may still go to the session floor (until short sessions
 *     swap in easier variants instead).
 */
import type { TierName } from './workout-generator.types';

export const DYNAMIC_REP_FLOOR = 3;
export const BEGINNER_MAX_LEVEL = 5;
export const BEGINNER_REST_FACTOR = 0.6;
export const BEGINNER_REST_FLOOR_SEC = 45;

/** Rep floor for a regular (non-true-skill) rep exercise, or null when it does not apply. */
export function applyDynamicRepFloor(
  trueSkill: boolean,
  isTimeBased: boolean,
  reps: number,
  repsRange: { min: number; max: number },
): { reps: number; repsRange: { min: number; max: number } } | null {
  if (trueSkill || isTimeBased) return null;
  if (reps >= DYNAMIC_REP_FLOOR && repsRange.min >= DYNAMIC_REP_FLOOR) return null;
  const min = Math.max(repsRange.min, DYNAMIC_REP_FLOOR);
  return { reps: Math.max(reps, DYNAMIC_REP_FLOOR), repsRange: { min, max: Math.max(repsRange.max, min) } };
}

/** Rest for a beginner on at-level / easier work; anything else unchanged. */
export function beginnerRest(restSeconds: number, tierName: TierName, userLevel: number | undefined): number {
  if (userLevel == null || userLevel > BEGINNER_MAX_LEVEL) return restSeconds;
  if (tierName === 'hard' || tierName === 'elite') return restSeconds;
  return Math.max(BEGINNER_REST_FLOOR_SEC, Math.round((restSeconds * BEGINNER_REST_FACTOR) / 5) * 5);
}

export const AT_LEVEL_REST_FLOOR_SEC = 90;

/** Lowest rest a short session may cut this exercise to (null = never cut). */
export const SHORT_SESSION_MAX_MIN = 20;

export function restCompressionFloor(tier: TierName | string | undefined, sessionFloor: number, durationCapMin?: number): number | null {
  if (tier === 'hard' || tier === 'elite') return null;
  if (tier === 'match' && !(durationCapMin != null && durationCapMin <= SHORT_SESSION_MAX_MIN)) {
    return Math.max(sessionFloor, AT_LEVEL_REST_FLOOR_SEC);
  }
  return sessionFloor;
}
