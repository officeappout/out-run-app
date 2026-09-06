import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { DifficultyLevel } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { HomeWorkoutOptions } from '@/features/workout-engine/services/home-workout.types';

/**
 * Pure options-builder for UserWorkoutAdjuster's explicit slider/generator
 * request (docs/workout-engine/03-CHANGES.md Addendum 15, F1). Kept in its
 * own non-JSX file so it's importable from a test without pulling in
 * UserWorkoutAdjuster.tsx's JSX (this repo has no React component test
 * harness / @testing-library/react — a .tsx import fails vitest's parser).
 *
 * The bug this fixes: `generateHomeWorkout` always returns the D2 balanced
 * bolt unless `targetDifficulty` is set (home-workout.service.ts:212-220 —
 * its own doc comment says so explicitly). The call used to pass
 * `difficulty` without it, so a user tapping "קל" (1) or "עצים" (3) silently
 * received the exact same D2 workout as "בינוני" (2) — the explicit choice
 * was discarded 100% of the time. New meta-rule (00-PLAN.md §16): explicit
 * choice must be honored, not silently substituted.
 */
export function buildAdjusterWorkoutOptions(params: {
  userProfile: UserFullProfile;
  location: ExecutionLocation;
  availableTime: number;
  difficulty: DifficultyLevel;
  derivedRequiredDomains: string[] | undefined;
  isEquipped: boolean;
  remainingWeeklyBudget: number | undefined;
  weeklyBudgetUsagePercent: number | undefined;
  selectedSkillId: string | null;
  parkEquipmentIds: string[] | undefined;
}): HomeWorkoutOptions {
  return {
    userProfile: params.userProfile,
    testLocation: params.location,
    availableTime: params.availableTime,
    difficulty: params.difficulty,
    targetDifficulty: params.difficulty,
    requiredDomains: params.derivedRequiredDomains,
    equipmentOverride: params.isEquipped ? undefined : [],
    remainingWeeklyBudget: (params.remainingWeeklyBudget ?? 0) > 0 ? params.remainingWeeklyBudget : undefined,
    weeklyBudgetUsagePercent: (params.weeklyBudgetUsagePercent ?? 0) > 0 ? params.weeklyBudgetUsagePercent : undefined,
    scheduledProgramIds: params.selectedSkillId ? [params.selectedSkillId] : undefined,
    parkEquipmentIds: params.parkEquipmentIds?.length ? params.parkEquipmentIds : undefined,
  } as HomeWorkoutOptions;
}
