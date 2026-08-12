'use client';

import { useCallback, useEffect, useRef } from 'react';
import type { ExerciseResultLog } from './useWorkoutStateMachine';

// ============================================================================
// TYPES
// ============================================================================

export interface WorkoutCheckpoint {
  workoutId: string;
  segmentIndex: number;
  exerciseIndex: number;
  /** 0-based index of the current set within the current exercise (straight-sets counter). */
  setIndex: number;
  elapsedTime: number;
  exerciseLog: ExerciseResultLog[];
  savedAt: number; // Unix timestamp

  // ── Hybrid Workout Block Support ──────────────────────────────────────
  /** Identifies which block this checkpoint belongs to in a multi-block workout */
  blockId?: string;
  /** Discriminant for the block type (e.g. 'STRENGTH_BLOCK', 'CARDIO_BLOCK') */
  blockType?: string;

  /**
   * Generic payload for block-specific data that doesn't fit the standard
   * schema. A CardioRunner might store { distanceMeters, avgPace, routePoints }
   * here without changing the persistence interface.
   */
  meta?: Record<string, unknown>;
}

export interface UseWorkoutPersistenceOptions {
  /** Current workout identifier — checkpoints are keyed to this */
  workoutId: string;
  /** Current navigation indices and elapsed time for auto-save */
  segmentIndex: number;
  exerciseIndex: number;
  /** 0-based index of the current set within the current exercise */
  setIndex: number;
  elapsedTime: number;
  exerciseLog: ExerciseResultLog[];
  /**
   * When true, auto-saves a checkpoint every time the indices or elapsed time
   * change. Set to false before the workout completes to avoid a stale save.
   */
  enabled: boolean;
  /**
   * Called when the page becomes hidden (tab switch, phone lock).
   * Use this to pause timers while the app is in the background.
   */
  onBackground?: () => void;
  /**
   * Called when the page becomes visible again after being hidden.
   */
  onForeground?: () => void;

  // ── Hybrid Workout Block Support ──────────────────────────────────────
  /** Identifies which block this checkpoint belongs to */
  blockId?: string;
  /** Discriminant for the block type */
  blockType?: string;
  /**
   * Generic payload persisted alongside the standard checkpoint fields.
   * Pass cardio-specific data (distance, pace) or any block-specific state
   * here; it is written to localStorage as-is and restored verbatim.
   */
  meta?: Record<string, unknown>;
}

export interface UseWorkoutPersistenceResult {
  /** Read a saved checkpoint for the given workoutId (returns null if none / expired) */
  restoreCheckpoint: (workoutId: string) => WorkoutCheckpoint | null;
  /** Explicitly write the current state as a checkpoint */
  saveCheckpoint: () => void;
  /** Remove the stored checkpoint (call after a clean workout finish) */
  clearCheckpoint: () => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STORAGE_KEY = 'outrun_active_workout';
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours — stale checkpoints are discarded

// ============================================================================
// STANDALONE UTILITY
// ============================================================================

/**
 * Remove the stored workout checkpoint without needing a hook instance.
 *
 * Call this from the page-level completion handler (e.g. handleSummaryFinish
 * in active/page.tsx) AFTER a successful Firestore save.  The resume-offer
 * dialog checks this key on next launch — only clear it on the happy path so
 * a failed save still offers the user a chance to resume.
 */
export function clearWorkoutCheckpoint(): void {
  try {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Private browsing / storage quota — silently ignore
  }
}

/**
 * Read back a saved checkpoint for the given workoutId, without needing a
 * hook instance — no live state-machine values are required for this read,
 * it is a pure synchronous localStorage read/parse/staleness-check.
 *
 * Call this from the page-level mount effect (active/page.tsx) BEFORE
 * StrengthRunner mounts, so the resume-offer dialog can be shown (or skipped)
 * before the state machine's initial state is committed.
 *
 * Returns null when: no checkpoint stored, the checkpoint belongs to a
 * different workoutId, or the checkpoint is older than MAX_AGE_MS (2 hours).
 */
export function restoreCheckpoint(workoutId: string): WorkoutCheckpoint | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const checkpoint = JSON.parse(raw) as WorkoutCheckpoint;
    if (checkpoint.workoutId !== workoutId) return null;
    if (Date.now() - checkpoint.savedAt > MAX_AGE_MS) return null;
    return checkpoint;
  } catch {
    return null;
  }
}

