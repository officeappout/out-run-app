'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { resolveSetTarget } from '../logic/set-target.utils';
import type { ExerciseResultLog } from './useWorkoutStateMachine';

/**
 * useExerciseLog — SM-4
 *
 * Owns the exercise-log mutable ref, the reactive version counter, and
 * the write/read API surface:
 *
 *   exerciseLogRef   — stable mutable container; passed into moveToNext,
 *                      handleExerciseComplete, and handleRepetitionSave.
 *   logVersion       — bumped on every write; drives reactive memos in
 *                      useExerciseDerivedValues (globalExerciseIndex, lastSavedReps).
 *   bumpLog          — stable callback; callers (handleExerciseComplete,
 *                      handleRepetitionSave) call it directly after mutating the ref.
 *   autoSaveTargetReps — push the just-completed set without a user interaction.
 *   getExerciseLog   — stable snapshot accessor (returns a shallow copy).
 *   exerciseLogSnapshot — reactive shallow copy for UI consumers.
 *
 * ── Ordering note ────────────────────────────────────────────────────────────
 * This hook is intentionally called BEFORE usePyramidManager (SM-1) so that
 * exerciseLogRef is in scope when moveToNext is defined.  Consequently,
 * autoSaveTargetReps cannot receive pyramidStep as a hook-level dependency;
 * instead it inlines the same direct lookup on exercise.pyramidSequence that
 * existed in the orchestrator for exactly the same reason.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface ExerciseLogInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  workout: any; // WorkoutPlan
  currentSegmentIndex: number;
  currentExerciseIndex: number;
  currentSetIndex: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExercises: (seg: any) => any[] | null;
  /**
   * Crash-recovery seed — pre-populates exerciseLogRef on mount (used only
   * once, by useRef's initializer). Undefined (the default) preserves
   * today's behavior exactly: an empty log.
   */
  initialLog?: ExerciseResultLog[];
}

export interface ExerciseLogResult {
  exerciseLogRef: MutableRefObject<ExerciseResultLog[]>;
  /** Monotonic counter — incremented on every write; triggers reactive memos. */
  logVersion: number;
  /** Stable callback — call after any direct mutation of exerciseLogRef.current. */
  bumpLog: () => void;
  /**
   * Push the just-completed set into the log.
   *
   * - `overrideReps`: real elapsed time from IsometricTimerCard, or user value from CTA.
   * - Falls back to pyramid-step target → exercise.reps parse.
   * - Guards against double-saves (same set already logged via playlist pill).
   * - Does NOT advance the cursor or arm rest — single responsibility only.
   */
  autoSaveTargetReps: (overrideReps?: number, sideData?: { left: number; right: number }) => void;
  /** Returns a shallow copy of the log (stable across renders; reads live ref). */
  getExerciseLog: () => ExerciseResultLog[];
  /** Reactive shallow copy — updates whenever logVersion bumps. */
  exerciseLogSnapshot: ExerciseResultLog[];
}

// ============================================================================
// HOOK
// ============================================================================

