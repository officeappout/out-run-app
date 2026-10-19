import { describe, it, expect } from 'vitest';
import { capMainSets, mainWorkSets } from '../cap-sets';
import type { WorkoutExercise } from '../../logic/workout-generator.types';

const ex = (id: string, sets: number, extra: Partial<WorkoutExercise> = {}) =>
  ({ exercise: { id }, sets, reps: 10, exerciseRole: 'main', ...extra } as unknown as WorkoutExercise);

describe('capMainSets', () => {
  it('trims the biggest exercises first, floor 2, never drops an exercise', () => {
    const out = capMainSets([ex('a', 4), ex('b', 4), ex('c', 3), ex('d', 3)], 8);
    expect(mainWorkSets(out)).toBe(8);
    expect(out.map((e) => e.sets)).toEqual([2, 2, 2, 2]);
  });
  it('goes to 1 per exercise only when 2 each is still over the cap', () => {
    const out = capMainSets([ex('a', 3), ex('b', 3), ex('c', 3), ex('d', 3), ex('e', 3)], 6);
    expect(out).toHaveLength(5);
    expect(mainWorkSets(out)).toBe(6);
    expect(Math.min(...out.map((e) => e.sets))).toBeGreaterThanOrEqual(1);
  });
  it('keeps warm-up, cool-down, tabata and pyramid structure untouched', () => {
    const input = [
      ex('w', 2, { exerciseRole: 'warmup' }), ex('t', 8, { protocolBlock: 'tabata' }),
      ex('p', 4, { pyramidSequence: [{} as never] }), ex('m', 5), ex('c', 2, { exerciseRole: 'cooldown' }),
    ];
    const out = capMainSets(input, 6);
    expect(out.find((e) => e.exercise.id === 'w')!.sets).toBe(2);
    expect(out.find((e) => e.exercise.id === 't')!.sets).toBe(8);
    expect(out.find((e) => e.exercise.id === 'p')!.sets).toBe(4);
    expect(out.find((e) => e.exercise.id === 'c')!.sets).toBe(2);
    expect(out.find((e) => e.exercise.id === 'm')!.sets).toBe(2); // tabata is timed, not counted: 4 + 2 = 6
  });
  it('a superset pair loses sets together', () => {
    const out = capMainSets([ex('a', 4, { pairedWith: 'b' }), ex('b', 4, { pairedWith: 'a' }), ex('c', 2)], 6);
    expect(out[0].sets).toBe(out[1].sets);
    expect(mainWorkSets(out)).toBeLessThanOrEqual(6);
  });
  it('under the cap → same sets, new objects (input not mutated)', () => {
    const input = [ex('a', 3)];
    const out = capMainSets(input, 8);
    expect(out[0].sets).toBe(3);
    expect(out[0]).not.toBe(input[0]);
    capMainSets([ex('x', 5)], 2);
    expect(input[0].sets).toBe(3);
  });
});
