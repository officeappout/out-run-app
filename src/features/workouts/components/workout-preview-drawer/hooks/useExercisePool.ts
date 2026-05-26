'use client';

import { useEffect, useState } from 'react';
import { getAllExercises, type Exercise as FirestoreExercise } from '@/features/content/exercises';
import { WorkoutPlan } from '@/features/parks';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { convertExercisesToWorkoutPlan } from '../utils/workout-conversion.utils';

interface UseExercisePoolReturn {
  /** Full Firestore exercise catalogue, populated lazily for pyramid step taps. */
  exercisePool: FirestoreExercise[];
  /** Legacy workout plan (only populated when no `generatedWorkout` is supplied). */
  workoutPlan: WorkoutPlan | null;
  /** True while the legacy `getAllExercises` fetch is in flight. */
  isLoadingExercises: boolean;
}

interface UseExercisePoolParams {
  isOpen: boolean;
  generatedWorkout: GeneratedWorkout | null | undefined;
  workoutId: string | undefined;
}

/**
 * Owns the two Firestore-backed caches the drawer needs:
 *
 * 1. `exercisePool` — populated once when the drawer opens with a
 *    `generatedWorkout`.  Pyramid step taps look up their full
 *    `FirestoreExercise` here so the detail drawer renders the swapped
 *    variant's video / cues instead of the parent seed's.
 *
 * 2. `workoutPlan` — only populated on the legacy path where the drawer
 *    receives no `generatedWorkout` (e.g. the favorites flow).  In that
 *    case we pull the latest 8 exercises and stitch them into a
 *    plain `WorkoutPlan`.  Skipped entirely when `generatedWorkout` is
 *    present — that payload is the source of truth.
 */
export function useExercisePool({
  isOpen,
  generatedWorkout,
  workoutId,
}: UseExercisePoolParams): UseExercisePoolReturn {
  const [exercisePool, setExercisePool] = useState<FirestoreExercise[]>([]);
  const [workoutPlan, setWorkoutPlan] = useState<WorkoutPlan | null>(null);
  const [isLoadingExercises, setIsLoadingExercises] = useState(false);

  useEffect(() => {
    if (!isOpen || !generatedWorkout || exercisePool.length > 0) return;
    let cancelled = false;
    getAllExercises()
      .then((exercises) => {
        if (cancelled || !exercises) return;
        setExercisePool(exercises);
      })
      .catch((error) => {
        console.error('[useExercisePool] Error caching exercise pool for pyramid taps:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, generatedWorkout, exercisePool.length]);

  useEffect(() => {
    if (isOpen && !generatedWorkout && !workoutPlan && !isLoadingExercises) {
      setIsLoadingExercises(true);
      getAllExercises()
        .then((exercises) => {
          if (!exercises || exercises.length === 0) {
            console.warn('[useExercisePool] No exercises found in Firestore');
            setIsLoadingExercises(false);
            return;
          }
          const latestExercises = exercises.slice(-8);
          return convertExercisesToWorkoutPlan(latestExercises);
        })
        .then((plan) => {
          if (plan) {
            if (workoutId) {
              plan.id = workoutId;
            }
            setWorkoutPlan(plan);
          }
          setIsLoadingExercises(false);
        })
        .catch((error) => {
          console.error('[useExercisePool] Error fetching exercises:', error);
          setIsLoadingExercises(false);
        });
    }
  }, [isOpen, generatedWorkout, workoutPlan, isLoadingExercises, workoutId]);

  return { exercisePool, workoutPlan, isLoadingExercises };
}
