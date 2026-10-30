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
import { isTimeBasedExercise, rederiveVolumeForSwappedExercise } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { formatRepRange } from '@/features/workout-engine/core/presentation/PresentationFormatter';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { DifficultyLevel } from '@/features/workout-engine/logic/workout-generator.types';
import { swapStampForEntry } from '@/features/workout-engine/adaptation/exercise-log-stamp';

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
 * The volume half of a swap (shared with the active player under enable_swap_fixes_v1):
 * a reps↔hold change resets to that metric's default target; a level change scales it
 * (harder −10%/level, easier +15%/level, with floors / a reps cap).
 */
export function deriveSwappedVolume(i: {
  oldIsTimeBased: boolean | undefined;
  newIsTimeBased: boolean;
  levelDelta: number;
  reps: number;
  repsRange?: { min: number; max: number };
}): { reps: number; repsRange?: { min: number; max: number } } {
  const { newIsTimeBased, levelDelta } = i;
  const metricChanged = newIsTimeBased !== i.oldIsTimeBased;
  let adjustedReps = i.reps;
  let adjustedRange = i.repsRange;

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
  return { reps: adjustedReps, repsRange: adjustedRange };
}

/**
 * Build the swapped WorkoutExercise entry: keep `oldWE`'s slot metadata, swap in
 * `newExercise` + `method`, re-derive the metric identity (reps↔hold) and level-delta
 * volume, pin the role, and clear any prior keep+mark flag. `oldWE.exercise` supplies
 * the "from" level (the caller matches the entry being replaced).
 *
 * A reps↔hold change takes the NEW exercise's own prescription (phone test AB3): the engine's
 * rederiveVolumeForSwappedExercise for its tier against the user's level (the replaced entry's
 * levelDelta plus the level step between the two exercises) and the workout's difficulty, including
 * its own hold cap. The display string (formattedRepRange) is rebuilt from the new numbers, never carried over.
 */
export function deriveSwappedEntry(
  oldWE: WorkoutExercise,
  newExercise: Exercise,
  method: ExecutionMethod,
  difficulty: DifficultyLevel = 2,
): WorkoutExercise {
  const newIsTimeBased = isTimeBasedExercise(newExercise);

  const oldLevel = oldWE.exercise.targetPrograms?.[0]?.level ?? 0;
  const newLevel = newExercise.targetPrograms?.[0]?.level ?? oldLevel;
  const levelDelta = newLevel - oldLevel;

  const metricChanged = newIsTimeBased !== oldWE.isTimeBased; // raw (undefined ≠ false), as before
  const { reps: adjustedReps, repsRange: adjustedRange } = metricChanged
    ? rederiveVolumeForSwappedExercise(newExercise, (oldWE.levelDelta ?? 0) + levelDelta, difficulty)
    : deriveSwappedVolume({
        oldIsTimeBased: oldWE.isTimeBased,
        newIsTimeBased,
        levelDelta,
        reps: oldWE.reps,
        repsRange: oldWE.repsRange,
      });

  const thisPartnerLink = (oldWE as any).pairedWith as string | null | undefined;

  const next: WorkoutExercise = {
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
    // Soft-adaptation Phase 0 (data only): original prescribed exercise +
    // the user's domain level before the swap. Same-exercise method swaps
    // carry forward whatever was there. Read by nothing that changes behaviour.
    ...swapStampForEntry(oldWE, newExercise.id),
    // A successful method/exercise swap clears any prior keep+mark flag.
    dimensionUnavailable: undefined,
    // The next-workout tag explains the old exercise's change, not the new one's.
    ...(newExercise.id !== oldWE.exercise.id ? { adaptiveNote: undefined } : {}),
    ...(thisPartnerLink ? { pairedWith: thisPartnerLink } : {}),
  };
  // The old entry's "8-12 חזרות" string would win over the new numbers on the card (AB3).
  if (oldWE.formattedRepRange != null) next.formattedRepRange = formatRepRange(next);
  return next;
}
