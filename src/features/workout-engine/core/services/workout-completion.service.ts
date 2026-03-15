/**
 * WorkoutCompletionService
 *
 * Handles the lifecycle of a running program:
 * - Calendar-based week calculation from program start date
 * - Marking sessions as completed/skipped in Firestore
 * - Detecting missed workouts and recommending recovery actions
 * - Week advancement and "back 1 week" rollback
 */

import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import type { ActiveRunningProgram } from '../types/running.types';

// ── Types ────────────────────────────────────────────────────────────

export interface SessionSummary {
  avgPace: number;
  completionRate: number;
  distanceKm: number;
  durationSeconds: number;
}

export type AlignmentAction =
  | { type: 'none' }
  | { type: 'quality_makeup'; missedCount: number }
  | { type: 'plan_realign'; daysSinceLastWorkout: number }
  | { type: 'rebuild'; daysSinceLastWorkout: number };

// ── Calendar Logic ───────────────────────────────────────────────────

/**
 * Calculate the current program week from the start date.
 * Week 1 = days 0-6, Week 2 = days 7-13, etc.
 */
export function calculateCurrentWeek(startDate: Date | string | number): number {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffMs = now.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

/**
 * Returns the number of days since a given date.
 */
function daysSince(date: Date | string | number): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Auto-skip missed workouts ────────────────────────────────────────

/**
 * Marks all pending schedule entries from past weeks as 'skipped'.
 * Only skips entries whose week number is strictly less than the
 * calendar-derived current week.
 */
export function autoSkipMissedEntries(
  schedule: ActiveRunningProgram['schedule'],
  calendarWeek: number,
): ActiveRunningProgram['schedule'] {
  return schedule.map((entry) => {
    if (entry.status === 'pending' && entry.week < calendarWeek) {
      return { ...entry, status: 'skipped' as const };
    }
    return entry;
  });
}

// ── Mark session complete ────────────────────────────────────────────

/**
 * Marks a specific schedule entry as completed in Firestore and
 * updates lastWorkoutDate. Also auto-skips past missed entries
 * and recalculates currentWeek from the calendar.
 */
export async function markSessionComplete(
  uid: string,
  week: number,
  day: number,
  summary: SessionSummary,
  activeProgram: ActiveRunningProgram,
): Promise<boolean> {
  try {
    const calendarWeek = calculateCurrentWeek(activeProgram.startDate);

    let updatedSchedule = activeProgram.schedule.map((entry) => {
      if (entry.week === week && entry.day === day && entry.status === 'pending') {
        return {
          ...entry,
          status: 'completed' as const,
          actualPerformance: {
            avgPace: summary.avgPace,
            completionRate: summary.completionRate,
          },
        };
      }
      return entry;
    });

    updatedSchedule = autoSkipMissedEntries(updatedSchedule, calendarWeek);

    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      'running.activeProgram.schedule': updatedSchedule,
      'running.activeProgram.currentWeek': calendarWeek,
      'running.lastWorkoutDate': new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });

    console.log(`[WorkoutCompletion] Session W${week}D${day} marked complete for ${uid}`);
    return true;
  } catch (error) {
    console.error('[WorkoutCompletion] markSessionComplete failed:', error);
    return false;
  }
}

// ── Week advancement check ───────────────────────────────────────────

/**
 * Returns true if all entries for a given week are either
 * 'completed' or 'skipped' (no 'pending' left).
 */
export function isWeekComplete(
  schedule: ActiveRunningProgram['schedule'],
  week: number,
): boolean {
  const weekEntries = schedule.filter((e) => e.week === week);
  if (weekEntries.length === 0) return false;
  return weekEntries.every((e) => e.status === 'completed' || e.status === 'skipped');
}

// ── Missed Workout Brain ─────────────────────────────────────────────

/**
 * Analyzes the user's program state and returns a recommended
 * alignment action based on missed workout patterns.
 *
 * Layer 1 (1 missed):   Silent — continue normally.
 * Layer 2 (2-3 missed): Show quality-makeup banner.
 * Layer 3 (7-21 day gap): Show plan-realign popup.
 * Layer 4 (21+ day gap):  Show rebuild popup.
 */
