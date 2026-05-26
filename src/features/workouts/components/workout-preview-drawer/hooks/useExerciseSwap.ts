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

// ── Standard-Path Volume Scaling Constants (Phase 3.5) ────────────────────
// Asymmetric multipliers: a harder variant trims volume 10% per level of
// upgrade (more leverage demand → fewer reps to preserve quality), while
// an easier variant adds 15% per level of downgrade (less leverage demand
// → more reps to preserve total work).  The asymmetry keeps perceived
// exertion roughly constant across user-driven swaps in either direction.
const VOLUME_DELTA_HARDER = 0.1;
const VOLUME_DELTA_EASIER = 0.15;
// Floors / caps prevent the scaler from collapsing to physiologically
// useless values when the user makes very large jumps.
const MIN_REPS_FLOOR = 4;
const MAX_REPS_CAP = 20;
const MIN_HOLD_FLOOR_S = 8;
// Baselines mirror WorkoutGenerator.substituteExercise() — applied first
// when the metric flips, then the level-delta modifier runs on top.
const METRIC_RESET_HOLD_REPS = 30;
const METRIC_RESET_HOLD_RANGE = { min: 20, max: 45 };
const METRIC_RESET_REPS = 12;
const METRIC_RESET_RANGE = { min: 6, max: 12 };
// TUT multiplier — kept in lock-step with TUT_REPS_TO_SECONDS in
// pyramid.processor.ts so both write paths agree on the conversion.
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

        // ── Metric Identity Re-Derivation ────────────────────────────────────
        // The old WorkoutExercise wrapper carries an `isTimeBased` flag that
        // was computed for the EXITING exercise.  When the swap target is a
        // static hold (e.g. 'החזקת מתח ב-15°') the new exercise's metric is
        // 'time', but spreading `...we` would inherit `isTimeBased: false`
        // and the UI would print "X חזרות" forever.  Re-resolve from the
        // incoming exercise's schema (mirrors `substituteExercise` in
        // WorkoutGenerator.ts so the two swap paths stay aligned).
        const newIsTimeBased = isTimeBasedExercise(newExercise);
        const metricChanged = newIsTimeBased !== we.isTimeBased;

        // ── Numeric Level Delta (Phase 3.5) ──────────────────────────────────
        // Replaces the coarse 3-bucket `levelComparison` enum from the modal.
        // We read the actual numeric `targetPrograms[0].level` off both
        // documents so a +1 swap and a +10 swap scale proportionally rather
        // than receiving identical reductions.  Safely defaults to 0 (no
        // scaling) when either exercise lacks a `targetPrograms` entry, so
        // legacy / migrated docs never crash the swap flow.
        const oldLevel = exerciseToReplace.targetPrograms?.[0]?.level ?? 0;
        const newLevel = newExercise.targetPrograms?.[0]?.level ?? oldLevel;
        const levelDelta = newLevel - oldLevel;

        // ── Stage 1 — Baseline ───────────────────────────────────────────────
        // When the metric type changes, the inherited rep count is in the
        // wrong unit and must be replaced before any scaling math can run.
        // Otherwise we start from the current wrapper's values and let the
        // delta modifier adjust them in-place.
        let adjustedReps = we.reps;
        let adjustedRange = we.repsRange;

        if (metricChanged) {
          if (newIsTimeBased) {
            adjustedReps = METRIC_RESET_HOLD_REPS;
            adjustedRange = { ...METRIC_RESET_HOLD_RANGE };
          } else {
            adjustedReps = METRIC_RESET_REPS;
            adjustedRange = { ...METRIC_RESET_RANGE };
          }
        }

        // ── Stage 2 — Proportional Level-Delta Modifier ──────────────────────
        // Harder (delta > 0) trims by VOLUME_DELTA_HARDER per level, easier
        // (delta < 0) adds by VOLUME_DELTA_EASIER per level.  Floors / caps
        // protect against pathological multi-level swings (e.g. L19 → L3).
        // The modifier runs regardless of whether `metricChanged` fired —
        // a metric-flip swap still respects the level difficulty signal.
        if (levelDelta !== 0) {
          const multiplier =
            levelDelta > 0
              ? Math.max(0.1, 1 - VOLUME_DELTA_HARDER * levelDelta)
              : 1 + VOLUME_DELTA_EASIER * Math.abs(levelDelta);

          const floor = newIsTimeBased ? MIN_HOLD_FLOOR_S : MIN_REPS_FLOOR;
          // The reps cap only applies to rep-based exercises — hold seconds
          // can legitimately grow when the variant is much easier (e.g. a
          // longer plank), so we leave time-based easier swaps uncapped.
          const cap =
            !newIsTimeBased && levelDelta < 0 ? MAX_REPS_CAP : Infinity;

          const scaleValue = (v: number): number =>
            Math.min(cap, Math.max(floor, Math.round(v * multiplier)));

          adjustedReps = scaleValue(adjustedReps);
          if (adjustedRange) {
            adjustedRange = {
              min: scaleValue(adjustedRange.min),
              max: scaleValue(adjustedRange.max),
            };
          }
        }

        // Read pairedWith from the live iteration variable rather than the
        // pre-captured outer `replacedEntry` / `survivingPartnerId`.  This
        // eliminates the stale-closure race: if `replacedEntry` was null or
        // its `pairedWith` was undefined (e.g. plan loaded from Firestore
        // without wrapper-level metadata), `survivingPartnerId` would be null
        // and the link would never be re-stitched.  Reading `we.pairedWith`
        // directly always reflects the actual live wrapper state.
        const thisPartnerLink = (we as any).pairedWith as
          | string
          | null
          | undefined;

        return {
          ...we,
          exercise: newExercise,
          method,
          isTimeBased: newIsTimeBased,
          // Pin the role to the old wrapper's value or force 'main'.  Without
          // this, `...we` spreads `exerciseRole: undefined`, and
          // `groupExercisesIntoSections` falls through via `||` to
          // `(ex.exercise as any).exerciseRole` on the new Firestore document.
          // If that document carries 'warmup' (e.g. a mobility drill chosen
          // from the pool), the exercise is routed out of main entirely and the
          // superset partner is left referencing a ghost ID.
          exerciseRole: we.exerciseRole ?? 'main',
          // Phase 3.5 — keep the wrapper's level in sync with the actual
          // document so DifficultyBolts, level pills, and downstream
          // guarantee passes don't mis-read the swapped card as the old
          // level.  Falls back to the old level when the new doc has no
          // targetPrograms entry, so the wrapper never silently drops to 0.
          programLevel: newLevel || we.programLevel,
          reps: adjustedReps,
          repsRange: adjustedRange,
          wasSwapped: true,
          // Re-stitch the pairing link unconditionally from the live wrapper.
          // Omitted only when the exercise genuinely had no partner.
          ...(thisPartnerLink ? { pairedWith: thisPartnerLink } : {}),
        };
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
