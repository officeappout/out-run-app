'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutPlan } from '@/features/parks';
import type { WorkoutData } from '../types';

interface UseWorkoutSessionParams {
  workout: WorkoutData | null;
  workoutPlan: WorkoutPlan | null;
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

      // ── Precedence fix (12.07.2026, tabata start bug) ──────────────────
      // The GENERATED plan in active_workout_data is the source of truth.
      // The drawer's legacy `workoutPlan` is a last-8-exercises skeleton
      // armed whenever the drawer was ever open pre-generation — it used to
      // WIN here and DELETE active_workout_data, silently replacing a real
      // plan (incl. seg-tabata + protocolConfig) with the skeleton. Now the
      // legacy plan is used only when no generated plan exists at all
      // (the favorites flow it was built for).
      const existing = sessionStorage.getItem('active_workout_data');
      let handedOff = false;
      if (existing) {
        try {
          const existingPlan = JSON.parse(existing);
          if (Array.isArray(existingPlan?.segments) && existingPlan.segments.length > 0) {
            const snapshot = { ...existingPlan, id: workoutId, isWarmupActive };
            sessionStorage.setItem('active_workout_data', JSON.stringify(snapshot));
            sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(snapshot));
            sessionStorage.setItem('currentWorkoutPlanId', workoutId);
            handedOff = true;
          }
        } catch {
          console.error('[useWorkoutSession] Could not serialize workout snapshot — payload corrupt');
        }
      }

      if (!handedOff && workoutPlan) {
        sessionStorage.removeItem('active_workout_data');
        const planWithCorrectId = { ...workoutPlan, id: workoutId, isWarmupActive };
        sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(planWithCorrectId));
        sessionStorage.setItem('currentWorkoutPlanId', workoutId);
        console.log('[useWorkoutSession] No generated plan in storage — legacy fallback plan handed off');
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
  }, [workout?.id, workoutPlan, isWarmupActive, workoutLocation, onStartWorkout, router]);

  return { handleStartWorkout };
}
