import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flattenWorkoutToExercises } from '../grouping.utils';
import type { WorkoutPlan } from '@/features/parks';

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const ex = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, name: id, sets: 1, reps: '20', exerciseType: 'time', isTimeBased: true, ...over } as any);

const plan = (segments: unknown[]): WorkoutPlan => ({ segments } as never) as WorkoutPlan;

describe('flattenWorkoutToExercises — tabata sets override (19.09.2026 list-card fix)', () => {
  it('machine tabata (2 bilateral members, rounds=4): each member shows sets=2, not the hardcoded 1', () => {
    const machineSeg = {
      id: 'seg-tabata',
      title: 'טבטה',
      protocol: 'tabata',
      protocolConfig: { workSec: 20, restSec: 10, rounds: 4 },
      exercises: [ex('machine-a'), ex('machine-b')],
    };
    const flat = flattenWorkoutToExercises(plan([machineSeg]));
    expect(flat).toHaveLength(2);
    expect(flat.map((fe) => fe.sets)).toEqual([2, 2]);
    // The generator's own hardcoded sets:1 is untouched on the raw exercise —
    // only the FlatExercise-level display value changes.
    expect(flat.map((fe) => (fe.exercise as any).sets)).toEqual([1, 1]);
  });

  it('general-finisher tabata (4 bilateral members, rounds=8): each member shows sets=2', () => {
    const finisherSeg = {
      id: 'seg-tabata',
      title: 'טבטה',
      protocol: 'tabata',
      protocolConfig: { workSec: 20, restSec: 10, rounds: 8 },
      exercises: [ex('core-a'), ex('core-b'), ex('core-c'), ex('core-d')],
    };
    const flat = flattenWorkoutToExercises(plan([finisherSeg]));
    expect(flat.map((fe) => fe.sets)).toEqual([2, 2, 2, 2]);
  });

  it('unilateral member costs 2 rounds — mixed bilateral/unilateral block still divides correctly', () => {
    // cycleCost = 1 (bilateral) + 2 (unilateral) = 3; rounds=6 → roundsPerMember = round(6/3) = 2
    const mixedSeg = {
      id: 'seg-tabata',
      title: 'טבטה',
      protocol: 'tabata',
      protocolConfig: { workSec: 20, restSec: 10, rounds: 6 },
      exercises: [ex('bilateral-a'), ex('unilateral-b', { symmetry: 'unilateral' })],
    };
    const flat = flattenWorkoutToExercises(plan([mixedSeg]));
    expect(flat.map((fe) => fe.sets)).toEqual([2, 2]);
  });

  it('non-tabata segment is untouched — regular exercise keeps its real sets value', () => {
    const straightSeg = {
      id: 'seg-main',
      title: 'רגיל',
      exercises: [ex('squat', { sets: 3, isTimeBased: false, exerciseType: 'reps' })],
    };
    const flat = flattenWorkoutToExercises(plan([straightSeg]));
    expect(flat[0].sets).toBe(3);
  });

  it('non-tabata segment with a pyramidSequence is untouched — keeps sequence-length override', () => {
    const pyramidSeg = {
      id: 'seg-main',
      title: 'פירמידה',
      exercises: [ex('pushup', { sets: 1, pyramidSequence: [{ targetReps: 12 }, { targetReps: 10 }, { targetReps: 8 }] })],
    };
    const flat = flattenWorkoutToExercises(plan([pyramidSeg]));
    expect(flat[0].sets).toBe(3);
  });

  it('protocol="tabata" with an invalid protocolConfig safely degrades to the pre-existing sets logic (matches resolveBlockProtocol\'s own fallback)', () => {
    const brokenSeg = {
      id: 'seg-tabata',
      title: 'טבטה',
      protocol: 'tabata',
      protocolConfig: { workSec: 20, restSec: 10 }, // missing rounds — invalid
      exercises: [ex('machine-a', { sets: 1 })],
    };
    const flat = flattenWorkoutToExercises(plan([brokenSeg]));
    expect(flat[0].sets).toBe(1);
  });
});