export function handleProgramAlignment(
  activeProgram: ActiveRunningProgram,
  lastWorkoutDate: string | Date | null | undefined,
): AlignmentAction {
  if (!lastWorkoutDate) {
    return { type: 'none' };
  }

  const gapDays = daysSince(lastWorkoutDate);

  if (gapDays >= 21) {
    return { type: 'rebuild', daysSinceLastWorkout: gapDays };
  }

  if (gapDays >= 7) {
    return { type: 'plan_realign', daysSinceLastWorkout: gapDays };
  }

  const calendarWeek = calculateCurrentWeek(activeProgram.startDate);
  const currentWeekEntries = activeProgram.schedule.filter(
    (e) => e.week === calendarWeek,
  );
  const missedThisWeek = currentWeekEntries.filter(
    (e) => e.status === 'skipped',
  ).length;

  const prevWeekEntries = activeProgram.schedule.filter(
    (e) => e.week === calendarWeek - 1,
  );
  const missedPrevWeek = prevWeekEntries.filter(
    (e) => e.status === 'skipped',
  ).length;

  const totalRecentMissed = missedThisWeek + missedPrevWeek;

  if (totalRecentMissed >= 2) {
    return { type: 'quality_makeup', missedCount: totalRecentMissed };
  }

  return { type: 'none' };
}

// ── Back 1 Week ──────────────────────────────────────────────────────

/**
 * Rolls the program back by 1 week:
 * 1. Takes the previous week's workoutIds from the schedule.
 * 2. Duplicates them into the current week's schedule slots, resetting
 *    status to 'pending'.
 * 3. Updates Firestore.
 */
export async function rollBackOneWeek(
  uid: string,
  activeProgram: ActiveRunningProgram,
): Promise<boolean> {
  try {
    const calendarWeek = calculateCurrentWeek(activeProgram.startDate);
    const prevWeek = calendarWeek - 1;
    if (prevWeek < 1) {
      console.warn('[WorkoutCompletion] Cannot roll back before week 1');
      return false;
    }

    const prevWeekEntries = activeProgram.schedule.filter(
      (e) => e.week === prevWeek,
    );

    if (prevWeekEntries.length === 0) {
      console.warn('[WorkoutCompletion] No entries found for previous week');
      return false;
    }

    const currentWeekWorkoutIds = prevWeekEntries.map((e) => e.workoutId);

    let updatedSchedule = activeProgram.schedule.filter(
      (e) => e.week !== calendarWeek,
    );

    const newEntries = currentWeekWorkoutIds.map((wid, i) => ({
      week: calendarWeek,
      day: i + 1,
      workoutId: wid,
      status: 'pending' as const,
    }));

    updatedSchedule = [...updatedSchedule, ...newEntries];

    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, {
      'running.activeProgram.schedule': updatedSchedule,
      'running.activeProgram.currentWeek': calendarWeek,
      updatedAt: serverTimestamp(),
    });

    console.log(`[WorkoutCompletion] Rolled back to week ${prevWeek} templates for week ${calendarWeek}`);
    return true;
  } catch (error) {
    console.error('[WorkoutCompletion] rollBackOneWeek failed:', error);
    return false;
  }
}

// ── Level Refinement Prompt ──────────────────────────────────────────

export type IntensityFeedback = 'too_easy' | 'perfect' | 'too_hard';

export interface RefinementPrompt {
  shouldPrompt: boolean;
  reason: 'first_workouts' | 'intensity_mismatch' | null;
  route: string;
}

const REFINEMENT_STORAGE_KEY = 'refinement_prompt_dismissed';
const REFINEMENT_WORKOUT_THRESHOLD = 2;

/**
 * Determines whether the user should be prompted to refine their
 * assessment levels after completing a strength workout.
 *
 * Triggers:
 *  1. After the 1st or 2nd workout (first_workouts).
 *  2. When the user provides non-"perfect" intensity feedback.
 *
 * The prompt is suppressed once dismissed (stored in localStorage).
 */
export function shouldPromptRefineLevels(
  completedWorkoutCount: number,
  intensityFeedback?: IntensityFeedback,
): RefinementPrompt {
  const noPrompt: RefinementPrompt = { shouldPrompt: false, reason: null, route: '/settings/refine-levels' };

  if (typeof window !== 'undefined') {
    const dismissed = localStorage.getItem(REFINEMENT_STORAGE_KEY);
    if (dismissed === 'true') return noPrompt;
  }

  if (intensityFeedback && intensityFeedback !== 'perfect') {
    return {
      shouldPrompt: true,
      reason: 'intensity_mismatch',
      route: '/settings/refine-levels',
    };
  }

  if (completedWorkoutCount <= REFINEMENT_WORKOUT_THRESHOLD) {
    return {
      shouldPrompt: true,
      reason: 'first_workouts',
      route: '/settings/refine-levels',
    };
  }

  return noPrompt;
}

/**
 * Call this when the user dismisses the refinement prompt
 * so it doesn't appear again.
 */
export function dismissRefinementPrompt(): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(REFINEMENT_STORAGE_KEY, 'true');
  }
}

/**
 * Reset the dismissal flag (e.g. after a program change or re-assessment).
 */
export function resetRefinementPrompt(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(REFINEMENT_STORAGE_KEY);
  }
}

// ── Convenience: get UID ─────────────────────────────────────────────

export function getCurrentUid(): string | null {
  return auth.currentUser?.uid ?? null;
}
