/**
 * setsToMinutes — display-only conversion of a set count to an estimated
 * minutes label for the Daily Strength Ring (ring is sets-driven, minutes-shown).
 *
 * Derived from the engine's own duration model, NOT an invented constant:
 *   - Precise: per-set seconds = avgReps × secondsPerRep + restSeconds
 *     (see `calculateEstimatedDuration`, workout-budgeting.utils.ts:940;
 *      `secondsPerRep` default 3, exercise.types.ts:702).
 *   - Proxy (default, no per-exercise data): 2 min/set — the regular-set rate
 *     from the Fragmenter (`minutesPerSet = golden ? 3 : 2`, Fragmenter.ts:240).
 *
 * Pure. Independent of `SessionLog.durationMinutes` (which is `undefined` for
 * solo strength sessions — useActivitySync.ts:140).
 */

/** Regular-set minutes rate, from Fragmenter.ts:240 (golden sets are 3). */
export const FRAGMENTER_MINUTES_PER_SET = 2;
/** Default seconds-per-rep, from calculateEstimatedDuration (`?? 3`). */
export const DEFAULT_SECONDS_PER_REP = 3;
/** Representative reps per set when not supplied (display average). */
export const DEFAULT_AVG_REPS = 10;
/** Representative rest between sets when not supplied (seconds). */
export const DEFAULT_REST_SECONDS = 60;

export interface SetsToMinutesOpts {
  /** Average reps per set (rep-based sets). */
  avgReps?: number;
  /** Seconds per rep (exercise.secondsPerRep, default 3). */
  secondsPerRep?: number;
  /** Rest seconds between sets (level default rest). */
  restSeconds?: number;
}

/**
 * Convert a set count to estimated minutes.
 * - With any of `avgReps`/`secondsPerRep`/`restSeconds` → precise engine formula.
 * - Otherwise → the Fragmenter 2-min/set proxy.
 */
export function setsToMinutes(sets: number, opts?: SetsToMinutesOpts): number {
  if (!sets || sets <= 0) return 0;

  const hasPrecise =
    opts != null &&
    (opts.avgReps != null || opts.secondsPerRep != null || opts.restSeconds != null);

  if (hasPrecise) {
    const avgReps = opts!.avgReps ?? DEFAULT_AVG_REPS;
    const secPerRep = opts!.secondsPerRep ?? DEFAULT_SECONDS_PER_REP;
    const rest = opts!.restSeconds ?? DEFAULT_REST_SECONDS;
    const perSetSeconds = avgReps * secPerRep + rest;
    return Math.round((sets * perSetSeconds) / 60);
  }

  return Math.round(sets * FRAGMENTER_MINUTES_PER_SET);
}
