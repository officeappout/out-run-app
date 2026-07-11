'use client';

import { useMemo } from 'react';
import type { PyramidStep } from '@/features/workout-engine/logic/workout-generator.types';
import { resolvePyramidStep } from '../logic/set-target.utils';

/**
 * usePyramidManager — pure pyramid-protocol computation hook (Step SM-1).
 *
 * Reads `activeExercise.pyramidSequence[currentSetIndex]` and derives all
 * per-step override values that the workout runner consumes:
 *
 *   • `pyramidStep`        — the raw step object (null for non-pyramid sets)
 *   • `isPyramidActive`    — convenience boolean
 *   • `pyramidName`        — variant name override (e.g. "Straddle Front Lever")
 *   • `pyramidTargetReps`  — per-step rep target (null when step uses hold)
 *   • `pyramidTargetHold`  — per-step hold duration in seconds (null for rep sets)
 *   • `pyramidVideoSrc`    — per-step variant video URL (null when absent)
 *   • `pyramidImageUrl`    — per-step variant thumbnail (null when absent)
 *
 * In addition, `resolveStepFor(exercise, setIndex)` exposes the same lookup
 * for arbitrary exercise + index pairs so `autoSaveTargetReps` and the
 * `nextExercise` look-ahead can retrieve the correct step target without
 * duplicating the `pyramidSequence[idx]` access pattern.
 *
 * Pure computation — no state, no effects, no Firebase reads, no side effects.
 * Safe to call anywhere in the hook stack.
 *
 * Extracted from useWorkoutStateMachine.ts (Refactoring Step SM-1).
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PyramidManagerInput {
  /** Active exercise, or null when none is loaded yet. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeExercise: any; // WorkoutExercise | null — typed as `any` to match the
                       // loose exercise shape coming out of the workout plan.
  /** 0-based index of the set currently being performed. */
  currentSetIndex: number;
}

export interface PyramidManagerResult {
  /** The active pyramid step, or null for non-pyramid exercises. */
  pyramidStep: PyramidStep | null;
  /** Convenience: true when `pyramidStep !== null`. */
  isPyramidActive: boolean;
  /** Per-step variant name override, or null when absent. */
  pyramidName: string | null;
  /** Per-step rep target, or null when the step uses a hold duration. */
  pyramidTargetReps: number | null;
  /** Per-step hold duration in seconds, or null for rep-based steps. */
  pyramidTargetHold: number | null;
  /** Per-step variant video URL, or null when the step has no video. */
  pyramidVideoSrc: string | null;
  /** Per-step variant thumbnail, or null when absent. */
  pyramidImageUrl: string | null;
  /**
   * Resolve the pyramid step for an arbitrary exercise + set-index pair.
   *
   * Used by `autoSaveTargetReps` (which accesses the exercise snapshot from
   * the segment array, not from `activeExercise`) and by the `nextExercise`
   * look-ahead (which reads `currentSetIndex + 1`).
   *
   * Returns null when the exercise has no `pyramidSequence` or the index is
   * out of range.
   */
  resolveStepFor: (exercise: unknown, setIndex: number) => PyramidStep | null;
}

// ============================================================================
// HOOK
// ============================================================================

export function usePyramidManager({
  activeExercise,
  currentSetIndex,
}: PyramidManagerInput): PyramidManagerResult {
  // ── Active step for the current exercise + set ──────────────────────────
  // Delegates to the SINGLE lookup in set-target.utils (Stage 0) — the same
  // resolution used by auto-save logging and the look-ahead preview, so the
  // per-step name/video/image can never drift between consumers again.
  const pyramidStep = useMemo<PyramidStep | null>(
    () => resolvePyramidStep(activeExercise, currentSetIndex),
    [activeExercise, currentSetIndex],
  );

  const isPyramidActive = pyramidStep !== null;

  // ── Per-step override values ────────────────────────────────────────────
  // These are straight reads from the step object.  They are memoised here
  // so the orchestrator can safely spread them into its own memos without
  // re-reading pyramidStep?.xxx every time (reduces duplication risk).
  const pyramidName = pyramidStep?.name ?? null;
  const pyramidTargetReps = pyramidStep?.targetReps ?? null;
  const pyramidTargetHold = pyramidStep?.targetHold ?? null;
  const pyramidVideoSrc = pyramidStep?.videoSrc ?? null;
  const pyramidImageUrl = pyramidStep?.imageUrl ?? null;

  // ── Stable utility — step resolver for arbitrary exercise + index ──────
  // Wrapped in useMemo so the reference is stable across renders, allowing
  // autoSaveTargetReps to include it in its dependency array without
  // triggering spurious re-creations.
  const resolveStepFor = useMemo(
    () => resolvePyramidStep, // stable ref to the single shared lookup
    [],
  );

  return {
    pyramidStep,
    isPyramidActive,
    pyramidName,
    pyramidTargetReps,
    pyramidTargetHold,
    pyramidVideoSrc,
    pyramidImageUrl,
    resolveStepFor,
  };
}