export function useExerciseLog({
  workout,
  currentSegmentIndex,
  currentExerciseIndex,
  currentSetIndex,
  getExercises,
  initialLog,
}: ExerciseLogInput): ExerciseLogResult {

  // ── Log storage ────────────────────────────────────────────────────────────
  // useRef's initializer only runs on first mount, so seeding here is a
  // one-time crash-recovery hydration — subsequent re-renders never re-apply
  // initialLog even if the caller's reference changes.
  const exerciseLogRef = useRef<ExerciseResultLog[]>(initialLog ?? []);

  // ── Reactive version counter ───────────────────────────────────────────────
  const [logVersion, setLogVersion] = useState(0);
  const bumpLog = useCallback(() => setLogVersion((v) => {
    const next = v + 1;
    console.log(`🔄 [Source of Truth] logVersion incremented to: ${next} | Snapshot updated. | t=${performance.now().toFixed(1)}ms`);
    return next;
  }), []);

  // ── Auto-save (FillingButton / IsometricTimerCard) ─────────────────────────
  /**
   * Push the just-completed set into the exercise log.
   *
   * Called from `handleExerciseComplete` so the FillingButton CTA and the
   * IsometricTimerCard immediately commit a log entry → bump `logVersion`
   * → reactive memos (header pills, playlist set-pill grid) repaint without
   * waiting for the (now-killed) drawer.
   *
   * Pyramid/Max-Set: inlines the same sequence lookup that used to live in
   * the orchestrator.  usePyramidManager is called AFTER this hook, so we
   * cannot receive pyramidStep as a dependency — we read directly from
   * exercise.pyramidSequence[currentSetIndex] instead.
   */
  const autoSaveTargetReps = useCallback(
    (overrideReps?: number, sideData?: { left: number; right: number }) => {
      const exercise = (() => {
        const segment = workout.segments[currentSegmentIndex];
        const exercises = getExercises(segment);
        return exercises?.[currentExerciseIndex] || null;
      })();
      if (!exercise) return;

      const segId = workout.segments[currentSegmentIndex]?.id || String(currentSegmentIndex);

      // Unified per-set target (Stage 0, set-target.utils): pyramid step →
      // repsSequence → stripped reps-string. Fixes the repetition-pyramid
      // logging bug — this path previously skipped repsSequence entirely, so
      // sets 2+ of a reps-pyramid auto-logged the shape's first value.
      const target = resolveSetTarget(exercise, currentSetIndex);

      let reps = overrideReps ?? 0;
      if (overrideReps === undefined) {
        reps = target.reps ?? target.hold ?? 0;
      }

      const existing = exerciseLogRef.current.find(
        (e) => e.exerciseId === exercise.id && e.segmentId === segId,
      );

      if (existing) {
        // Guard against double-saves: if the user already logged this round via
        // the playlist pill, don't append again.
        if (existing.confirmedReps.length > currentSetIndex) {
          console.log(
            `[Engine] autoSaveTargetReps SKIPPED — set ${currentSetIndex + 1} already logged for "${exercise.name}"`,
          );
          return;
        }
        existing.confirmedReps.push(reps);
        if (sideData) {
          if (!existing.confirmedRepsRight) existing.confirmedRepsRight = [];
          if (!existing.confirmedRepsLeft) existing.confirmedRepsLeft = [];
          existing.confirmedRepsRight.push(sideData.right);
          existing.confirmedRepsLeft.push(sideData.left);
        }
      } else {
        exerciseLogRef.current.push({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          segmentId: segId,
          confirmedReps: [reps],
          targetReps: reps,
          ...(sideData && {
            confirmedRepsRight: [sideData.right],
            confirmedRepsLeft: [sideData.left],
          }),
        });
      }

      bumpLog();
      console.log(
        `[Engine] Auto-saved set ${currentSetIndex + 1}: ${exercise.name} → ${reps}` +
          `${sideData ? ` (R:${sideData.right} L:${sideData.left})` : ''}` +
          `${target.source !== 'none' && overrideReps === undefined ? ` (target: ${target.source})` : ''}` +
          `${overrideReps !== undefined ? ' [override]' : ''}`,
      );
    },
    [workout, currentSegmentIndex, currentExerciseIndex, currentSetIndex, getExercises, bumpLog],
  );

  // ── Read API ───────────────────────────────────────────────────────────────

  /** Stable accessor — returns a shallow copy of the live log. */
  const getExerciseLog = useCallback(
    (): ExerciseResultLog[] => [...exerciseLogRef.current],
    [],
  );

  /**
   * Reactive shallow copy — triggers re-renders in UI consumers that need
   * to display the log without direct ref access.  `logVersion` drives
   * recomputation on every write.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const exerciseLogSnapshot = useMemo(
    () => exerciseLogRef.current.map((e) => ({ ...e, confirmedReps: [...e.confirmedReps] })),
    [logVersion],
  );

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    exerciseLogRef,
    logVersion,
    bumpLog,
    autoSaveTargetReps,
    getExerciseLog,
    exerciseLogSnapshot,
  };
}
