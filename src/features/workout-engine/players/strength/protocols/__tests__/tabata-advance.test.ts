import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeAdvanceDecision } from '../compute-advance';
import { tabataAdvance, tabataIntervalInfo } from '../tabata.advance';
import { resolveBlockProtocol } from '../block-protocol';
import { effectiveSetsForExercise } from '../../logic/set-target.utils';
import type { AdvanceContext, AdvanceExercise } from '../advance-strategy.types';
import type { TabataProtocolConfig } from '@/features/workout-engine/core/types/protocol.types';

const ex = (id: string, over: Partial<AdvanceExercise> = {}): AdvanceExercise =>
  ({ id, name: id, sets: 3, ...over });

const CLASSIC: TabataProtocolConfig = { workSec: 20, restSec: 10, rounds: 8 };

const tabataSeg = (id: string, exercises: AdvanceExercise[], config: Partial<TabataProtocolConfig> | null = CLASSIC) =>
  ({
    id,
    exercises,
    protocol: 'tabata',
    protocolConfig: config ?? undefined,
  } as never);

const plainSeg = (id: string, exercises: AdvanceExercise[] | undefined) =>
  ({ id, exercises } as never);

const ctx = (over: Partial<AdvanceContext>): AdvanceContext => ({
  segments: [],
  currentSegmentIndex: 0,
  prevExerciseIndex: 0,
  setIdx: 0,
  log: [],
  getExercises: (s) => ((s as { exercises?: AdvanceExercise[] })?.exercises ?? null),
  getSets: effectiveSetsForExercise,
  ...over,
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('tabataIntervalInfo (weighted — unilateral costs 2)', () => {
  it('all-bilateral: prefix sums reduce to the linear index', () => {
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 0, setIdx: 0, rounds: 8 }))
      .toEqual({ intervalIndex: 0, isLastInterval: false });
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 1, setIdx: 3, rounds: 8 }))
      .toEqual({ intervalIndex: 7, isLastInterval: true });
  });

  it('handles rounds that are not a multiple of the cycle cost', () => {
    // 3 bilaterals, 8 rounds: A,B,C,A,B,C,A,B — the 8th interval is B on cycle 2
    expect(tabataIntervalInfo({ costs: [1, 1, 1], exerciseIndex: 1, setIdx: 2, rounds: 8 }))
      .toEqual({ intervalIndex: 7, isLastInterval: true });
    expect(tabataIntervalInfo({ costs: [1, 1, 1], exerciseIndex: 0, setIdx: 2, rounds: 8 }))
      .toEqual({ intervalIndex: 6, isLastInterval: false });
  });

  it('UNILATERAL member occupies two intervals (right→left)', () => {
    // [bi, uni]: cycle cost 3. Cycle 0: bi@0, uni@1-2. Cycle 2 starts at 6.
    expect(tabataIntervalInfo({ costs: [1, 2], exerciseIndex: 1, setIdx: 0, rounds: 8 }))
      .toEqual({ intervalIndex: 1, isLastInterval: false }); // completes 3/8
    expect(tabataIntervalInfo({ costs: [1, 2], exerciseIndex: 1, setIdx: 2, rounds: 8 }))
      .toEqual({ intervalIndex: 7, isLastInterval: true }); // 7 + 2 = 9 ≥ 8
    // [uni, uni]: cycle cost 4 → exactly 2 cycles of 8.
    expect(tabataIntervalInfo({ costs: [2, 2], exerciseIndex: 1, setIdx: 1, rounds: 8 }))
      .toEqual({ intervalIndex: 6, isLastInterval: true });
    expect(tabataIntervalInfo({ costs: [2, 2], exerciseIndex: 0, setIdx: 1, rounds: 8 }))
      .toEqual({ intervalIndex: 4, isLastInterval: false });
  });

  it('guards an empty cost list', () => {
    expect(tabataIntervalInfo({ costs: [], exerciseIndex: 0, setIdx: 4, rounds: 8 }))
      .toEqual({ intervalIndex: 4, isLastInterval: false });
  });
});

