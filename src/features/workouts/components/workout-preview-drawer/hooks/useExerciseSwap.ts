'use client';

import { useCallback, useState } from 'react';
import {
  type Exercise as FirestoreExercise,
  type ExecutionMethod,
  getLocalizedText,
} from '@/features/content/exercises';
import type {
  GeneratedWorkout,
  WorkoutExercise as EngineWorkoutExercise,
} from '@/features/workout-engine/logic/WorkoutGenerator';
import { isTimeBasedExercise } from '@/features/workout-engine/logic/workout-budgeting.utils';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { deriveSwappedEntry } from '../utils/derive-swapped-entry.util';

// TUT multiplier — kept in lock-step with TUT_REPS_TO_SECONDS in
// pyramid.processor.ts so both write paths agree on the conversion.
// (Standard-path volume/metric-reset constants moved to derive-swapped-entry.util.ts,
// now shared by the single-swap and bulk swap-all paths.)
const TUT_REPS_TO_SECONDS = 2.5;

interface PyramidSwapContext {
  parentExerciseId: string;
  stepIndex: number;
  originalExerciseId: string;
}

interface UseExerciseSwapParams {
  generatedWorkout: GeneratedWorkout | null | undefined;
  onGeneratedWorkoutUpdate?: (updated: GeneratedWorkout) => void;
}

interface UseExerciseSwapReturn {
  /** Modal-open state (consumed by `<ExerciseReplacementModal />`). */
  replacementModalOpen: boolean;
  /** Exercise the user tapped to swap, or `null` when the modal is closed. */
  exerciseToReplace: FirestoreExercise | null;
  /** Resolved level passed to the modal so the variant pool stays accurate. */
  exerciseToReplaceLevel: number;
  /**
   * Open the swap modal for a standard (non-pyramid) exercise.  Clears any
   * leftover pyramid context so the next confirm runs the standard path.
   */
  handleOpenSwapModal: (exercise: FirestoreExercise, level: number) => void;
  /**
   * Open the swap modal scoped to a single PYRAMID STEP.  The parent's
   * movementGroup defines the variant pool; the step's resolved level
   * controls which tier of variants are offered.  On confirm,
   * `handleExerciseReplace` detects the pyramid context and applies the
   * twin-sync mutation instead of replacing the parent wholesale.
   */
  handleOpenPyramidStepSwap: (
    parent: EngineWorkoutExercise,
    stepIndex: number,
  ) => void;
  /** Modal `onReplace` callback — applies the swap to the GeneratedWorkout. */
  handleExerciseReplace: (
    newExercise: FirestoreExercise,
    method: ExecutionMethod,
    _levelComparison: 'lower' | 'same' | 'higher',
  ) => void;
  /** Modal `onClose` callback — clears state in one atomic flush. */
  closeReplacementModal: () => void;
}

/**
 * Owns the entire exercise-swap state machine + mutation logic.
 *
 * Manages:
 *   • Modal-open flag + which exercise / level is being swapped.
 *   • Pyramid-step context (set when the user opens the modal from a
 *     single step inside a pyramid sequence — triggers the twin-sync path).
 *   • The 200-line mutation function that rebuilds the GeneratedWorkout
 *     with the new exercise, recomputes per-level volume scaling, repairs
 *     superset / antagonist-pair pointers, and re-derives the metric
 *     identity when a rep-based swap lands on a time-based variant
 *     (or vice-versa).
 *
 * `handleExerciseReplace` is wrapped in `useCallback` so the modal's
 * `onReplace` prop reference stays stable across orchestrator renders.
 */
