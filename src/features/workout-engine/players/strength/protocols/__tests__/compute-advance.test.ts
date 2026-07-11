import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { computeAdvanceDecision, findNextValidSegment } from '../compute-advance';
import { inferSegmentProtocol, resolveExerciseProtocol } from '../advance-registry';
import { effectiveSetsForExercise } from '../../logic/set-target.utils';
import type { AdvanceContext, AdvanceExercise } from '../advance-strategy.types';

/**
 * CHARACTERIZATION TESTS (Stage 1a) — these lock the advance behavior of the
 * pre-extraction moveToNext monolith. They were written against the verbatim
 * extraction and MUST keep passing through Stage 1b (strategy split) and
 * beyond. A failing test here means a behavior change, not a refactor.
 */

const ex = (id: string, over: Partial<AdvanceExercise> = {}): AdvanceExercise =>
  ({ id, name: id, sets: 3, ...over });

const seg = (id: string, exercises: AdvanceExercise[] | undefined) =>
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

describe('computeAdvanceDecision — characterization', () => {
  it('1. straight: mid-sets → sameExercise with setIdx+1', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [ex('a'), ex('b')])], setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'sameExercise', nextSetIdx: 1 });
  });

  it('2. straight: last set → next exercise with set reset', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [ex('a'), ex('b')])], setIdx: 2,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 0 });
  });

  it('3. last exercise done → skips EMPTY segments to the next valid one', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [ex('a')]), seg('empty', []), seg('s2', [ex('c')])],
      prevExerciseIndex: 0, setIdx: 2,
    }));
    expect(d).toEqual({ kind: 'nextSegment', segmentIndex: 2 });
  });

  it('4. last exercise of last segment → workoutComplete', () => {
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [ex('a')])], setIdx: 2,
    }));
    expect(d).toEqual({ kind: 'workoutComplete' });
  });

  it('5. superset A→B: jump to partner, round counter UNCHANGED (null)', () => {
    const a = ex('a', { pairedWith: 'b' });
    const b = ex('b', { pairedWith: 'a' });
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [a, b])], prevExerciseIndex: 0, setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: null });
  });

  it('6. superset B→A: back to first partner with round increment', () => {
    const a = ex('a', { pairedWith: 'b' });
    const b = ex('b', { pairedWith: 'a' });
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [a, b])], prevExerciseIndex: 1, setIdx: 0,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 1 });
  });

  it('7. pair complete → sandwich scan picks the incomplete STANDALONE, set reset', () => {
    // Layout [A@0, standalone@1, B@2]; standalone has no logged sets.
    const a = ex('a', { pairedWith: 'b' });
    const solo = ex('solo');
    const b = ex('b', { pairedWith: 'a' });
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [a, solo, b])], prevExerciseIndex: 2, setIdx: 2, // last round done
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 1, nextSetIdx: 0 });
  });

  it('8. pair complete + everything logged → next segment', () => {
    const a = ex('a', { pairedWith: 'b' });
    const solo = ex('solo');
    const b = ex('b', { pairedWith: 'a' });
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [a, solo, b]), seg('s1', [ex('c')])],
      prevExerciseIndex: 2, setIdx: 2,
      log: [{ exerciseId: 'solo', segmentId: 's0', confirmedReps: [8, 8, 8] }],
    }));
    expect(d).toEqual({ kind: 'nextSegment', segmentIndex: 1 });
  });

  it('9. missing partner → warns and falls back to straight-sets flow', () => {
    const orphan = ex('a', { pairedWith: 'ghost' });
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [orphan, ex('b')])], setIdx: 0,
    }));
    expect(console.warn).toHaveBeenCalled();
    expect(d).toEqual({ kind: 'sameExercise', nextSetIdx: 1 });
  });

  it('10. pyramid rides the straight path with effectiveSets = sequence length', () => {
    const pyramid = ex('p', {
      sets: 3, // desynced on purpose — sequence (5) must win (Stage 0 guard)
      pyramidSequence: [{}, {}, {}, {}, {}],
    });
    // set 3 of 5 → still sameExercise (old code with sets=3 would have moved on)
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [pyramid])], setIdx: 3,
    }));
    expect(d).toEqual({ kind: 'sameExercise', nextSetIdx: 4 });
    // set 5 of 5 → workout complete
    const done = computeAdvanceDecision(ctx({
      segments: [seg('s0', [pyramid])], setIdx: 4,
    }));
    expect(done).toEqual({ kind: 'workoutComplete' });
  });

  it('superset round count equalizes to max(A.sets, B.sets)', () => {
    const a = ex('a', { pairedWith: 'b', sets: 2 });
    const b = ex('b', { pairedWith: 'a', sets: 4 });
    // B at round 3 (setIdx 2) of effective 4 → still more rounds
    const d = computeAdvanceDecision(ctx({
      segments: [seg('s0', [a, b])], prevExerciseIndex: 1, setIdx: 2,
    }));
    expect(d).toEqual({ kind: 'goToExercise', exerciseIndex: 0, nextSetIdx: 3 });
  });
});

describe('protocol resolution (Stage 1b/1c)', () => {
  it('resolveExerciseProtocol: legacy per-exercise derivation', () => {
    expect(resolveExerciseProtocol(ex('a', { pairedWith: 'b' }))).toBe('superset');
    expect(resolveExerciseProtocol(ex('p', { pyramidSequence: [{}] }))).toBe('pyramid');
    expect(resolveExerciseProtocol(ex('s'))).toBe('straight');
    expect(resolveExerciseProtocol(undefined)).toBe('straight');
  });

  it('inferSegmentProtocol: segment label = dominant shape, mixed → straight', () => {
    const a = ex('a', { pairedWith: 'b' });
    const b = ex('b', { pairedWith: 'a' });
    const p = ex('p', { pyramidSequence: [{}, {}] });
    const s = ex('s');
    expect(inferSegmentProtocol([a, b])).toBe('superset');
    expect(inferSegmentProtocol([p])).toBe('pyramid');
    expect(inferSegmentProtocol([a, s, b])).toBe('straight'); // mixed — metadata only
    expect(inferSegmentProtocol([])).toBe('straight');
    expect(inferSegmentProtocol(undefined)).toBe('straight');
  });
});

describe('findNextValidSegment', () => {
  it('skips exercise-less segments (incl. future aerobic segments)', () => {
    const segments = [seg('s0', [ex('a')]), seg('aerobic', undefined), seg('s2', [ex('c')])];
    expect(findNextValidSegment(segments as never, 1, (s) => (s as { exercises?: AdvanceExercise[] })?.exercises ?? null)).toBe(2);
    expect(findNextValidSegment(segments as never, 3, () => null)).toBeNull();
  });
});
