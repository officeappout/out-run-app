'use client';

import { useCallback, useMemo } from 'react';

/**
 * useSupersetPredicates — read-only superset state predicates (Step SM-2).
 *
 * Derives four values that describe the current exercise's position within a
 * superset pair.  All outputs are pure reads — no cursor mutation, no log
 * writes, no effects.  The A→B→A round-robin advancement logic inside
 * `moveToNext` is intentionally NOT moved here (it touches multiple React
 * state setters and must remain in the orchestrator).
 *
 * Outputs:
 *   • `isSupersetActive`       — true when `activeExercise.pairedWith` is set
 *   • `supersetPartnerName`    — display name of the paired exercise, or null
 *   • `isNextPartnerExercise`  — true when the current exercise is "A" (partner
 *                                appears at a higher segment index → micro-rest
 *                                fires next, full rest follows B's completion)
 *   • `computeEffectiveRestTime(segmentRestTime)` — returns `SUPERSET_TRANSITION_REST`
 *                                when moving A→B, otherwise `segmentRestTime`.
 *                                Accepts `segmentRestTime` as a parameter so
 *                                the hook itself doesn't need it as a reactive
 *                                input (avoids ordering issues with the memo
 *                                that derives it).
 *
 * Extracted from useWorkoutStateMachine.ts (Refactoring Step SM-2).
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Micro-rest duration (seconds) between Exercise A and Exercise B in a
 * superset pair.  The prime mover is still warm when moving to the antagonist,
 * so a short countdown is enough to reposition mentally.  The full
 * `segmentRestTime` fires only after B completes (end of the round).
 *
 * Exported so `handleRepetitionSave` in the orchestrator can log the value
 * without needing to import it from a separate constants file.
 */
export const SUPERSET_TRANSITION_REST = 10;

// ============================================================================
// TYPES
// ============================================================================

export interface SupersetPredicatesInput {
  /** Active exercise, or null when none is loaded yet. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeExercise: any; // WorkoutExercise | null
  /** Current workout segment (`workout.segments[currentSegmentIndex]`). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentSegment: any; // WorkoutSegment | undefined
  /** 0-based index of the currently active exercise within the segment. */
  currentExerciseIndex: number;
  /**
   * Stable callback that extracts the exercise array from an arbitrary segment
   * (handles the multiple field-name variants used across workout sources).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getExercises: (segment: any) => any[] | null;
}

export interface SupersetPredicatesResult {
  /** True when `activeExercise.pairedWith` is set to a valid exercise id. */
  isSupersetActive: boolean;
  /** Display name of the paired exercise (superset partner), or null. */
  supersetPartnerName: string | null;
  /**
   * True when the current exercise is "A" in a superset pair — i.e. the
   * partner exercise appears at a HIGHER index in the segment array.
   * False when we are B (full recovery rest precedes the return to A).
   */
  isNextPartnerExercise: boolean;
  /**
   * Computes the effective rest duration for the just-completed set.
   *
   *   A→B transition (partner index > current index) → SUPERSET_TRANSITION_REST (10 s)
   *   Everything else (solo straight set, B→A round close) → `segmentRestTime`
   *
   * `segmentRestTime` is passed as an argument rather than a hook input so
   * the hook can be invoked before `segmentRestTime` is memoised — avoiding
   * hook-declaration ordering issues in the orchestrator.
   */
  computeEffectiveRestTime: (segmentRestTime: number) => number;
}

// ============================================================================
// HOOK
// ============================================================================

export function useSupersetPredicates({
  activeExercise,
  currentSegment,
  currentExerciseIndex,
  getExercises,
}: SupersetPredicatesInput): SupersetPredicatesResult {
  // ── Is there a paired exercise at all? ──────────────────────────────────
  const isSupersetActive = useMemo(() => {
    if (!activeExercise) return false;
    return !!(activeExercise as any)?.pairedWith;
  }, [activeExercise]);

  // ── Display name of the partner (for the rest-screen partner preview) ───
  const supersetPartnerName = useMemo(() => {
    if (!isSupersetActive || !activeExercise) return null;
    const pairedId = (activeExercise as any)?.pairedWith as string;
    const exercises = getExercises(currentSegment);
    const partner = exercises?.find((e: any) => e.id === pairedId);
    return (partner as any)?.name || null;
  }, [isSupersetActive, activeExercise, currentSegment, getExercises]);

  // ── Are we exercise "A" (partner appears later → micro-rest next)? ──────
  const isNextPartnerExercise = useMemo(() => {
    if (!isSupersetActive || !activeExercise) return false;
    const pairedId = (activeExercise as any)?.pairedWith as string;
    const exercises = getExercises(currentSegment);
    if (!exercises) return false;
    const pairedIdx = exercises.findIndex((e: any) => e.id === pairedId);
    return pairedIdx > currentExerciseIndex;
  }, [isSupersetActive, activeExercise, currentSegment, getExercises, currentExerciseIndex]);

  // ── Effective rest time factory ──────────────────────────────────────────
  // Mirrors the physiology used in `handleRepetitionSave` so the
  // FillingButton / IsometricTimerCard CTA produces the same countdown as
  // a manual drawer save.
  //
  // NOTE: `segmentRestTime` is intentionally a parameter, not a hook input.
  // This lets the hook be declared before `segmentRestTime` is memoised in
  // the orchestrator without violating Rules of Hooks ordering.
  const computeEffectiveRestTime = useCallback(
    (segmentRestTime: number): number => {
      if (!activeExercise) return segmentRestTime;
      const exercises = getExercises(currentSegment);
      const pairedId = (activeExercise as any)?.pairedWith as string | null | undefined;
      if (pairedId && exercises) {
        const pairedIdx = exercises.findIndex((e: any) => e.id === pairedId);
        const isAtoB = pairedIdx > currentExerciseIndex;
        if (isAtoB) return SUPERSET_TRANSITION_REST;
      }
      return segmentRestTime;
    },
    [activeExercise, currentSegment, getExercises, currentExerciseIndex],
  );

  return {
    isSupersetActive,
    supersetPartnerName,
    isNextPartnerExercise,
    computeEffectiveRestTime,
  };
}
