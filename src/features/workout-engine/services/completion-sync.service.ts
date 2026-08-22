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

/**
 * HOME_DAILY_GOAL_V1 (strength only): ⅔-of-daily-target completion snapshot,
 * computed at completion time (useActivitySync.ts) and forwarded to
 * markTodayAsCompleted. When the flag is ON, that store gates
 * `workoutCompleted` on `met` and persists target/completed/pct/met onto the
 * dailyProgress doc. Absent for aerobic/hybrid, recovery sessions, or when
 * the flag is off (legacy unconditional-true behaviour).
 */
export interface StrengthCompletionSnapshot {
  targetSets: number;
  completedSets: number;
  pct: number;
  met: boolean;
}

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
   * Strength-only. The active program's templateId (e.g. 'upper_body',
   * 'push', 'full_body') — same value SmartWeeklySchedule already threads
   * into resolveIconKey() for schedule-cell icons. Lets the post-workout
   * completion card show a program-specific icon instead of a generic one
   * (22.08.2026, home compact-card icon fix). Running/walking/cycling/
   * hybrid have no equivalent "program" concept — always undefined there;
   * icon resolution falls back to workoutType/category for those.
   */
  programId?: string;
  /**
   * True when the completed session was recovery-only content (rest-day
   * video trio OR the "Budget Floor" cooldown/mobility fallback) rather than
   * a bonus effort. Gated end-to-end by RECOVERY_DAY_BADGE_FIX_ENABLED at the
   * single write choke point (useActivitySync.ts) — see feature-flags.ts.
   * Only the strength completion path ever sets this; running/hybrid
   * completions have no recovery concept and leave it undefined.
   */
  isRecovery?: boolean;
  /** See `StrengthCompletionSnapshot` doc comment above. */
  strengthCompletion?: StrengthCompletionSnapshot;
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
  await useProgressionStore.getState()
    .markTodayAsCompleted(payload.workoutType, payload.isRecovery, payload.strengthCompletion)
    .catch((err) => {
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
  //
  // Home Screen bug fix (22.08.2026, David caught on-device): home/page.tsx
  // used to read this sessionStorage key exactly once, in a mount-only
  // useEffect ([] deps) — correct for the FIRST workout of a home-page
  // lifetime, but a SECOND completion while home stays mounted (no full
  // remount in between) overwrote this key with fresh data that effect
  // would never read again, leaving the card stuck on the first workout's
  // stale data (or the daily-total fallback). sessionStorage itself doesn't
  // fire a same-tab 'storage' event, so there's no free signal to react to
  // — dispatching this CustomEvent (same pattern src/lib/native/init.ts
  // already uses for other same-tab signals, e.g. 'nativeBackInWorkout')
  // gives home/page.tsx something to listen for on every completion, not
  // just the first.
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
        programId: payload.programId,
      }),
    );
    window.dispatchEvent(new CustomEvent('post-workout-completed'));
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
