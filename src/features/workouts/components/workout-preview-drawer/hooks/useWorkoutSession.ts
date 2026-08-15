'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { WorkoutPlan } from '@/features/parks';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { buildRunnerWorkoutPlanFromGenerated } from '@/features/workout-engine/logic/buildRunnerWorkoutPlanFromGenerated';
import type { WorkoutData } from '../types';

interface UseWorkoutSessionParams {
  workout: WorkoutData | null;
  workoutPlan: WorkoutPlan | null;
  /**
   * CustomBuilder / generator output shown in the preview. When present it is
   * the source of truth and is converted to a runner `WorkoutPlan` for the
   * hand-off — otherwise the runner falls through to a stale sessionStorage
   * snapshot and runs a different workout (Builder→Runner gap).
   */
  generatedWorkout?: GeneratedWorkout | null;
  isWarmupActive: boolean;
  workoutLocation: string | undefined;
  onStartWorkout?: (workoutId: string) => void;
}

interface UseWorkoutSessionReturn {
  /**
   * Serialise the resolved workout to sessionStorage and hand off to the player.
   * `overrideGeneratedWorkout` — when passed (including explicit `null`), takes
   * priority over the hook-captured `generatedWorkout` prop above. For callers
   * holding a fresher value than this hook's own closed-over React-state prop
   * at call time (e.g. a ref updated synchronously ahead of a pending state
   * update — see home/page.tsx's recovery-shortcut caller), passing it
   * explicitly here guarantees the exact intended workout is used, never a
   * stale one. Omit it (the default, `undefined`) to keep using the
   * hook-captured `generatedWorkout` — every pre-existing call site (e.g.
   * WorkoutPreviewDrawer's own "Start" button, via DrawerFooter) does this and
   * is completely unaffected by this parameter's addition.
   */
  handleStartWorkout: (overrideGeneratedWorkout?: GeneratedWorkout | null) => void;
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

  const handleStartWorkout = useCallback((overrideGeneratedWorkout?: GeneratedWorkout | null) => {
    const workoutId = workout?.id || 'favorites-workout';

    // `overrideGeneratedWorkout` wins whenever explicitly passed (checked via
    // `!== undefined` so an explicit `null` override is honoured too) — see the
    // JSDoc on UseWorkoutSessionReturn above. Every existing call site omits
    // the argument, so `effectiveGeneratedWorkout` falls back to the
    // hook-captured `generatedWorkout` prop exactly as before this parameter
    // existed.
    const effectiveGeneratedWorkout =
      overrideGeneratedWorkout !== undefined ? overrideGeneratedWorkout : generatedWorkout;

    // Source of truth for the runner: the legacy `workoutPlan` (favorites flow)
    // OR — when the drawer was opened with a CustomBuilder/generator output —
    // that `generatedWorkout` (or its fresher override) converted to a runner
    // `WorkoutPlan`. Without this conversion the generated workout never
    // reaches the runner and the else branch below falls through to a STALE
    // `active_workout_data` snapshot.
    const resolvedPlan: WorkoutPlan | null =
      workoutPlan ??
      (effectiveGeneratedWorkout
        ? buildRunnerWorkoutPlanFromGenerated(effectiveGeneratedWorkout, { id: workoutId })
        : null);

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('currentWorkoutPlan');
      sessionStorage.removeItem('currentWorkoutPlanId');
      sessionStorage.removeItem('currentWorkoutLocation');

      if (resolvedPlan) {
        sessionStorage.removeItem('active_workout_data');
        const planWithCorrectId = { ...resolvedPlan, id: workoutId, isWarmupActive };
        sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(planWithCorrectId));
        sessionStorage.setItem('currentWorkoutPlanId', workoutId);
      } else {
        const existing = sessionStorage.getItem('active_workout_data');
        if (existing) {
          try {
            const existingPlan = JSON.parse(existing);
            const snapshot = { ...existingPlan, id: workoutId, isWarmupActive };
            sessionStorage.setItem('active_workout_data', JSON.stringify(snapshot));
            sessionStorage.setItem('currentWorkoutPlan', JSON.stringify(snapshot));
            sessionStorage.setItem('currentWorkoutPlanId', workoutId);
          } catch {
            console.error('[useWorkoutSession] Could not serialize workout snapshot — payload corrupt');
          }
        }
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
