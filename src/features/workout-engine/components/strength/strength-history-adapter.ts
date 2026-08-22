import type { WorkoutHistoryEntry } from '../../core/services/storage.service';
import type { StrengthSummaryPageProps } from './StrengthSummaryPage';

/**
 * Maps a saved WorkoutHistoryEntry (strength/recovery category) into the
 * subset of StrengthSummaryPageProps derivable from the doc, for isReadOnly
 * history display. Plays the same role for StrengthSummaryPage that
 * workoutHistoryEntryToHybridFinalizeResult plays for HybridSummary.
 *
 * Fields no real writer has ever persisted — difficulty, difficultyBolts,
 * programId, currentLevel, maxLevel, progressToNextLevel, levelGoals,
 * domainSets, precomputedProgression — are deliberately NOT returned here.
 * StrengthSummaryPage hides the UI sections that depend on them whenever
 * isReadOnly is true, so leaving them undefined is the correct behavior,
 * not a gap to paper over with invented values.
 *
 * `difficulty` is the one exception: StrengthSummaryPageProps requires it
 * (it's not optional) because useSummaryAnalytics' calorie estimate — the
 * only isReadOnly-reachable consumer, since useActivitySync/useXpAward
 * fully bypass in that mode — needs *a* Difficulty to compute from. Saved
 * strength/recovery docs hardcode calories:0 at save time (confirmed — no
 * real per-workout calorie figure was ever persisted either), so the
 * history view's calorie number is necessarily a same-formula estimate,
 * never the historically-exact figure. 'medium' is the neutral midpoint.
 */
export function workoutHistoryEntryToStrengthSummaryProps(
  entry: WorkoutHistoryEntry,
): Pick<
  StrengthSummaryPageProps,
  | 'duration'
  | 'totalReps'
  | 'completedExercises'
  | 'difficulty'
  | 'isRecovery'
  | 'trainingType'
  | 'totalPlannedSets'
  | 'rawExerciseLog'
  | 'programName'
  | 'savedXpEarned'
> {
  const segment = entry.segments?.[0];
  // Additive since 19.08.2026 (F1) — absent on pre-F1 docs and on some
  // recovery-trio docs, which have only the aggregate exercises/sets counts.
  // Degrades to an empty exercise breakdown rather than inventing per-set
  // data that was never captured.
  const exerciseLog = segment?.actual?.exerciseLog ?? [];

  const rawExerciseLog = exerciseLog.map((e) => ({
    exerciseId: e.exerciseId,
    exerciseName: e.exerciseName,
    segmentId: String(segment?.index ?? 0),
    confirmedReps: e.confirmedReps,
    targetReps: e.targetReps,
  }));

  // Per-exercise category (warmup/superset/stretch/main) is never persisted
  // — defaults to 'main', same accepted gap the investigation flagged for
  // ExerciseBreakdownCard's grouping.
  const completedExercises: StrengthSummaryPageProps['completedExercises'] = exerciseLog.map(
    (e) => ({
      id: e.exerciseId,
      name: e.exerciseName,
      category: 'main',
      sets: e.confirmedReps,
      totalReps: e.confirmedReps.reduce((sum, reps) => sum + reps, 0),
    }),
  );

  const totalReps = completedExercises.reduce((sum, ex) => sum + ex.totalReps, 0);

  return {
    duration: entry.duration,
    totalReps,
    completedExercises,
    difficulty: 'medium',
    isRecovery: entry.isRecovery ?? false,
    trainingType: 'strength',
    totalPlannedSets: segment?.planned?.sets,
    rawExerciseLog,
    // Weak signal — segment.label mirrors workoutPlan?.name only when that
    // was truthy at save time; falls back to StrengthSummaryPage's own
    // default ('תוכנית כל הגוף') when absent.
    programName: segment?.label,
    savedXpEarned: entry.xpEarned ?? 0,
  };
}
