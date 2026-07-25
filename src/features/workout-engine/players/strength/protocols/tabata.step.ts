/**
 * tabata.step — the pure work→rest→advance decision for a tabata work interval
 * (protocol-blocks, extracted from useWorkoutStateMachine.handleExerciseComplete).
 *
 * The live handler owns the side effects (setState / refs / timers / logging);
 * this function owns the DECISION and nothing else, so the loop is unit-testable
 * headlessly (no React, no jsdom). Same split the advance layer already uses
 * (computeAdvanceDecision). Behaviour is 1:1 with the pre-extraction branch:
 *
 *   • unilateral RIGHT side done → defer the log, go to the LEFT side of the
 *     same exercise, with a clocked side-rest when restSec>0 (else immediate);
 *   • LEFT side (unilateral) or a bilateral member done → log both/one side,
 *     then advance immediately on the last interval / restSec≤0, otherwise a
 *     clocked rest before the round-robin advance.
 */
import { tabataIntervalInfo } from './tabata.advance';

export interface TabataStepInput {
  /** Elapsed seconds handed up by the timer card (undefined = fall back to workSec). */
  reps: number | undefined;
  /** Whether the active member is a unilateral (two-interval) exercise. */
  isUnilateral: boolean;
  /** Active side for a unilateral member ('right' → 'left'), else null. */
  currentSide: 'right' | 'left' | null;
  /** Right-side elapsed stashed when the right interval finished (null before it). */
  pendingRightElapsed: number | null;
  /** 'time' logs real elapsed; anything else logs the per-set target (undefined here). */
  exerciseType: string;
  config: { workSec: number; restSec: number; rounds: number };
  /** Per-member interval costs (uni=2, bi=1) — from tabataMemberCosts(exercises). */
  memberCosts: number[];
  /** Round-robin position of the active member. */
  exerciseIndex: number;
  /** Cycle counter (pass over the member list). */
  setIdx: number;
}

export type TabataStepDecision =
  | {
      /** Unilateral right side done — go to the left side of the SAME exercise. */
      kind: 'sideTransition';
      /** Value to stash as pendingRightElapsed for the paired log. */
      storeRightElapsed: number;
      /** Clocked side-rest seconds, or null to start the left side immediately. */
      sideRestSec: number | null;
    }
  | {
      /** Member fully done (bilateral, or unilateral left) — log then continue. */
      kind: 'logAndContinue';
      /** Args for autoSaveTargetReps(targetReps, sideData). */
      log: {
        targetReps: number | undefined;
        sideData: { right: number; left: number } | undefined;
      };
      /** True when this interval closes the block (no trailing rest). */
      isLastInterval: boolean;
      /** 'advance' = moveToNext now; 'rest' = clocked rest, then moveToNext. */
      next: { kind: 'advance' } | { kind: 'rest'; restSec: number };
    };

export function computeTabataStep(input: TabataStepInput): TabataStepDecision {
  const {
    reps, isUnilateral, currentSide, pendingRightElapsed,
    exerciseType, config, memberCosts, exerciseIndex, setIdx,
  } = input;

  // ── Unilateral RIGHT → defer log, hand off to the LEFT side ────────────
  if (isUnilateral && currentSide === 'right') {
    return {
      kind: 'sideTransition',
      storeRightElapsed: reps ?? config.workSec,
      sideRestSec: config.restSec > 0 ? config.restSec : null,
    };
  }

  // ── LEFT side (unilateral) or a bilateral member → log both/one side ───
  const sideData =
    isUnilateral && currentSide === 'left'
      ? {
          right: pendingRightElapsed ?? config.workSec,
          left: reps ?? config.workSec,
        }
      : undefined;

  const targetReps =
    exerciseType === 'time'
      ? (sideData ? Math.min(sideData.right, sideData.left) : reps)
      : undefined;

  const { isLastInterval } = tabataIntervalInfo({
    costs: memberCosts,
    exerciseIndex,
    setIdx,
    rounds: config.rounds,
  });

  const next: { kind: 'advance' } | { kind: 'rest'; restSec: number } =
    isLastInterval || config.restSec <= 0
      ? { kind: 'advance' }
      : { kind: 'rest', restSec: config.restSec };

  return { kind: 'logAndContinue', log: { targetReps, sideData }, isLastInterval, next };
}