export function useExerciseSwap({
  generatedWorkout,
  onGeneratedWorkoutUpdate,
}: UseExerciseSwapParams): UseExerciseSwapReturn {
  const [replacementModalOpen, setReplacementModalOpen] = useState(false);
  const [exerciseToReplace, setExerciseToReplace] =
    useState<FirestoreExercise | null>(null);
  const [exerciseToReplaceLevel, setExerciseToReplaceLevel] = useState(1);
  const [pyramidSwapContext, setPyramidSwapContext] =
    useState<PyramidSwapContext | null>(null);

  const handleOpenSwapModal = useCallback(
    (exercise: FirestoreExercise, level: number) => {
      setPyramidSwapContext(null);
      setExerciseToReplace(exercise);
      setExerciseToReplaceLevel(level);
      setReplacementModalOpen(true);
    },
    [],
  );

  const handleOpenPyramidStepSwap = useCallback(
    (parent: EngineWorkoutExercise, stepIndex: number) => {
      const step = parent.pyramidSequence?.[stepIndex];
      if (!step) return;
      setPyramidSwapContext({
        parentExerciseId: parent.exercise.id,
        stepIndex,
        originalExerciseId: step.exerciseId,
      });
      setExerciseToReplace(parent.exercise);
      setExerciseToReplaceLevel(step.level ?? parent.programLevel ?? 1);
      setReplacementModalOpen(true);
    },
    [],
  );

  const closeReplacementModal = useCallback(() => {
    setReplacementModalOpen(false);
    setExerciseToReplace(null);
    setPyramidSwapContext(null);
  }, []);

  const handleExerciseReplace = useCallback(
    (
      newExercise: FirestoreExercise,
      method: ExecutionMethod,
      _levelComparison: 'lower' | 'same' | 'higher',
    ) => {
      if (!generatedWorkout || !exerciseToReplace) return;

      // ── Pyramid Step Swap Path (Twin-Sync + Strict Shape Preservation) ─
      // When the user swaps a single step inside a pyramid, we mutate the
      // parent exercise's `pyramidSequence` rather than replacing the whole
      // WorkoutExercise.  Any step that referenced the same `exerciseId` as
      // the originally tapped step (its "pyramid twin") is updated at the
      // same time so the lever-chain remains internally consistent
      // (e.g., a triangle wave with Tuck at sets 1 & 5 stays symmetric).
      //
      // Phase 3.5 contract: pyramid steps are governed by structural shapes
      // (e.g. D3 short reps [6,3,1]).  We MUST NOT apply any level-delta
      // multiplication here — the rep count is the shape, not a workload to
      // be scaled.  Only the METRIC schema flips dynamically: if the new
      // variant is time-based, the same raw shape rep is converted into
      // accurate seconds via the engine's TUT multiplier (2.5×).
      if (pyramidSwapContext) {
        const { parentExerciseId, originalExerciseId } = pyramidSwapContext;
        const newName = getLocalizedText(newExercise.name, 'he');
        const { imageUrl: newImage, videoUrl: newVideo } = resolveExerciseMedia(
          newExercise as any,
          method as any,
        );

        // Re-derive the metric from the new variant's own schema.  Mirror
        // the dual-source check used by pyramid.processor.ts so legacy
        // Firestore docs that carry `metric: 'hold'` without `type: 'time'`
        // are still routed through the TUT branch.
        const newStepIsTimeBased =
          (newExercise as any).metric === 'hold' ||
          isTimeBasedExercise(newExercise);

        let twinCount = 0;
        const updatedExercisesPyramid = generatedWorkout.exercises.map((we) => {
          if (we.exercise.id !== parentExerciseId) return we;
          if (!we.pyramidSequence || we.pyramidSequence.length === 0) return we;

          const newSeq = we.pyramidSequence.map((step) => {
            if (step.exerciseId !== originalExerciseId) return step;
            twinCount++;

            // Recover the raw shape rep count.  When the step is currently
            // rep-based we read `targetReps` directly.  When it's already a
            // hold, we divide by the TUT multiplier to recover the original
            // shape rep — round-trip is stable for the engine's shape table
            // (e.g. 8 → 20s → 8, 3 → 8s → 3, 1 → 3s → 1).
            const shapeRep =
              step.targetReps != null
                ? step.targetReps
                : step.targetHold != null
                  ? Math.round(step.targetHold / TUT_REPS_TO_SECONDS)
                  : 0;

            // Per-step swap flag — keeps the cyan highlight scoped to just
            // the altered steps (and their twins).  We deliberately do
            // NOT set `wasSwapped` on the parent exercise so non-twin
            // steps keep their neutral grey swap icon.
            //
            // Writing the metric: explicit `undefined` on the unused side
            // is intentional — the renderer's `step.targetHold !== undefined`
            // check is what selects the unit, so the inactive field must
            // not retain its stale value from the previous variant.
            return {
              ...step,
              exerciseId: newExercise.id,
              name: newName,
              imageUrl: newImage,
              videoSrc: newVideo,
              isSwapped: true,
              ...(newStepIsTimeBased
                ? {
                    targetHold: Math.round(shapeRep * TUT_REPS_TO_SECONDS),
                    targetReps: undefined,
                  }
                : { targetReps: shapeRep, targetHold: undefined }),
            };
          });

          return { ...we, pyramidSequence: newSeq };
        });

        console.log(
          `[PyramidSwap] Twin-sync: replaced "${originalExerciseId}" with ` +
            `"${newExercise.id}" (${newName}) across ${twinCount} step(s) of ` +
            `parent "${parentExerciseId}" — ` +
            `metric=${newStepIsTimeBased ? 'time(targetHold)' : 'reps(targetReps)'}`,
        );

        const updatedPlan: GeneratedWorkout = {
          ...generatedWorkout,
          exercises: updatedExercisesPyramid,
        };
        onGeneratedWorkoutUpdate?.(updatedPlan);
        setPyramidSwapContext(null);
        return;
      }

      // ── Bidirectional Pair Healing ─────────────────────────────────────────
      // When the exercise being replaced belongs to a Superset / Antagonist Pair
      // the two `pairedWith` pointers must be re-stitched in the same pass so
      // `groupExercisesIntoSections` continues bundling them into one composite
      // block rather than demoting both to standalone straight sets.
      const replacedEntry = generatedWorkout.exercises.find(
        (we) => we.exercise.id === exerciseToReplace.id,
      );
      const survivingPartnerId = replacedEntry?.pairedWith ?? null;

      const updatedExercises = generatedWorkout.exercises.map((we) => {
        if (survivingPartnerId && we.exercise.id === survivingPartnerId) {
          return { ...we, pairedWith: newExercise.id };
        }

        if (we.exercise.id !== exerciseToReplace.id) return we;

        // Single-source per-entry re-derivation (metric identity, level-delta
        // volume, role-pin, own pair-link) — shared with the bulk swap-all path.
        return deriveSwappedEntry(we, newExercise, method);
      });

      const updated: GeneratedWorkout = {
        ...generatedWorkout,
        exercises: updatedExercises,
      };
      onGeneratedWorkoutUpdate?.(updated);
    },
    [
      generatedWorkout,
      exerciseToReplace,
      pyramidSwapContext,
      onGeneratedWorkoutUpdate,
    ],
  );

  return {
    replacementModalOpen,
    exerciseToReplace,
    exerciseToReplaceLevel,
    handleOpenSwapModal,
    handleOpenPyramidStepSwap,
    handleExerciseReplace,
    closeReplacementModal,
  };
}
