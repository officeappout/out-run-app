/**
 * live-level — the level / % the summary's level ring shows, from the
 * stored level-up value (enable_levelup_v2), the progression result, or the
 * pre-workout props. Pure; shared by useSummaryAnalytics (what the screen
 * shows) and the history snapshot (what gets saved), so the two can't drift.
 */
import type { WorkoutCompletionResult } from '@/features/user/core/types/progression.types';

export interface LiveLevelInput {
  currentLevel: number;
  progressToNextLevel: number;
  progressionResult: WorkoutCompletionResult | null | undefined;
  levelOverride?: { level: number; percent: number };
}

export function resolveLiveLevel({
  currentLevel,
  progressToNextLevel,
  progressionResult,
  levelOverride,
}: LiveLevelInput): { liveLevel: number; livePercent: number } {
  const liveLevel = levelOverride
    ? levelOverride.level
    : progressionResult?.success && progressionResult.activeProgramGain.leveledUp
      ? progressionResult.activeProgramGain.newLevel ?? currentLevel + 1
      : currentLevel;
  const livePercent = levelOverride
    ? Math.min(99, Math.round(levelOverride.percent))
    : progressionResult?.success
      ? Math.round(progressionResult.activeProgramGain.newPercent)
      : progressToNextLevel;
  return { liveLevel, livePercent };
}
