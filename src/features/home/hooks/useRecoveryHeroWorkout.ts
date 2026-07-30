'use client';

/**
 * useRecoveryHeroWorkout — Block B (BLOCK_B_SMART_CLOSE_V1) Stage 1b.
 *
 * Builds ONE recovery GeneratedWorkout from the tagged recovery videos (exerciseRole:
 * 'recovery' + showOnRestDays) — the SAME videos the rest-day hero uses — and hands it to
 * the big HeroWorkoutCard.
 *
 * Why a LIGHT standalone builder (not generateHomeWorkoutTrio): the trio entry runs its full
 * ~1000-line shared pipeline (fetch + score + program/budget/gear resolution) BEFORE its
 * rest-day recovery return, and with the minimal options available post-workout it
 * rejected/stalled → the card never appeared. This builder needs only getAllExercises() + a
 * pure map (the exact per-video shape from tryBuildRecoveryVideoTrio), so it's robust and
 * cheap — no context, no throw points.
 *
 * ⚠️ The getAllExercises() fetch runs on mount — call this hook ONLY from a flag-gated
 * component (PostWorkoutSmartClose). Unmounted = no fetch = byte-identical when off.
 */

import { useEffect, useState } from 'react';
import { getAllExercises } from '@/features/content/exercises/core/exercise.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type {
  GeneratedWorkout,
  WorkoutExercise,
  DifficultyLevel,
} from '@/features/workout-engine/logic/workout-generator.types';

/** Mirrors tryBuildRecoveryVideoTrio's per-video shape, aggregated into one session. */
function buildRecoveryHeroWorkout(allExercises: Exercise[]): GeneratedWorkout | null {
  const pool = allExercises.filter(
    (ex) => (ex as { exerciseRole?: string }).exerciseRole === 'recovery'
      && (ex as { showOnRestDays?: boolean }).showOnRestDays,
  );
  if (pool.length === 0) return null;

  const picked = pool.slice(0, 4);
  const exercises: WorkoutExercise[] = picked.map((ex) => {
    const method =
      ex.execution_methods?.[0] ?? (ex as { executionMethods?: unknown[] }).executionMethods?.[0] ?? {};
    return {
      exercise: ex,
      method: method as WorkoutExercise['method'],
      mechanicalType: (ex.mechanicalType || 'none') as WorkoutExercise['mechanicalType'],
      sets: 1,
      reps: 1,
      repsRange: { min: 1, max: 1 },
      isTimeBased: true,
      restSeconds: 0,
      priority: 'isolation' as const,
      score: 0,
      reasoning: ['recovery_video_post_workout'],
      programLevel: 1,
      isOverLevel: false,
      tier: 'flow' as const,
      levelDelta: 0,
      isGoalExercise: false,
      exerciseRole: 'main' as const,
    };
  });

  const totalSec = picked.reduce((s, ex) => {
    const method = ex.execution_methods?.[0] ?? (ex as { executionMethods?: unknown[] }).executionMethods?.[0];
    return s + ((method as { media?: { videoDurationSeconds?: number } })?.media?.videoDurationSeconds ?? 60);
  }, 0);
  const estimatedDuration = Math.max(5, Math.round(totalSec / 60));

  return {
    title: 'שחרור והתאוששות',
    description: 'כמה מתיחות לסגור ברוגע.',
    exercises,
    estimatedDuration,
    structure: 'standard',
    difficulty: 1 as DifficultyLevel,
    mechanicalBalance: { straightArm: 0, bentArm: 0, hybrid: 0, ratio: '0:0', isBalanced: true },
    stats: { calories: 0, coins: 0, totalReps: 0, totalHoldTime: 0, difficultyMultiplier: 1 },
    isRecovery: true,
    totalPlannedSets: exercises.length,
    pipelineLog: ['recovery_video_post_workout'],
  };
}

export function useRecoveryHeroWorkout(): GeneratedWorkout | null {
  const [workout, setWorkout] = useState<GeneratedWorkout | null>(null);

  useEffect(() => {
    // `cancelled`-only cleanup, NO persistent ref guard: under React StrictMode (Next dev) the
    // effect double-invokes (mount → unmount → remount). A ref guard would make the remount
    // skip re-fetching while the first fetch's setWorkout is cancelled by the unmount → the
    // card never mounts (built runs but state never updates). The remount re-fetches and
    // `cancelled` drops the stale first result — also more correct in prod (a real remount gets
    // a fresh fetch, not a stuck ref). Cost: TWO full getAllExercises queries in dev (it is NOT
    // cached — a live ~372-doc read); ONE in prod.
    let cancelled = false;
    void (async () => {
      try {
        const all = await getAllExercises();
        const gw = buildRecoveryHeroWorkout(all);
        if (!cancelled) setWorkout(gw);
      } catch (err) {
        // Real error channel (NOT swallowed) — a prod failure to build the recovery card stays
        // visible; the message + ring still render without it.
        console.warn('[useRecoveryHeroWorkout] failed to build the recovery card:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return workout;
}

export default useRecoveryHeroWorkout;
