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
import { RUNNING_ROLLBACK_PRESERVE_FIELDS_V1 } from '@/config/feature-flags';
import type { ActiveRunningProgram } from '../types/running.types';
import { calculateCurrentWeek } from '@/lib/running-current-week';
import {
  buildRolledBackSchedule,
  resolveProgramAlignment,
  type AlignmentAction,
} from './running-alignment';

// Re-exported for existing importers (9 call sites across the app) — the
// function itself now lives in src/lib/running-current-week.ts, a pure
// module with no Firebase import (see that file's own doc for why: this
// file imports firebase/firestore at the top level for its write-side
// exports, markSessionComplete/rollBackOneWeek below, and a caller that
// must stay import-graph-pure — e.g. weaverInput.ts — can't import
// anything from here). Pure relocation, zero behavior change.
export { calculateCurrentWeek };

// ── Types ────────────────────────────────────────────────────────────

export interface SessionSummary {
  avgPace: number;
  completionRate: number;
  distanceKm: number;
  durationSeconds: number;
}

// Moved to the pure running-alignment.ts (schedule advisor phase A); re-exported for
// the existing importers.
export type { AlignmentAction };
export { resolveProgramAlignment, buildRolledBackSchedule };

// ── Calendar Logic ───────────────────────────────────────────────────
// calculateCurrentWeek itself now lives in src/lib/running-current-week.ts
// — imported above, re-exported for existing callers. See that file for
// the full doc (unchanged) on the Math.max(1,...) clamp and why any caller
// with an arbitrary asOfDate must use resolveWeekForDate instead.

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
  // Same behaviour as before — the logic is the pure resolveProgramAlignment (bug #12),
  // anchored on the device clock here, at the edge.
  return resolveProgramAlignment(activeProgram, lastWorkoutDate, new Date());
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

    // Pure rewrite (running-alignment.ts) — now preserves category / slotType /
    // isQualityWorkout / priority / workoutName on the repeated entries (bug #7).
    // Behind RUNNING_ROLLBACK_PRESERVE_FIELDS_V1 (default OFF = the legacy workoutId-only copy).
    const updatedSchedule = buildRolledBackSchedule(activeProgram.schedule, calendarWeek, RUNNING_ROLLBACK_PRESERVE_FIELDS_V1);
    if (!updatedSchedule) {
      console.warn('[WorkoutCompletion] No entries found for previous week');
      return false;
    }

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
