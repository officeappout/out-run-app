/**
 * level-ring-visibility — G8.2 summary guard (Sderot pilot, 16.10.2026).
 *
 * With `enable_no_auto_strength_level` ON, a strength workout by a user who never did the
 * strength questionnaire writes no level, and processWorkoutCompletion returns
 * `skipped: 'no_questionnaire'`. The summary's level ring must then stay hidden: it would
 * otherwise show the fallback level (`currentLevel ?? 1`) — a made-up level, the exact thing
 * G8.2 removes. With the flag OFF `skipped` is never set, so the ring behaves as before.
 *
 * Pure (no React) so it is testable in the node-only vitest setup.
 */
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';

export function isProgressionSkippedNoQuestionnaire(
  result: Pick<WorkoutCompletionResult, 'skipped'> | null | undefined,
): boolean {
  return result?.skipped === 'no_questionnaire';
}

/** The level ring shows on a live (not history) summary unless progression was skipped. */
export function shouldShowLevelRing({
  isReadOnly,
  progressionResult,
}: {
  isReadOnly: boolean;
  progressionResult: Pick<WorkoutCompletionResult, 'skipped'> | null | undefined;
}): boolean {
  return !isReadOnly && !isProgressionSkippedNoQuestionnaire(progressionResult);
}
