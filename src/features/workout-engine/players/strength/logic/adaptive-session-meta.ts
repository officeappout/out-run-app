/**
 * 3a (enable_adaptive_reps_v1): the per-exercise session context the double progression needs,
 * built from the confirmed-reps log + the plan (pure). Values themselves come from the
 * WorkoutExerciseResult list saveExerciseHistory already receives.
 *
 * Not counted (skip): swapped exercise, warm-up / cool-down, a deload / heat / calm-return
 * session (adaptiveSkip stamped at generation), or no prescribed range on the entry.
 */
import type { AdaptiveSessionMeta } from '@/features/workout-engine/services/exercise-history.service';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';

interface PlanLike {
  segments?: { exercises?: { id: string; isTimeBased?: boolean; exerciseType?: string }[] }[];
}

const NOT_COUNTED_ROLES = new Set(['warmup', 'cooldown']);

function holdIds(plan: PlanLike | null | undefined): Set<string> {
  const ids = new Set<string>();
  for (const seg of plan?.segments ?? []) {
    for (const ex of seg.exercises ?? []) {
      if (ex.isTimeBased === true || ex.exerciseType === 'time') ids.add(ex.id);
    }
  }
  return ids;
}

export function buildAdaptiveSessionMeta(
  rawLog: ExerciseResultLog[],
  plan: PlanLike | null | undefined,
): Map<string, AdaptiveSessionMeta> {
  const holds = holdIds(plan);
  const out = new Map<string, AdaptiveSessionMeta>();
  for (const entry of rawLog) {
    const range = entry.prescribedRange;
    const isHold = holds.has(entry.exerciseId) || (entry.repsSource ?? []).includes('timer');
    out.set(entry.exerciseId, {
      sources: entry.repsSource,
      target: entry.targetReps,
      range: range ? { min: range.min, max: range.max } : { min: NaN, max: NaN },
      isHold,
      skip:
        !range
        || entry.wasSwapped === true
        || entry.adaptiveSkip === true
        || (entry.role != null && NOT_COUNTED_ROLES.has(entry.role)),
    });
  }
  return out;
}
