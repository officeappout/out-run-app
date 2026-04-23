/**
 * Activity History Service
 *
 * Read-only query layer for the `dailyActivity` collection.
 * Used by the profile dashboard to power steps/floors trend charts.
 *
 * ── Data source ──────────────────────────────────────────────────────────────
 * useActivityStore.syncToServer() writes to:
 *   dailyActivity/{userId}_{YYYY-MM-DD}   (one document per day, setDoc + merge)
 *
 * No new writes are needed here — the collection is already time-series by design.
 * Each document's `date` field (string, YYYY-MM-DD) serves as the primary sort key.
 */

import {
  collection,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  getDocs,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserFullProfile } from '@/types/user-profile';
import type { WeeklyActivitySummary } from '../types/activity.types';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * A single day's steps/floors snapshot, ready for Recharts chart data.
 * All fields are safe defaults (never undefined) to simplify charting code.
 */
export interface DailyStepsSnapshot {
  /** ISO date string 'YYYY-MM-DD' — Recharts x-axis label */
  date: string;
  /** Total steps counted that day */
  steps: number;
  /** Total floors climbed that day */
  floors: number;
  /** Whether the adaptive step goal was met */
  stepsGoalMet: boolean;
  /** Whether the adaptive floor goal was met */
  floorsGoalMet: boolean;
  /** Adaptive step goal for that day */
  stepsGoal: number;
  /** Adaptive floor goal for that day */
  floorsGoal: number;
}

const COLLECTION = 'dailyActivity';

// ── Read ───────────────────────────────────────────────────────────────────

/**
 * Fetch the last N daily step/floor snapshots for a user,
 * ordered chronologically (oldest → newest), ready for Recharts.
 *
 * Returns an empty array when:
 *   - The user is offline
 *   - No dailyActivity documents exist yet
 *   - A Firestore error occurs
 *
 * No composite index required — single-field orderBy on 'date' (string)
 * is supported automatically by Firestore.
 *
 * @param userId  Firestore user ID
 * @param limit   Days of history to return (default: 14 — two full weeks)
 *
 * @example
 * const trend = await getStepsTrend(userId, 14);
 * const chartData = trend.map(d => ({
 *   date:  d.date.slice(5), // 'MM-DD' short label
 *   steps: d.steps,
 *   goal:  d.stepsGoal,
 * }));
 */
export async function getStepsTrend(
  userId: string,
  limit: number = 14,
): Promise<DailyStepsSnapshot[]> {
  if (!userId) return [];
  if (typeof navigator !== 'undefined' && !navigator.onLine) return [];

  try {
    const q = query(
      collection(db, COLLECTION),
      where('userId', '==', userId),
      orderBy('date', 'desc'),
      firestoreLimit(limit),
    );

    const snap = await getDocs(q);
    if (snap.empty) return [];

    const entries: DailyStepsSnapshot[] = snap.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          date: d.date ?? '',
          steps: d.steps ?? 0,
          floors: d.floors ?? 0,
          stepsGoalMet: d.stepsGoalMet ?? false,
          floorsGoalMet: d.floorsGoalMet ?? false,
          stepsGoal: d.stepsGoal ?? 3000,
          floorsGoal: d.floorsGoal ?? 3,
        } satisfies DailyStepsSnapshot;
      })
      .filter(e => e.date !== '')
      .reverse(); // Chronological order (oldest → newest) for chart x-axis

    console.log(
      `[ActivityHistory] getStepsTrend: ${entries.length} days for user ${userId}`,
    );
    return entries;
  } catch (error) {
    console.warn('[ActivityHistory] getStepsTrend failed:', error);
    return [];
  }
}

// ── Weekly Running KM ──────────────────────────────────────────────────────
//
// PR 2 of the dashboard restructure replaces the hardcoded `weeklyDistance={12.5}`
// in `RunningStatsWidget` with this real aggregator.
//
// Source of truth: the `workouts` collection (written by `saveWorkout` in
// `workout-engine/core/services/storage.service.ts`). Distance is stored in
// kilometres on each document (see `WorkoutHistoryEntry.distance` JSDoc).
//
// HealthKit/Health Connect sync does NOT populate distance — that's why we
// query app-recorded runs only (the `category === 'cardio'` ones). When
// HealthBridge gains distance ingestion, this function will gain a parallel
// path through `dailyActivity.passiveDistance` and the larger of the two
// values per day will win.

/**
 * Returns the start of the current week as a Date, with week starting on Sunday
 * (matches `useActivityStore.calculateWeeklySummary`'s Sunday-Saturday boundary).
 */
function startOfCurrentWeekSunday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  sunday.setHours(0, 0, 0, 0);
  return sunday;
}

/**
 * Sum kilometres of all `category === 'cardio'` workouts saved by the user
 * since the start of the current Sunday-anchored week.
 *
 * Returns `0` on offline / empty / error so the UI can render a clean placeholder
 * without conditional plumbing.
 *
 * No new composite index required: the equality filter on `userId` plus the
 * range filter on `date` is supported by the existing single-field index used
 * by `getRunTrend`.
 */
export async function getWeeklyRunningKm(userId: string): Promise<number> {
  if (!userId) return 0;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;

  try {
    const weekStart = startOfCurrentWeekSunday();

    const q = query(
      collection(db, 'workouts'),
      where('userId', '==', userId),
      where('date', '>=', Timestamp.fromDate(weekStart)),
    );

    const snap = await getDocs(q);
    if (snap.empty) return 0;

    let totalKm = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data() as { category?: string; distance?: number };
      // Filter cardio runs/walks/cycling client-side to keep query simple
      // (avoids a composite index just for this aggregation).
      if (data.category !== 'cardio') return;
      const km = typeof data.distance === 'number' && !isNaN(data.distance) ? data.distance : 0;
      totalKm += km;
    });

    // Round to 1 decimal — UI displays "8.4 ק"מ", not "8.412345 ק"מ".
    return Math.round(totalKm * 10) / 10;
  } catch (error) {
    console.warn('[ActivityHistory] getWeeklyRunningKm failed:', error);
    return 0;
  }
}

// ── Strength Adherence ─────────────────────────────────────────────────────
//
// Tiny derivation helper used by Row 2's ConsistencyWidget and any future
// "X / Y sessions completed" surface. Kept here (not in the store) because it
// joins two slices — profile + weekly summary — and we don't want either store
// to depend on the other.

export interface StrengthAdherence {
  /** Sessions actually completed this week (from `WeeklyActivitySummary.categorySessions.strength`). */
  done: number;
  /** Target — number of strength days the user committed to in their lifestyle wizard. */
  target: number;
}

/**
 * Returns `done / target` for the current week's strength adherence.
 *
 * Falls back to `target = 3` when the user hasn't set a schedule (matches
 * the historical default in `StrengthVolumeWidget`).
 */
export function getStrengthAdherence(
  profile: UserFullProfile | null | undefined,
  summary: WeeklyActivitySummary | null | undefined,
): StrengthAdherence {
  const done = summary?.categorySessions?.strength ?? 0;
  const scheduled = profile?.lifestyle?.scheduleDays?.length;
  const target = scheduled && scheduled > 0 ? scheduled : 3;
  return { done, target };
}
