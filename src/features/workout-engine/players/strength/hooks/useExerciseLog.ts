'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import type { MutableRefObject } from 'react';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
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
}: ExerciseLogInput): ExerciseLogResult {

  // ── Log storage ────────────────────────────────────────────────────────────
  const exerciseLogRef = useRef<ExerciseResultLog[]>([]);

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

      // Pyramid/Max-Set: read the per-step target rather than parsing the
      // base exercise reps string.  The reps string holds the SHAPE's first
      // step value (e.g. "8") but each step has its own structural value —
      // using the raw string would log the wrong baseline for sets 2 and 3.
      const stepTarget = (
        (exercise as any)?.pyramidSequence as PyramidStep[] | undefined
      )?.[currentSetIndex] ?? null;

      let reps = overrideReps ?? 0;
      if (overrideReps === undefined) {
        if (stepTarget) {
          reps = stepTarget.targetReps ?? stepTarget.targetHold ?? 0;
        } else {
          const repsStr = (exercise.reps as string | undefined)?.replace(/^\d+\s*[xX×]\s*/, '') ?? '';
          if (repsStr) {
            const match = repsStr.match(/(\d+)/);
            reps = match ? parseInt(match[1], 10) : 0;
          }
        }
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
          `${stepTarget ? ` (pyramid step ${currentSetIndex})` : ''}` +
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