/**
 * 2-machine composer block, rounds=4 (machineCount × MIN_ROUNDS_PER_MACHINE =
 * 2×2 — compose-park-strength-workout.service.ts's resolveMachineAllocation).
 * The exact real-world shape from the 16.09.2026 stuck-at-00:00 / "who's
 * next" investigation: A→B→A→B, 4 total intervals. useExerciseDerivedValues'
 * nextExercise round-robin look-ahead calls this same function to decide
 * whether to advance the array index or wrap back to 0 — these four
 * assertions lock in the exact isLastInterval/index sequence it relies on.
 */
describe('tabataIntervalInfo — 2-machine composer block (rounds=4)', () => {
  it('interval 1 (A, first turn): not last', () => {
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 0, setIdx: 0, rounds: 4 }))
      .toEqual({ intervalIndex: 0, isLastInterval: false });
  });

  it('interval 2 (B, first turn): not last — this is the point where the naive index+1 walk would run off the 2-element array', () => {
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 1, setIdx: 0, rounds: 4 }))
      .toEqual({ intervalIndex: 1, isLastInterval: false });
  });

  it('interval 3 (A, second turn — the wrap-back): not last', () => {
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 0, setIdx: 1, rounds: 4 }))
      .toEqual({ intervalIndex: 2, isLastInterval: false });
  });

  it('interval 4 (B, second turn): IS last — block ends here, no trailing rest', () => {
    expect(tabataIntervalInfo({ costs: [1, 1], exerciseIndex: 1, setIdx: 1, rounds: 4 }))
      .toEqual({ intervalIndex: 3, isLastInterval: true });
  });
});

describe('tabataAdvance — round-robin head', () => {
  const A = ex('a');
  const B = ex('b');

  it('mid-cycle: next exercise, cycle counter unchanged (null)', () => {
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A, B])], prevExerciseIndex: 0, setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: null });
  });

  it('cycle end: back to first exercise, cycle +1', () => {
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A, B])], prevExerciseIndex: 1, setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 1 });
  });

  it('single exercise: every interval bumps the cycle counter', () => {
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A])], prevExerciseIndex: 0, setIdx: 5,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 6 });
  });

  it('last interval → next segment (ignores remaining cycle positions)', () => {
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A, B]), plainSeg('s1', [ex('c')])],
      prevExerciseIndex: 1, setIdx: 3, // interval 8/8
    }));
    expect(d).toEqual({ kind: 'nextSegment', segmentIndex: 1 });
  });

  it('last interval of last segment → workoutComplete', () => {
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A, B])], prevExerciseIndex: 1, setIdx: 3,
    }));
    expect(d).toEqual({ kind: 'workoutComplete' });
  });

  it('8 rounds over 3 exercises ends mid-list (A,B,C,A,B,C,A,B)', () => {
    const C = ex('c');
    const d = tabataAdvance(ctx({
      segments: [tabataSeg('t0', [A, B, C])], prevExerciseIndex: 1, setIdx: 2, // interval 8
    }));
    expect(d).toEqual({ kind: 'workoutComplete' });
  });
});

/**
 * 16.09.2026 — machine tabata block only. orderMode: 'exercise-major' is set
 * exclusively by compose-park-strength-workout.service.ts; the general
 * finisher (protocols/tabata.block.ts) never sets it, so every test above
 * this block (all omitting orderMode, defaulting to cycle-major) locks in
 * that the general-finisher/round-robin path is completely unaffected by
 * this addition — same code path, same assertions, all still passing.
 */
