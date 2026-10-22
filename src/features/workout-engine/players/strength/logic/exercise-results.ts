/**
 * The progression engine's input for a finished strength session — built from
 * the confirmed-reps log and the plan. Extracted from the active workout page
 * (22.10.2026) so the background write (processWorkoutCompletion) and the
 * level-up v2 instant preview use the exact same exercise list.
 */
import type { WorkoutExerciseResult } from '@/features/user/core/types/progression.types';
import type { ExerciseResultLog } from '../hooks/useWorkoutStateMachine';

interface PlanLike {
  segments?: { exercises?: { id: string; programIds?: string[] }[] }[];
}

/**
 * exerciseId → programIds[] from the loaded plan (populated at workout
 * generation from the source exercise's targetPrograms + programIds) — unlocks
 * cross-program credit in progression.service.ts.
 */
export function buildExerciseProgramLookup(plan: PlanLike | null | undefined): Map<string, string[]> {
  const lookup = new Map<string, string[]>();
  for (const seg of plan?.segments ?? []) {
    for (const ex of seg.exercises ?? []) {
      if (ex.programIds && ex.programIds.length > 0) lookup.set(ex.id, ex.programIds);
    }
  }
  return lookup;
}

export function buildWorkoutExerciseResults(
  rawLog: ExerciseResultLog[],
  exerciseProgramLookup: Map<string, string[]>,
): WorkoutExerciseResult[] {
  return rawLog.map((entry) => {
    const linkedProgramIds = exerciseProgramLookup.get(entry.exerciseId) ?? [];
    // Value 1 is a presence-marker — detectLinkedProgramsFromExercises only
    // checks `!== undefined`, so the numeric value is unused.
    const programLevels: Record<string, number> = {};
    for (const pid of linkedProgramIds) programLevels[pid] = 1;

    return {
      exerciseId: entry.exerciseId,
      exerciseName: entry.exerciseName,
      programLevels,
      setsCompleted: entry.confirmedReps.length,
      repsPerSet: entry.confirmedReps,
      targetReps: entry.targetReps,
      isCompound: false,
      ...(entry.confirmedRepsRight && { repsPerSetRight: entry.confirmedRepsRight }),
      ...(entry.confirmedRepsLeft && { repsPerSetLeft: entry.confirmedRepsLeft }),
    };
  });
}

/** Every exercise id in the plan (the level-up preview pre-loads their docs). */
export function planExerciseIds(plan: PlanLike | null | undefined): string[] {
  const ids: string[] = [];
  for (const seg of plan?.segments ?? []) {
    for (const ex of seg.exercises ?? []) if (ex.id) ids.push(ex.id);
  }
  return Array.from(new Set(ids));
}
