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
 * Pure WEIGHTED interval arithmetic — used by the head AND the state
 * machine. A unilateral member consumes 2 of the block's `rounds`
 * (David's rule 12.07.2026), so positions are prefix sums of the member
 * costs, not a linear index.
 */
export function tabataIntervalInfo(args: {
  costs: number[];
  exerciseIndex: number;
  setIdx: number;
  rounds: number;
}): TabataIntervalInfo {
  const costs = args.costs.length > 0 ? args.costs : [1];
  const cycleCost = costs.reduce((s, c) => s + c, 0);
  const prefix = costs.slice(0, args.exerciseIndex).reduce((s, c) => s + c, 0);
  const intervalIndex = args.setIdx * cycleCost + prefix;
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

  const { isLastInterval, intervalIndex } = tabataIntervalInfo({
    costs: tabataMemberCosts(exercises),
    exerciseIndex: prevExerciseIndex,
    setIdx,
    rounds: block.config.rounds,
  });

  console.log(
    `[Engine][Tabata] interval ${intervalIndex + 1}/${block.config.rounds} done ` +
    `(ex[${prevExerciseIndex}]="${exercises[prevExerciseIndex]?.name}", cycle ${setIdx + 1})`,
  );

  if (isLastInterval) {
    return advanceOutOfSegment(ctx);
  }

  if (prevExerciseIndex < exercises.length - 1) {
    // Next exercise in the cycle — cycle counter unchanged.
    return { kind: 'goToExercise', exerciseIndex: prevExerciseIndex + 1, nextSetIdx: null };
  }

  // Cycle complete — back to the first exercise, next pass.
  return { kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: setIdx + 1 };
};
