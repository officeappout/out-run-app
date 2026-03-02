/**
 * Completion Sync Service
 *
 * Single entry-point that every workout type (Strength, Running, etc.) calls
 * on completion. Ensures ALL data stores are updated consistently:
 *
 *   1. Activity Store  → dailyActivity + streaks  (rings, weekly schedule "V")
 *   2. Progression Store → dailyProgress + goalHistory  (calendar checkmarks)
 *   3. sessionStorage flag → drives Home Screen "Celebration Mode"
 */

import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import type { ActivityCategory } from '@/features/activity/types/activity.types';

export type CompletionWorkoutType = 'strength' | 'running' | 'walking' | 'cycling' | 'hybrid';

export interface CompletionPayload {
  workoutType: CompletionWorkoutType;
  durationMinutes: number;
  calories: number;
  activityCategory: ActivityCategory;
  displayIcon: string;
  /** Workout title for post-workout card (e.g. "אימון רגליים קשה") */
  workoutTitle?: string;
  /** Thumbnail URL for the completed workout hero image */
  thumbnailUrl?: string;
}

const SESSION_KEY = 'post_workout_completed';

export async function syncWorkoutCompletion(payload: CompletionPayload): Promise<void> {
  // 1. Activity Store → dailyActivity + streaks (Zustand – synchronous update, async Firestore sync)
  useActivityStore.getState().logWorkout(
    payload.activityCategory,
    payload.durationMinutes,
    payload.calories,
  );

  // 2. Progression Store → dailyProgress + goalHistory (Firestore write)
  await useProgressionStore.getState().markTodayAsCompleted(payload.workoutType).catch((err) => {
    console.error('[completion-sync] markTodayAsCompleted failed:', err);
  });

  // 3. Session flag for Home Screen celebration mode
  if (typeof window !== 'undefined') {
    const streak = useActivityStore.getState().currentStreak;
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        completedAt: new Date().toISOString(),
        workoutType: payload.workoutType,
        durationMinutes: payload.durationMinutes,
        workoutTitle: payload.workoutTitle,
        thumbnailUrl: payload.thumbnailUrl,
        streak,
      }),
    );
  }
}