describe('tabataAdvance — exercise-major head (machine tabata block only)', () => {
  const A = ex('a');
  const B = ex('b');
  const exerciseMajorConfig: TabataProtocolConfig = { workSec: 30, restSec: 30, rounds: 4, orderMode: 'exercise-major' };
  const exerciseMajorSeg = (exercises: AdvanceExercise[]) => tabataSeg('t0', exercises, exerciseMajorConfig);

  it('A round 1 → A round 2 (same exercise, cycle counter bumps)', () => {
    const d = tabataAdvance(ctx({ segments: [exerciseMajorSeg([A, B])], prevExerciseIndex: 0, setIdx: 0 }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 1 });
  });

  it('A round 2 → B round 1 (A\'s rounds exhausted — advance to B, reset cycle to 0)', () => {
    const d = tabataAdvance(ctx({ segments: [exerciseMajorSeg([A, B])], prevExerciseIndex: 0, setIdx: 1 }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 0 });
  });

  it('B round 1 → B round 2 (same exercise, cycle counter bumps)', () => {
    const d = tabataAdvance(ctx({ segments: [exerciseMajorSeg([A, B])], prevExerciseIndex: 1, setIdx: 0 }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 1 });
  });

  it('B round 2 → block complete (last interval, no trailing rest — same as cycle-major)', () => {
    const d = tabataAdvance(ctx({ segments: [exerciseMajorSeg([A, B])], prevExerciseIndex: 1, setIdx: 1 }));
    expect(d).toEqual({ kind: 'workoutComplete' });
  });

  it('full A→A→B→B sequence via tabataIntervalInfo — absolute interval numbers 1,2,3,4 in that order', () => {
    const costs = [1, 1];
    const positions = [
      { exerciseIndex: 0, setIdx: 0 }, // A1
      { exerciseIndex: 0, setIdx: 1 }, // A2
      { exerciseIndex: 1, setIdx: 0 }, // B1
      { exerciseIndex: 1, setIdx: 1 }, // B2
    ];
    const indices = positions.map((p) =>
      tabataIntervalInfo({ costs, ...p, rounds: 4, orderMode: 'exercise-major' }).intervalIndex,
    );
    expect(indices).toEqual([0, 1, 2, 3]); // strictly increasing, matching temporal A,A,B,B order
  });

  it('3 machines × 2 rounds (rounds=6): A→A→B→B→C→C', () => {
    const C = ex('c');
    const config: TabataProtocolConfig = { workSec: 30, restSec: 30, rounds: 6, orderMode: 'exercise-major' };
    const seg = tabataSeg('t0', [A, B, C], config);
    expect(tabataAdvance(ctx({ segments: [seg], prevExerciseIndex: 0, setIdx: 0 })))
      .toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 1 }); // A1→A2
    expect(tabataAdvance(ctx({ segments: [seg], prevExerciseIndex: 0, setIdx: 1 })))
      .toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 0 }); // A2→B1
    expect(tabataAdvance(ctx({ segments: [seg], prevExerciseIndex: 1, setIdx: 1 })))
      .toEqual({ kind: 'goToExercise', exerciseIndex: 2, nextSetIdx: 0 }); // B2→C1
    expect(tabataAdvance(ctx({ segments: [seg], prevExerciseIndex: 2, setIdx: 1 })))
      .toEqual({ kind: 'workoutComplete' }); // C2 → done
  });
});

describe('block dispatch (compute-advance)', () => {
  it('segment.protocol=tabata routes to the tabata head, ignoring pairedWith', () => {
    // Paired exercises inside a tabata block must NOT trigger superset flow.
    const a = ex('a', { pairedWith: 'b' });
    const b = ex('b', { pairedWith: 'a' });
    const d = computeAdvanceDecision(ctx({
      segments: [tabataSeg('t0', [a, b])], prevExerciseIndex: 0, setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: null });
  });

  it('invalid protocolConfig falls back to exercise-scoped flow with a warn', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [tabataSeg('t0', [ex('a'), ex('b')], { workSec: 20 })], // missing restSec/rounds
      prevExerciseIndex: 0, setIdx: 0,
    }));
    expect(console.warn).toHaveBeenCalled();
    expect(d).toEqual({ kind: 'sameExercise', nextSetIdx: 1 }); // straight head
  });

  it('plain segments are untouched by the block layer', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [plainSeg('s0', [ex('a'), ex('b')])], setIdx: 2,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 0 });
  });
});

describe('resolveBlockProtocol', () => {
  it('returns the validated config only for a complete tabata spec', () => {
    expect(resolveBlockProtocol(tabataSeg('t', [ex('a')]) )).toEqual({ id: 'tabata', config: CLASSIC });
    expect(resolveBlockProtocol(tabataSeg('t', [ex('a')], null))).toBeNull();
    expect(resolveBlockProtocol(plainSeg('s', [ex('a')]))).toBeNull();
    expect(resolveBlockProtocol(undefined)).toBeNull();
  });

  it('accepts restSec=0 (advance-immediately blocks)', () => {
    expect(resolveBlockProtocol(tabataSeg('t', [ex('a')], { workSec: 20, restSec: 0, rounds: 8 })))
      .toEqual({ id: 'tabata', config: { workSec: 20, restSec: 0, rounds: 8 } });
  });
});
