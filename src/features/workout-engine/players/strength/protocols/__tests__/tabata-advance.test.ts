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

describe('tabataIntervalInfo', () => {
  it('maps [cycle, exerciseIndex] to a linear interval index', () => {
    expect(tabataIntervalInfo({ numExercises: 2, exerciseIndex: 0, setIdx: 0, rounds: 8 }))
      .toEqual({ intervalIndex: 0, isLastInterval: false });
    expect(tabataIntervalInfo({ numExercises: 2, exerciseIndex: 1, setIdx: 3, rounds: 8 }))
      .toEqual({ intervalIndex: 7, isLastInterval: true });
  });

  it('handles rounds that are not a multiple of the exercise count', () => {
    // 3 exercises, 8 rounds: A,B,C,A,B,C,A,B — the 8th interval is B on cycle 2
    expect(tabataIntervalInfo({ numExercises: 3, exerciseIndex: 1, setIdx: 2, rounds: 8 }))
      .toEqual({ intervalIndex: 7, isLastInterval: true });
    expect(tabataIntervalInfo({ numExercises: 3, exerciseIndex: 0, setIdx: 2, rounds: 8 }))
      .toEqual({ intervalIndex: 6, isLastInterval: false });
  });

  it('guards a zero exercise count', () => {
    expect(tabataIntervalInfo({ numExercises: 0, exerciseIndex: 0, setIdx: 4, rounds: 8 }))
      .toEqual({ intervalIndex: 4, isLastInterval: false });
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
