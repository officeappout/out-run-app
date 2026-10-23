/**
 * replacement-rules.util — which exercise may replace which on a location switch
 * (enable_location_gate_v1, owner decisions 23.10). PURE.
 *
 * A candidate must: have a method with media (video OR image) at the new location; share the original's
 * primary muscle (when it has one) and reps-vs-hold type; not already be in the workout (exclude set,
 * handled by the caller). Level: the SAME level first; exactly ONE level easier only when no same-level
 * candidate exists and only for non-pinned slots; never harder. Goal / skill (pinned) slots: same level,
 * and only inside their own base_movement_id family (the caller queries the family).
 * The movement group is enforced by the replacement service query itself.
 */
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';
import type { AlternativeExerciseOption } from '@/features/workout-engine/generator/services/exercise-replacement.service';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { isTimeBasedExercise } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { methodHasAnyMedia } from '@/features/workout-engine/shared/utils/method-media.utils';

export interface SlotRules {
  original: Exercise;
  /** The slot's level (programLevel, else the exercise's own first target level). */
  level: number;
  /** Goal / skill exercise. */
  pinned: boolean;
  isTimeBased: boolean;
}

/** Goal exercises and skill-priority exercises are pinned to their own family. */
export function isPinnedSlot(we: Pick<WorkoutExercise, 'isGoalExercise' | 'priority'>): boolean {
  return we.isGoalExercise === true || we.priority === 'skill';
}

export function slotRulesFor(we: WorkoutExercise): SlotRules {
  return {
    original: we.exercise,
    level: we.programLevel ?? we.exercise.targetPrograms?.[0]?.level ?? 1,
    pinned: isPinnedSlot(we),
    isTimeBased: isTimeBasedExercise(we.exercise),
  };
}

/** Candidate check applied BEFORE the service's cap (see SwapQueryOptions.candidateFilter). */
export function buildCandidateFilter(rules: SlotRules) {
  return (c: { exercise: Exercise; method: ExecutionMethod; level: number }): boolean => {
    if (!methodHasAnyMedia(c.method)) return false;
    const muscle = rules.original.primaryMuscle;
    if (muscle && c.exercise.primaryMuscle !== muscle) return false;
    if (isTimeBasedExercise(c.exercise) !== rules.isTimeBased) return false;
    if (rules.pinned) {
      const family = rules.original.base_movement_id;
      if (!family || family === 'unspecified_movement' || c.exercise.base_movement_id !== family) return false;
      return c.level === rules.level;
    }
    return c.level === rules.level || c.level === rules.level - 1;
  };
}

/** Same level first; one level easier only for non-pinned slots. Input is already filtered. */
export function pickReplacement(
  options: readonly AlternativeExerciseOption[],
  rules: SlotRules,
): AlternativeExerciseOption | null {
  const withMethod = options.filter((o) => !!o.selectedExecutionMethod);
  const same = withMethod.find((o) => o.resolvedLevel === rules.level);
  if (same) return same;
  if (rules.pinned) return null;
  return withMethod.find((o) => o.resolvedLevel === rules.level - 1) ?? null;
}