// ============================================================================
// HOOK
// ============================================================================

/**
 * useWorkoutPersistence
 *
 * Provides crash-recovery for the active workout session:
 *
 *   - `saveCheckpoint()` writes navigation state + exercise log to localStorage.
 *     Called automatically (debounced 500ms) whenever indices or elapsed time
 *     change while `enabled` is true.
 *
 *   - `restoreCheckpoint(workoutId)` reads back a matching, non-expired checkpoint.
 *     Call this on mount in ActiveWorkoutPage before rendering the runner.
 *
 *   - `clearCheckpoint()` removes the stored data after a clean finish.
 *
 *   - `visibilitychange` listener: fires `onBackground` / `onForeground` and
 *     performs an immediate synchronous save when the page is hidden (e.g. phone
 *     lock or incoming call) so no progress is lost.
 */
export function useWorkoutPersistence({
  workoutId,
  segmentIndex,
  exerciseIndex,
  setIndex,
  elapsedTime,
  exerciseLog,
  enabled,
  onBackground,
  onForeground,
  blockId,
  blockType,
  meta,
}: UseWorkoutPersistenceOptions): UseWorkoutPersistenceResult {
  // Keep latest values in a ref so the visibility handler always has fresh data
  const latestRef = useRef({
    workoutId,
    segmentIndex,
    exerciseIndex,
    setIndex,
    elapsedTime,
    exerciseLog,
    enabled,
    blockId,
    blockType,
    meta,
  });

  useEffect(() => {
    latestRef.current = {
      workoutId,
      segmentIndex,
      exerciseIndex,
      setIndex,
      elapsedTime,
      exerciseLog,
      enabled,
      blockId,
      blockType,
      meta,
    };
  });

  // --------------------------------------------------------------------------
  // HELPERS
  // --------------------------------------------------------------------------

  const writeToStorage = useCallback((checkpoint: WorkoutCheckpoint) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(checkpoint));
    } catch {
      // Storage quota exceeded or private browsing — silently skip
    }
  }, []);

  const saveCheckpoint = useCallback(() => {
    const cur = latestRef.current;
    if (!cur.enabled) return;
    writeToStorage({
      workoutId: cur.workoutId,
      segmentIndex: cur.segmentIndex,
      exerciseIndex: cur.exerciseIndex,
      setIndex: cur.setIndex,
      elapsedTime: cur.elapsedTime,
      exerciseLog: cur.exerciseLog,
      savedAt: Date.now(),
      blockId: cur.blockId,
      blockType: cur.blockType,
      meta: cur.meta,
    });
  }, [writeToStorage]);

  // `restoreCheckpoint` is the module-level standalone function above — its
  // body has zero dependency on this hook's closure (only its own `workoutId`
  // argument + localStorage), so the hook returns it directly rather than
  // wrapping it in a duplicate useCallback.

  const clearCheckpoint = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }, []);

  // --------------------------------------------------------------------------
  // EFFECT — Auto-Save (debounced 500ms)
  // Triggered whenever navigation indices or elapsed time change
  // --------------------------------------------------------------------------

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      writeToStorage({
        workoutId,
        segmentIndex,
        exerciseIndex,
        setIndex,
        elapsedTime,
        exerciseLog,
        savedAt: Date.now(),
        blockId,
        blockType,
        meta,
      });
    }, 500);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workoutId, segmentIndex, exerciseIndex, setIndex, elapsedTime, enabled, writeToStorage, exerciseLog, blockId, blockType, meta]);

  // --------------------------------------------------------------------------
  // EFFECT — visibilitychange Listener
  // Saves immediately when the tab/app goes into background (phone lock, call)
  // --------------------------------------------------------------------------

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Synchronous save — cannot await here
        saveCheckpoint();
        onBackground?.();
      } else {
        onForeground?.();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [saveCheckpoint, onBackground, onForeground]);

  // --------------------------------------------------------------------------
  // RETURN
  // --------------------------------------------------------------------------

  return {
    restoreCheckpoint,
    saveCheckpoint,
    clearCheckpoint,
  };
}
