/**
 * derive-swapped-entry.util — the PURE per-exercise re-derivation applied when one
 * WorkoutExercise is swapped for another exercise + method. Extracted VERBATIM from
 * `useExerciseSwap.handleExerciseReplace` (Phase 3.5) so the single-swap and the bulk
 * swap-all paths stay byte-aligned.
 *
 * Scope: this derives the SINGLE swapped entry (metric identity, level-delta volume
 * scaling, role-pin, own pair-link). Pair-HEALING across sibling entries stays in the
 * caller — single-swap re-stitches one partner; bulk swap-all runs a two-pass batch
 * heal after all replacements are known.
 *
 * PURE: no React, no I/O.
 */
import { isTimeBasedExercise } from '@/features/workout-engine/logic/workout-budgeting.utils';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';

// Asymmetric volume multipliers (mirror useExerciseSwap / WorkoutGenerator.substituteExercise):
// a harder variant trims 10%/level; an easier variant adds 15%/level.
const VOLUME_DELTA_HARDER = 0.1;
const VOLUME_DELTA_EASIER = 0.15;
const MIN_REPS_FLOOR = 4;
const MAX_REPS_CAP = 20;
const MIN_HOLD_FLOOR_S = 8;
const METRIC_RESET_HOLD_REPS = 30;
const METRIC_RESET_HOLD_RANGE = { min: 20, max: 45 };
const METRIC_RESET_REPS = 12;
const METRIC_RESET_RANGE = { min: 6, max: 12 };

/**
 * Build the swapped WorkoutExercise entry: keep `oldWE`'s slot metadata, swap in
 * `newExercise` + `method`, re-derive the metric identity (reps↔hold) and level-delta
 * volume, pin the role, and clear any prior keep+mark flag. `oldWE.exercise` supplies
 * the "from" level (the caller matches the entry being replaced).
 */
export function deriveSwappedEntry(
  oldWE: WorkoutExercise,
  newExercise: Exercise,
  method: ExecutionMethod,
): WorkoutExercise {
  const newIsTimeBased = isTimeBasedExercise(newExercise);
  const metricChanged = newIsTimeBased !== oldWE.isTimeBased;

  const oldLevel = oldWE.exercise.targetPrograms?.[0]?.level ?? 0;
  const newLevel = newExercise.targetPrograms?.[0]?.level ?? oldLevel;
  const levelDelta = newLevel - oldLevel;

  let adjustedReps = oldWE.reps;
  let adjustedRange = oldWE.repsRange;

  if (metricChanged) {
    if (newIsTimeBased) {
      adjustedReps = METRIC_RESET_HOLD_REPS;
      adjustedRange = { ...METRIC_RESET_HOLD_RANGE };
    } else {
      adjustedReps = METRIC_RESET_REPS;
      adjustedRange = { ...METRIC_RESET_RANGE };
    }
  }

  if (levelDelta !== 0) {
    const multiplier =
      levelDelta > 0
        ? Math.max(0.1, 1 - VOLUME_DELTA_HARDER * levelDelta)
        : 1 + VOLUME_DELTA_EASIER * Math.abs(levelDelta);
    const floor = newIsTimeBased ? MIN_HOLD_FLOOR_S : MIN_REPS_FLOOR;
    const cap = !newIsTimeBased && levelDelta < 0 ? MAX_REPS_CAP : Infinity;
    const scaleValue = (v: number): number =>
      Math.min(cap, Math.max(floor, Math.round(v * multiplier)));
    adjustedReps = scaleValue(adjustedReps);
    if (adjustedRange) {
      adjustedRange = { min: scaleValue(adjustedRange.min), max: scaleValue(adjustedRange.max) };
    }
  }

  const thisPartnerLink = (oldWE as any).pairedWith as string | null | undefined;

  return {
    ...oldWE,
    exercise: newExercise,
    method: method as WorkoutExercise['method'],
    isTimeBased: newIsTimeBased,
    // Pin role or force 'main' (avoid inheriting a 'warmup' role from the new doc).
    exerciseRole: oldWE.exerciseRole ?? 'main',
    programLevel: newLevel || oldWE.programLevel,
    reps: adjustedReps,
    repsRange: adjustedRange,
    wasSwapped: true,
    // A successful method/exercise swap clears any prior keep+mark flag.
    dimensionUnavailable: undefined,
    ...(thisPartnerLink ? { pairedWith: thisPartnerLink } : {}),
  };
}
