'use client';

import { useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { syncWorkoutCompletion } from '@/features/workout-engine/services/completion-sync.service';
import { trackMuscleUsage } from '@/features/workout-engine/services/split-decision';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';

import type { CompletedExercise, Difficulty } from '../utils/summary.utils';
import { HOME_DAILY_GOAL_V1 } from '@/config/feature-flags';
import { useUserStore } from '@/features/user';
import { resolveActiveProgramBudget } from '@/features/workout-engine/services/lead-program.service';
// §7 follow-up (2nd such debt after co-logo): these two PURE utils live under
// features/home; reused cross-domain here until one pass moves them to src/lib/.
import { computeDailyStrengthTarget, isTodayTrainingDay } from '@/features/home/utils/dailyStrengthTarget';
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';

/**
 * useActivitySync — single-shot Firestore + Zustand fan-out on summary mount.
 *
 * Pure side-effect hook (returns `void`).  On first mount fires four
 * coordinated writes:
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

export function useActivitySync(params: UseActivitySyncParams): void {
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

  const { addCoins } = useProgressionStore();
  const { recordStrengthSession } = useWeeklyVolumeStore();
  const profile = useUserStore((s) => s.profile);

  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Sets completed this session (computed up-front — also feeds the daily-goal gate).
    const actualSetsCompleted = rawExerciseLog && rawExerciseLog.length > 0
      ? rawExerciseLog.reduce((sum, entry) => sum + entry.confirmedReps.length, 0)
      : completedExercises
          .filter((ex) => ex.category === 'main' || ex.category === 'superset')
          .reduce((sum, ex) => sum + ex.sets.length, 0);
    const plannedSets = totalPlannedSets ?? actualSetsCompleted;

    // 1. Activity Store (rings + streak) + completion.
    // HOME_DAILY_GOAL_V1 (strength, non-recovery): resolve the stable daily target
    // and gate the day's completion on ⅔ of it. `priorToday` is read BEFORE this
    // session is recorded (step 3) — the async body's synchronous prefix runs before
    // recordStrengthSession — so `completedSets` never double-counts this session.
    const activityCategory = trainingType === 'cardio' ? 'cardio' : 'strength';
    void (async () => {
      let strengthCompletion:
        | { targetSets: number; completedSets: number; pct: number; met: boolean }
        | undefined;
      if (HOME_DAILY_GOAL_V1 && trainingType !== 'cardio' && !isRecovery && profile) {
        try {
          const priorToday = summarizeTodayStrengthVolume(
            useWeeklyVolumeStore.getState().sessionLogs,
          ).setsCompleted;
          const completedSets = priorToday + actualSetsCompleted;
          const scheduleDays = profile.lifestyle?.scheduleDays ?? [];
          const isRestDay = !isTodayTrainingDay(scheduleDays, profile.lifestyle?.recurringTemplate);
          const budget = await resolveActiveProgramBudget(profile);
          const targetSets = computeDailyStrengthTarget({
            weeklyTarget: budget?.weeklyVolumeTarget ?? 0,
            scheduleDays: scheduleDays.length,
            isRestDay,
            source: 'lead',
          }).targetSets;
          const met = targetSets > 0 ? completedSets >= (2 / 3) * targetSets : true;
          const pct = targetSets > 0 ? Math.min(1, completedSets / targetSets) : 1;
          strengthCompletion = { targetSets, completedSets, pct, met };
        } catch (e) {
          console.warn('[useActivitySync] daily-goal resolve failed:', e);
        }
      }
      syncWorkoutCompletion({
        workoutType: 'strength',
        durationMinutes,
        calories,
        activityCategory,
        displayIcon: 'dumbbell',
        workoutTitle: programName,
        strengthCompletion,
      });
    })();

    // 2. Progression Store (global coins)
    console.log('[StrengthSummaryPage] Adding coins to ProgressionStore:', coins);
    addCoins(coins);

    // 3. Weekly Volume Store
    const diffNum: 1 | 2 | 3 =
      difficultyBolts ?? (difficulty === 'easy' ? 1 : difficulty === 'hard' ? 3 : 2);

    const sessionExerciseIds = rawExerciseLog && rawExerciseLog.length > 0
      ? rawExerciseLog.map((e) => e.exerciseId).filter(Boolean)
      : completedExercises
          .filter((ex) => ex.category === 'main' || ex.category === 'superset')
          .map((ex) => ex.id);

    recordStrengthSession(
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
      `[StrengthSummaryPage] Volume tracked: ${actualSetsCompleted}/${plannedSets} sets (D${diffNum}, recovery=${isRecovery})`,
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
        console.warn('[StrengthSummaryPage] trackMuscleUsage failed:', e);
      }
    };
    trackMusclesForShield();
  // Intentional mount-only fire; the ref guard handles correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
