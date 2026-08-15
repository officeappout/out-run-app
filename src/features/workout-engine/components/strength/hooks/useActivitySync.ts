'use client';

import { useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { syncWorkoutCompletion } from '@/features/workout-engine/services/completion-sync.service';
import { trackMuscleUsage } from '@/features/workout-engine/services/split-decision';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { RECOVERY_DAY_BADGE_FIX_ENABLED } from '@/config/feature-flags';

import type { CompletedExercise, Difficulty } from '../utils/summary.utils';

/**
 * useActivitySync — single-shot Firestore + Zustand fan-out on summary mount.
 *
 * Pure side-effect hook (returns `void`).  On first mount fires four
 * coordinated writes (via `runActivitySync`, see below):
 *   1. `syncWorkoutCompletion(...)`  — Activity Store (rings + streak)
 *   2. `addCoins(...)`               — Progression Store (global coin balance)
 *   3. `recordStrengthSession(...)`  — Weekly Volume Store (planned-vs-actual)
 *   4. `trackMusclesForShield(...)`  — 48-hour muscle shield (split decision)
 *
 * **Behaviour fix (S-12 batch):**
 * Replaced `[...new Set([...])]` spread with `Array.from(new Set([...]))` so
 * the build target no longer needs `--downlevelIteration`.
 *
 * Mount-only — guarded by a ref so React 18 StrictMode double-invocation
 * doesn't trigger duplicate Firestore writes.
 *
 * Extracted from StrengthSummaryPage.tsx (Decoupling Step S-7).
 *
 * **RECOVERY_VIDEO_SKIP_SUMMARY_ENABLED (13.08.2026):** the four writes
 * themselves now live in the standalone `runActivitySync` function below —
 * this hook is just a mount-once wrapper around it. That lets
 * active/page.tsx's handleComplete call the exact same write logic directly
 * (no summary-screen mount) for the recovery-video-trio shortcut path,
 * instead of duplicating it by hand. Behaviour for every existing caller of
 * this hook is unchanged — same writes, same single-fire-on-mount guarantee.
 */

const LEG_MUSCLES: ReadonlySet<MuscleGroup> = new Set<MuscleGroup>([
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'hip_flexors',
]);

export interface UseActivitySyncParams {
  /** Source program training type (cardio / strength) — picks the activity ring. */
  trainingType?: 'strength' | 'cardio';
  /** Session duration in whole minutes (from `useSummaryAnalytics`). */
  durationMinutes: number;
  /** MET-derived calorie estimate. */
  calories: number;
  /** Coins earned this session (1:1 with calories). */
  coins: number;
  /** Display title of the workout / program. */
  programName: string;
  /** Active program id — pipes through to the volume + muscle-shield writers. */
  programId?: string;
  /** Raw exercise log from StrengthRunner (preferred over `completedExercises`). */
  rawExerciseLog?: {
    exerciseId: string;
    exerciseName: string;
    segmentId: string;
    confirmedReps: number[];
    targetReps: number;
  }[];
  /** Aggregated completed exercises (fallback when `rawExerciseLog` is absent). */
  completedExercises: CompletedExercise[];
  /** Total planned sets from the generator (drives volume ratio). */
  totalPlannedSets?: number;
  /** Workout difficulty — fallback when `difficultyBolts` is absent. */
  difficulty: Difficulty;
  /** Numeric bolt difficulty (1-3) from the workout generator. */
  difficultyBolts?: 1 | 2 | 3;
  /** Whether this was a recovery session (skip volume budget). */
  isRecovery: boolean;
  /** Per-domain set counts for the weekly volume store (Phase 3). */
  domainSets?: Record<string, number>;
}

/**
 * runActivitySync — the actual four-write fan-out (see file header).
 *
 * Standalone, plain async function (NOT a hook) — safe to call from outside
 * React's render/effect lifecycle. Reads the two Zustand actions it needs
 * via `.getState()` instead of the hook form, since there is no component
 * to subscribe from here; this is the exact same action reference the hook
 * form would have returned (Zustand action functions are stable, defined
 * once on the store), so behaviour is unchanged for the existing caller.
 *
 * `useActivitySync` below is now a thin mount-once wrapper around this.
 */
export async function runActivitySync(params: UseActivitySyncParams): Promise<void> {
  const {
    trainingType,
    durationMinutes,
    calories,
    coins,
    programName,
    programId,
    rawExerciseLog,
    completedExercises,
    totalPlannedSets,
    difficulty,
    difficultyBolts,
    isRecovery,
    domainSets,
  } = params;

  // 1. Activity Store (rings + streak)
  const activityCategory = trainingType === 'cardio' ? 'cardio' : 'strength';
  syncWorkoutCompletion({
    workoutType: 'strength',
    durationMinutes,
    calories,
    activityCategory,
    displayIcon: 'dumbbell',
    workoutTitle: programName,
    // RECOVERY_DAY_BADGE_FIX_ENABLED — single write choke point (see
    // feature-flags.ts). While false, `isRecovery` is never passed through
    // regardless of this session's real value, so dailyProgress.isRecovery
    // is never written `true` and every downstream Beast-Mode-suppression
    // branch stays unreachable.
    isRecovery: RECOVERY_DAY_BADGE_FIX_ENABLED ? isRecovery : undefined,
  });

  // 2. Progression Store (global coins)
  console.log('[ActivitySync] Adding coins to ProgressionStore:', coins);
  useProgressionStore.getState().addCoins(coins);

  // 3. Weekly Volume Store
  const actualSetsCompleted = rawExerciseLog && rawExerciseLog.length > 0
    ? rawExerciseLog.reduce((sum, entry) => sum + entry.confirmedReps.length, 0)
    : completedExercises
        .filter((ex) => ex.category === 'main' || ex.category === 'superset')
        .reduce((sum, ex) => sum + ex.sets.length, 0);
  const plannedSets = totalPlannedSets ?? actualSetsCompleted;
  const diffNum: 1 | 2 | 3 =
    difficultyBolts ?? (difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2);

  const sessionExerciseIds = rawExerciseLog && rawExerciseLog.length > 0
    ? rawExerciseLog.map((e) => e.exerciseId).filter(Boolean)
    : completedExercises
        .filter((ex) => ex.category === 'main' || ex.category === 'superset')
        .map((ex) => ex.id);

  useWeeklyVolumeStore.getState().recordStrengthSession(
    actualSetsCompleted,
    plannedSets,
    diffNum,
    isRecovery,
    programId,
    undefined, // durationMinutes — computed separately
    domainSets,
    sessionExerciseIds,
  );

  console.log(
    `[ActivitySync] Volume tracked: ${actualSetsCompleted}/${plannedSets} sets (D${diffNum}, recovery=${isRecovery})`,
  );

  // 4. 48-Hour Muscle Shield (background task)
  const trackMusclesForShield = async () => {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      // Fix: Array.from for Set iteration (downlevelIteration-free)
      const exerciseIds = Array.from(
        new Set<string>([
          ...completedExercises.map((e) => e.id),
          ...(rawExerciseLog?.map((e) => e.exerciseId).filter(Boolean) ?? []),
        ]),
      );

      if (exerciseIds.length === 0) return;

      const exercises = await Promise.all(exerciseIds.map((id) => getExercise(id)));
      const muscles = new Set<MuscleGroup>();
      for (const ex of exercises) {
        if (ex?.primaryMuscle) muscles.add(ex.primaryMuscle);
        ex?.secondaryMuscles?.forEach((m) => muscles.add(m));
      }

      if (muscles.size > 0) {
        const today = new Date().toISOString().split('T')[0];
        const pid = programId?.toLowerCase() ?? '';
        const muscleList = Array.from(muscles);
        const legMuscleCount = muscleList.filter((m) => LEG_MUSCLES.has(m)).length;
        const isLegsDominant = legMuscleCount >= muscles.size / 2;

        const sessionFocus: string | undefined =
          pid.includes('legs') || pid.includes('lower_body') || isLegsDominant
            ? 'legs'
            : pid.includes('push')
              ? 'push'
              : pid.includes('pull')
                ? 'pull'
                : undefined;

        await trackMuscleUsage({
          userId: uid,
          trainedMuscleGroups: muscleList,
          sessionDate: today,
          sessionFocus,
        });
      }
    } catch (e) {
      console.warn('[ActivitySync] trackMuscleUsage failed:', e);
    }
  };
  trackMusclesForShield();
}

export function useActivitySync(params: UseActivitySyncParams): void {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;
    runActivitySync(params);
  // Intentional mount-only fire; the ref guard handles correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
