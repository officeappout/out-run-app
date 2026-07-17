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

import { doc, updateDoc, increment } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { useProgressionStore } from '@/features/user/progression/store/useProgressionStore';
import { useWeeklyVolumeStore } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import type { ActivityCategory } from '@/features/activity/types/activity.types';

export type CompletionWorkoutType = 'strength' | 'running' | 'walking' | 'cycling' | 'hybrid';

export interface CompletionPayload {
  workoutType: CompletionWorkoutType;
  durationMinutes: number;
  calories: number;
  activityCategory: ActivityCategory;
  displayIcon: string;
  /** Distance in km (running workouts) */
  distanceKm?: number;
  /** Workout title for post-workout card (e.g. "אימון רגליים קשה") */
  workoutTitle?: string;
  /** Thumbnail URL for the completed workout hero image */
  thumbnailUrl?: string;
  /**
   * Multi-category split (hybrid). When present, minutes/calories are logged
   * PER category in ONE atomic activity-store write (e.g. cardio legs + strength
   * station) instead of the single `activityCategory`. The once-per-session
   * actions below (goal checkmark, workoutCount, celebration flag, HealthKit)
   * still fire exactly once using the aggregate `durationMinutes`/`calories`.
   */
  categorySplits?: Array<{ category: ActivityCategory; durationMinutes: number; calories: number }>;
}

const SESSION_KEY = 'post_workout_completed';

export async function syncWorkoutCompletion(payload: CompletionPayload): Promise<void> {
  // 1. Activity Store → dailyActivity + streaks (Zustand – synchronous update, async Firestore sync)
  //
  // DATE ANCHOR: every downstream writer here (logWorkout → useActivityStore,
  // markTodayAsCompleted → dailyProgress) timestamps the session with the
  // device's current calendar day via `new Date()` / `getTodayString()` /
  // `serverTimestamp()`. The `selectedDate` browsed on the home dashboard
  // is intentionally NOT passed in — this guarantees credit always lands on
  // the real "today" slot, never on a future target date the user may have
  // been previewing in the calendar grid.
  if (payload.categorySplits && payload.categorySplits.length > 0) {
    // Hybrid: cardio + strength in a single atomic write (streak/goal derive
    // from the combined GLOBAL total inside the store, not per category).
    useActivityStore.getState().logMultiCategoryWorkout(payload.categorySplits);
  } else {
    useActivityStore.getState().logWorkout(
      payload.activityCategory,
      payload.durationMinutes,
      payload.calories,
    );
  }

  // 1b. Weekly Volume Store → running distance/duration tracking
  if (payload.workoutType === 'running') {
    const distanceKm = payload.distanceKm ?? (payload.durationMinutes / 6);
    useWeeklyVolumeStore.getState().recordRunningSession(distanceKm, payload.durationMinutes);
  }

  // 2. Progression Store → dailyProgress + goalHistory (Firestore write)
  await useProgressionStore.getState().markTodayAsCompleted(payload.workoutType).catch((err) => {
    console.error('[completion-sync] markTodayAsCompleted failed:', err);
  });

  // 2b. Growth Hub — atomic lifetime workout counter on the user document.
  //
  // Why this is here (and not inside progression.service.ts):
  //   • Every workout type funnels through this function, so a single
  //     increment here covers strength, running, walking, cycling, hybrid
  //     with no risk of forgetting a code path.
  //   • Firestore `increment(1)` is server-atomic — no race condition
  //     even on simultaneous double-tap completions, and the field
  //     self-initialises from 0 on first write (no migration needed).
  //   • The admin Growth Funnel Dashboard's Activation (>=1) and
  //     Retention (>=3) stages use this flat field for pure
  //     `getCountFromServer` aggregation; the per-track counter inside
  //     `progression.tracks.*` is unusable for `where()` queries because
  //     of its dynamic map keys.
  //
  // We pull the uid from Firebase Auth (the source of truth) rather than
  // the activity store so this still works for the first-ever workout
  // before the activity store has hydrated `today.userId`. Wrapped in a
  // try/catch so a transient counter-write failure NEVER blocks the
  // user's completion flow — the funnel can tolerate occasional missed
  // increments better than the celebration screen can tolerate a crash.
  try {
    const uid = auth.currentUser?.uid;
    if (uid) {
      await updateDoc(doc(db, 'users', uid), {
        'progression.workoutCount': increment(1),
      });
    }
  } catch (err) {
    console.warn('[completion-sync] workoutCount increment failed:', err);
  }

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

  // 4. Apple Health — write the completed workout to HealthKit (iOS only).
  // Fire-and-forget: a HealthKit write failure must never block the user's
  // celebration screen or XP award. Lazy import keeps the web bundle slim.
  void (async () => {
    try {
      const { writeWorkoutToHealth } = await import('@/lib/healthBridge/init');
      const endISO = new Date().toISOString();
      await writeWorkoutToHealth({
        workoutType: payload.workoutType,
        durationMinutes: payload.durationMinutes,
        calories: payload.calories,
        distanceKm: payload.distanceKm,
        endISO,
      });
    } catch {
      // HealthBridge not available (web, Android, or not initialised) — ignore.
    }
  })();
}
