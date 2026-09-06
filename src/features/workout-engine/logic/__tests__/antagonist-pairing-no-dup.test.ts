import { describe, it, expect } from 'vitest';
import { applyAntagonistPairing } from '../workout-sorting.utils';
import type { WorkoutExercise } from '../workout-generator.types';

/**
 * 03-CHANGES.md Addendum 27 (06.09.2026, David's report): the same exercise
 * rendered twice in one workout, same id, byte-identical reasoning — 100%
 * reproducible on D1/L12 full-body. Root-caused live: when at least one real
 * push+pull pair forms (pairCount > 0) but a leftover unpaired exercise AND
 * a non-empty `other` (core/isolation) bucket both exist, `other` got merged
 * into `pushPullPairs` (the "remaining" fallback) AND separately re-spread
 * via `...other` in the final result assembly — double-inclusion, not two
 * independent selections.
 */
function makeEx(id: string, movementGroup: string, overrides: Partial<any> = {}): WorkoutExercise {
  return {
    exercise: {
      id,
      name: { he: id, en: id },
      movementGroup,
      targetPrograms: overrides.targetPrograms ?? [{ programId: movementGroup, level: 5 }],
    },
    exerciseRole: 'main',
    method: 'bodyweight',
    mechanicalType: 'none',
    sets: 3,
    reps: 10,
    isTimeBased: false,
    restSeconds: 90,
    priority: 'foundation',
    score: 10,
    reasoning: [],
    programLevel: 5,
    ...overrides,
  } as any;
}

describe('applyAntagonistPairing — no double-inclusion when pairCount > 0 with leftovers', () => {
  it('never renders the same exercise id twice: 1 pair forms, 1 leftover push, 1 core (other)', () => {
    const push1 = makeEx('push-1', 'horizontal_push');
    const push2 = makeEx('push-2', 'horizontal_push'); // leftover, unpaired
    const pull1 = makeEx('pull-1', 'horizontal_pull');
    const core1 = makeEx('core-1', 'core');

    const result = applyAntagonistPairing([push1, push2, pull1, core1]);

    const ids = result.map(e => e.exercise.id);
    const counts: Record<string, number> = {};
    for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;

    expect(counts['core-1']).toBe(1);
    expect(counts['push-1']).toBe(1);
    expect(counts['push-2']).toBe(1);
    expect(counts['pull-1']).toBe(1);
    expect(result).toHaveLength(4);
  });

  it('still includes every exercise (no silent drop) across a bigger multi-domain mix', () => {
    const exercises = [
      makeEx('push-1', 'horizontal_push'),
      makeEx('push-2', 'horizontal_push'),
      makeEx('push-3', 'vertical_push'),
      makeEx('pull-1', 'horizontal_pull'),
      makeEx('legs-1', 'squat'),
      makeEx('legs-2', 'hinge', { exercise: { id: 'legs-2', name: { he: 'legs-2' }, movementGroup: 'hinge', targetPrograms: [{ programId: 'legs', level: 5 }], primaryMuscle: 'hamstrings' } }),
      makeEx('core-1', 'core'),
      makeEx('core-2', 'core'),
    ];
    const result = applyAntagonistPairing(exercises);
    const ids = result.map(e => e.exercise.id).sort();
    expect(ids).toEqual(['core-1', 'core-2', 'legs-1', 'legs-2', 'pull-1', 'push-1', 'push-2', 'push-3']);
    expect(result).toHaveLength(8);
  });
});
