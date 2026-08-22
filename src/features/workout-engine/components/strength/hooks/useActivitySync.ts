'use client';

import { useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useWeeklyVolumeStore, calculateWeeklyBudget } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { syncWorkoutCompletion, type StrengthCompletionSnapshot } from '@/features/workout-engine/services/completion-sync.service';
import { trackMuscleUsage } from '@/features/workout-engine/services/split-decision';
import { getExercise } from '@/features/content/exercises/core/exercise.service';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';
import { resolveActiveProgramBudget } from '@/features/workout-engine/services/lead-program.service';
import { getCachedPrograms } from '@/features/workout-engine/services/program-hierarchy.utils';
import {
  computeBaseLevel,
  computeDailyStrengthTarget,
  isTodayTrainingDay,
  type DailyStrengthTargetSource,
} from '@/features/home/utils/dailyStrengthTarget';
import { summarizeTodayStrengthVolume } from '@/features/home/utils/todayStrengthVolume';
import { RECOVERY_DAY_BADGE_FIX_ENABLED, HOME_DAILY_GOAL_V1 } from '@/config/feature-flags';

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
 *
 * **HOME_DAILY_GOAL_V1 (17.08.2026):** for a non-recovery strength completion,
 * `runActivitySync` also resolves a ⅔-of-daily-target completion snapshot
 * (`resolveActiveProgramBudget` + `computeDailyStrengthTarget`, the same
 * resolver the daily strength ring uses) and forwards it to
 * `syncWorkoutCompletion` → `markTodayAsCompleted`, which gates
 * `dailyProgress.workoutCompleted` on it instead of the unconditional `true`.
 * While the flag is off (default) this resolution never runs — zero extra
 * Firestore reads, byte-identical to today.
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
  /**
   * Read-only history view of an already-saved workout — skip all 4 writes
   * entirely (`runActivitySync` is never called). Only checked by the
   * `useActivitySync` hook wrapper below; the standalone `runActivitySync`
   * export (used directly by active/page.tsx's recovery-trio shortcut) is
   * unaffected.
   */
  isReadOnly?: boolean;
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

  // Hoisted from step 3 below — needed here too (HOME_DAILY_GOAL_V1's
  // strengthCompletion snapshot) so it's computed once, not duplicated.
  const actualSetsCompleted = rawExerciseLog && rawExerciseLog.length > 0
    ? rawExerciseLog.reduce((sum, entry) => sum + entry.confirmedReps.length, 0)
    : completedExercises
        .filter((ex) => ex.category === 'main' || ex.category === 'superset')
        .reduce((sum, ex) => sum + ex.sets.length, 0);

  // HOME_DAILY_GOAL_V1: ⅔-of-daily-target strength completion snapshot —
  // strength sessions only, never recovery (recovery has no volume-budget
  // concept; aerobic/hybrid intentionally stay on the legacy unconditional-
  // true path, per the ⅔-threshold design's own decision). Computed BEFORE
  // step 3's recordStrengthSession call below, so summarizeTodayStrengthVolume
  // reads PRIOR-today sets only — this session's actualSetsCompleted (already
  // computed above) is added on top, avoiding a double-count of this session.
  // While the flag is off this whole block is skipped — zero extra Firestore
  // reads, byte-identical to today.
  let strengthCompletion: StrengthCompletionSnapshot | undefined;
  if (HOME_DAILY_GOAL_V1 && trainingType !== 'cardio' && !isRecovery) {
    const profile = useUserStore.getState().profile;
    if (profile) {
      try {
        const scheduleDaysArr = profile.lifestyle?.scheduleDays;
        const recurringTemplate = profile.lifestyle?.recurringTemplate as
          | Record<string, string[] | undefined>
          | undefined;
        const baseLevel = computeBaseLevel(profile.progression?.tracks, profile.progression?.domains);
        const scheduleDays = scheduleDaysArr?.length ?? 0;
        const isRestDay = !isTodayTrainingDay(scheduleDaysArr, recurringTemplate);

        // Same cached-programs + resolveActiveProgramBudget pattern as
        // useDailyStrengthTarget.ts (the ring's own resolver) — avoids a raw,
        // uncached getAllPrograms() read.
        const allPrograms = await getCachedPrograms();
        const lead = await resolveActiveProgramBudget(profile, allPrograms);
        const weeklyTarget = lead?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseLevel);
        const source: DailyStrengthTargetSource = lead?.weeklyVolumeTarget != null ? 'lead' : 'fallback';
        const dailyTarget = computeDailyStrengthTarget({ weeklyTarget, scheduleDays, isRestDay, source });

        const priorSetsToday = summarizeTodayStrengthVolume(
          useWeeklyVolumeStore.getState().sessionLogs,
        ).setsCompleted;
        const completedSets = priorSetsToday + actualSetsCompleted;
        const targetSets = dailyTarget.targetSets;
        // Rest day / no resolvable budget (targetSets <= 0) → always met, per
        // the ⅔-threshold design's explicit decision (a day with no strength
        // target can't fail one).
        const met = targetSets <= 0 || completedSets >= Math.ceil((targetSets * 2) / 3);
        const pct = targetSets <= 0 ? 1 : Math.max(0, Math.min(1, completedSets / targetSets));

        strengthCompletion = { targetSets, completedSets, pct, met };
      } catch (e) {
        // Never blocks completion — degrades to the legacy unconditional-true
        // write below (strengthCompletion stays undefined).
        console.warn('[ActivitySync] HOME_DAILY_GOAL_V1 strengthCompletion computation failed:', e);
      }
    }
  }

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
    strengthCompletion,
  });

  // 2. Progression Store (global coins)
  console.log('[ActivitySync] Adding coins to ProgressionStore:', coins);
  useProgressionStore.getState().addCoins(coins);

  // 3. Weekly Volume Store
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
    if (params.isReadOnly) return;
    runActivitySync(params);
  // Intentional mount-only fire; the ref guard handles correctness.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
