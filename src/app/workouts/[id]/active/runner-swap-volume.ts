/**
 * enable_swap_fixes_v1 — the active player's swap re-derives the volume like the preview
 * does (deriveSwappedVolume): a reps↔hold change resets to that metric's default target,
 * a level change scales the range. Flag off, the player keeps copying the old numbers.
 *
 * Works on the runner's exercise shape (display strings + repsRange), so the reps /
 * duration strings are rebuilt in the same format enrichExercise writes.
 */
import { deriveSwappedVolume } from '@/features/workouts/components/workout-preview-drawer/utils/derive-swapped-entry.util';

export interface RunnerSwapSource {
  exerciseType?: 'reps' | 'time' | string;
  sets?: number;
  reps?: string;
  duration?: string;
  repsRange?: { min: number; max: number };
  exerciseLevel?: number;
}

export interface RunnerSwapVolume {
  exerciseType: 'reps' | 'time';
  repsRange?: { min: number; max: number };
  reps?: string;
  duration?: string;
}

const rangeText = (r: { min: number; max: number }) => (r.min !== r.max ? `${r.min}-${r.max}` : `${r.min}`);

export function deriveRunnerSwapVolume(
  old: RunnerSwapSource,
  newIsTimeBased: boolean,
  newLevel: number | undefined,
  isUnilateral: boolean,
): RunnerSwapVolume {
  const oldIsTimeBased = old.exerciseType === 'time';
  const levelDelta =
    typeof newLevel === 'number' && typeof old.exerciseLevel === 'number' ? newLevel - old.exerciseLevel : 0;
  const metricChanged = newIsTimeBased !== oldIsTimeBased;
  const exerciseType = newIsTimeBased ? 'time' : 'reps';

  // Nothing numeric to scale and the metric is unchanged → keep the old strings.
  if (!old.repsRange && !metricChanged) {
    return { exerciseType, reps: old.reps, duration: old.duration };
  }
  const base = old.repsRange ?? { min: 0, max: 0 };
  const { repsRange } = deriveSwappedVolume({
    oldIsTimeBased,
    newIsTimeBased,
    levelDelta,
    reps: base.max,
    repsRange: base,
  });
  const r = repsRange ?? base;
  const setsPrefix = old.sets ? `${old.sets}×` : '';
  return newIsTimeBased
    ? { exerciseType, repsRange: r, duration: `${setsPrefix}${rangeText(r)} שניות`, reps: undefined }
    : { exerciseType, repsRange: r, reps: `${setsPrefix}${rangeText(r)} חזרות${isUnilateral ? ' (לכל צד)' : ''}`, duration: undefined };
}
