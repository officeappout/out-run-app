/**
 * tabata.advance — the first BLOCK-SCOPED advance head
 * (protocol-blocks Stage 2, 11.07.2026).
 *
 * Round-robin over the segment's exercises, one work interval each, until
 * config.rounds work intervals are done → shared segment chain. The clock
 * (workSec/restSec) is NOT here — heads are pure decision functions; the
 * state machine runs the timers (IsometricTimerCard for work, the existing
 * RESTING countdown for rest) and calls moveToNext at each transition.
 *
 * Index mapping onto the existing machine:
 *   currentExerciseIndex = position in the round-robin cycle
 *   currentSetIndex      = which pass over the exercise list (cycle counter)
 *   completed intervals  = setIdx * numExercises + exerciseIndex + 1
 */
import type { AdvanceContext, AdvanceDecision, AdvanceStrategy } from './advance-strategy.types';
import { advanceOutOfSegment } from './segment-chain';
import { resolveBlockProtocol } from './block-protocol';
import { tabataIntervalCost } from '@/features/workout-engine/logic/protocols/tabata.constants';

export interface TabataIntervalInfo {
  /** 0-based index of the FIRST interval of this exercise visit. */
  intervalIndex: number;
  /** True when this visit finishes the block — no trailing rest after it. */
  isLastInterval: boolean;
}

/** Per-exercise interval costs (unilateral = 2: right→left consecutive). */
export function tabataMemberCosts(
  exercises: ReadonlyArray<{ symmetry?: string | null } | Record<string, unknown>>,
): number[] {
  return exercises.map((ex) =>
    tabataIntervalCost(
      ((ex as { symmetry?: string })?.symmetry ??
        (ex as { exercise?: { symmetry?: string } })?.exercise?.symmetry) as string | undefined,
    ),
  );
}

/**
 * How many rounds each member gets in 'exercise-major' mode — the block's
 * `rounds` split evenly across the cycle (machine tabata is always
 * all-bilateral + uniform: rounds = machineCount × MIN_ROUNDS_PER_MACHINE,
 * so this divides exactly). Shared by tabataIntervalInfo and tabataAdvance
 * so the two can never disagree on where one member's block of rounds ends
 * and the next begins.
 */
export function tabataRoundsPerMember(rounds: number, costs: number[]): number {
  const cycleCost = costs.reduce((s, c) => s + c, 0) || 1;
  return Math.max(1, Math.round(rounds / cycleCost));
}

/**
 * Pure WEIGHTED interval arithmetic — used by the head AND the state
 * machine. A unilateral member consumes 2 of the block's `rounds`
 * (David's rule 12.07.2026), so positions are prefix sums of the member
 * costs, not a linear index.
 *
 * orderMode (16.09.2026): absent/'cycle-major' (default) is the ORIGINAL,
 * unchanged formula — round-robin, A→B→A→B (the general-finisher tabata's
 * behavior, never touched by this addition). 'exercise-major' — set ONLY by
 * the machine/park tabata composer — numbers intervals A→A→B→B instead: all
 * of one member's rounds consecutively before the next. isLastInterval is
 * correct under EITHER formula for the true final pair (exercises.length-1,
 * roundsPerMember-1) — both always resolve its intervalIndex to
 * `rounds - 1`, since every valid ordering visits all `rounds` positions
 * exactly once — so no separate isLastInterval logic is needed per mode.
 */
export function tabataIntervalInfo(args: {
  costs: number[];
  exerciseIndex: number;
  setIdx: number;
  rounds: number;
  orderMode?: 'cycle-major' | 'exercise-major';
}): TabataIntervalInfo {
  const costs = args.costs.length > 0 ? args.costs : [1];
  const cycleCost = costs.reduce((s, c) => s + c, 0);
  const intervalIndex = args.orderMode === 'exercise-major'
    ? args.exerciseIndex * tabataRoundsPerMember(args.rounds, costs) + args.setIdx
    : args.setIdx * cycleCost + costs.slice(0, args.exerciseIndex).reduce((s, c) => s + c, 0);
  const completedAfterVisit = intervalIndex + (costs[args.exerciseIndex] ?? 1);
  return {
    intervalIndex,
    isLastInterval: completedAfterVisit >= args.rounds,
  };
}

export const tabataAdvance: AdvanceStrategy = (ctx): AdvanceDecision => {
  const { segments, currentSegmentIndex, prevExerciseIndex, setIdx, getExercises } = ctx;

  const currentSeg = segments[currentSegmentIndex];
  const exercises = getExercises(currentSeg);
  if (!exercises || exercises.length === 0) return advanceOutOfSegment(ctx);

  const block = resolveBlockProtocol(currentSeg);
  if (!block) {
    // Defensive: dispatch should never route here without a valid config.
    console.warn('[Engine][Tabata] head invoked without valid config — leaving segment');
    return advanceOutOfSegment(ctx);
  }

  const orderMode = block.config.orderMode ?? 'cycle-major';
  const costs = tabataMemberCosts(exercises);
  const { isLastInterval, intervalIndex } = tabataIntervalInfo({
    costs,
    exerciseIndex: prevExerciseIndex,
    setIdx,
    rounds: block.config.rounds,
    orderMode,
  });

  console.log(
    `[Engine][Tabata] interval ${intervalIndex + 1}/${block.config.rounds} done ` +
    `(ex[${prevExerciseIndex}]="${exercises[prevExerciseIndex]?.name}", cycle ${setIdx + 1})`,
  );

  if (isLastInterval) {
    return advanceOutOfSegment(ctx);
  }

  // ── Exercise-major (machine tabata block only) ──────────────────────────
  // All of this member's rounds before moving to the next — the opposite
  // structure from cycle-major below. Never taken for the general finisher,
  // which never sets orderMode.
  if (orderMode === 'exercise-major') {
    const roundsPerMember = tabataRoundsPerMember(block.config.rounds, costs);
    if (setIdx + 1 < roundsPerMember) {
      // More rounds left on the SAME member — stay put, bump the cycle counter.
      return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex, nextSetIdx: setIdx + 1 };
    }
    // This member is done — move to the next one, reset its cycle counter.
    return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex + 1, nextSetIdx: 0 };
  }

  if (prevExerciseIndex < exercises.length - 1) {
    // Next exercise in the cycle — cycle counter unchanged.
    return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex + 1, nextSetIdx: null };
  }

  // Cycle complete — back to the first exercise, next pass.
  return { kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: setIdx + 1 };
};
