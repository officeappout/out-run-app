'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutPlan } from '@/features/parks';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveStartHandOff } from '@/features/workout-engine/services/workout-plan.mapper';
import type { WorkoutData } from '../types';

interface UseWorkoutSessionParams {
  workout: WorkoutData | null;
  workoutPlan: WorkoutPlan | null;
  /**
   * The live generated workout the drawer is rendering (custom builder +
   * home flow). When present it is THE hand-off source — built fresh via
   * the shared mapper, never read from storage leftovers.
   */
  generatedWorkout?: GeneratedWorkout | null;
  isWarmupActive: boolean;
  workoutLocation: string | undefined;
  onStartWorkout?: (workoutId: string) => void;
}

interface UseWorkoutSessionReturn {
  /** Serialise the resolved workout to sessionStorage and hand off to the player. */
  handleStartWorkout: () => void;
}

/**
 * Owns the "Start Workout" hand-off contract.
 *
 * The active workout player loads its plan in priority order:
 *   1. `active_workout_data`  — written by `home/page.tsx` at generation time
 *   2. `currentWorkoutPlan`   — explicit fallback (favorites flow + safety mirror)
 *   3. Firestore template     — last-resort lookup by `workoutId`
 *
 * This hook patches both Priority-1 and Priority-2 keys with the resolved
 * `workoutId` and `isWarmupActive` flag before navigating so the runner
 * never falls through to Priority-3 and loads a different workout.
 */
export function useWorkoutSession({
  workout,
  workoutPlan,
  generatedWorkout,
  isWarmupActive,
  workoutLocation,
  onStartWorkout,
}: UseWorkoutSessionParams): UseWorkoutSessionReturn {
  const router = useRouter();

  const handleStartWorkout = useCallback(() => {
    const workoutId = workout?.id || 'favorites-workout';

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('currentWorkoutPlan');
      sessionStorage.removeItem('currentWorkoutPlanId');
      sessionStorage.removeItem('currentWorkoutLocation');

      // Hand-off precedence (13.07.2026, custom-builder 15→45 bug): the
      // LIVE generatedWorkout prop is built fresh via the shared mapper and
      // always wins — the custom builder never serialized its result, so
      // the runner used to execute HOME's stale dashboard plan (60→bolt
      // cap) under the builder's id. Storage re-stamp and the legacy
      // skeleton are fallbacks only. Pure logic in resolveStartHandOff
      // (unit-tested).
      const handOff = resolveStartHandOff({
        generatedWorkout,
        storedActivePlanJson: sessionStorage.getItem('active_workout_data'),
        legacyPlan: workoutPlan as Record<string, unknown> | null,
        workoutId,
        isWarmupActive,
        location: workoutLocation,
      });

      if (handOff.source !== 'none') {
        const json = JSON.stringify(handOff.plan);
        if (handOff.source === 'legacy') {
          // The skeleton must not shadow future generated plans.
          sessionStorage.removeItem('active_workout_data');
        } else {
          sessionStorage.setItem('active_workout_data', json);
        }
        sessionStorage.setItem('currentWorkoutPlan', json);
        sessionStorage.setItem('currentWorkoutPlanId', workoutId);
        console.log(`[useWorkoutSession] hand-off source=${handOff.source} → ${workoutId}`);
      }

      if (workoutLocation) {
        sessionStorage.setItem('currentWorkoutLocation', workoutLocation);
      }
    }

    if (onStartWorkout) {
      onStartWorkout(workoutId);
    } else {
      router.push(`/workouts/${workoutId}/active`);
    }
  }, [workout?.id, workoutPlan, generatedWorkout, isWarmupActive, workoutLocation, onStartWorkout, router]);

  return { handleStartWorkout };
}
