import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { deriveSwappedEntry } from '../derive-swapped-entry.util';
import { formatRepRange } from '@/features/workout-engine/core/presentation/PresentationFormatter';
import type { WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import type { Exercise, ExecutionMethod } from '@/features/content/exercises';

/**
 * Phone test AB3 (28.10): swapping a reps exercise for a hold kept "חזרות" and the old target.
 * The card prefers the engine's precomputed formattedRepRange, which the swap copied from the
 * old entry. Now a reps↔hold swap takes the new exercise's own prescription and the string is
 * rebuilt from it, both ways.
 */
const ex = (id: string, type: 'reps' | 'time', level = 3, extra: Partial<Exercise> = {}) =>
  ({ id, name: { he: id }, type, movementGroup: type === 'time' ? 'core' : 'horizontal_push', targetPrograms: [{ programId: 'p', level }], ...extra }) as unknown as Exercise;
const method = { location: 'home' } as unknown as ExecutionMethod;

const entry = (exercise: Exercise, isTimeBased: boolean, reps: number, range: { min: number; max: number }): WorkoutExercise => {
  const we = { exercise, method, sets: 3, reps, repsRange: range, isTimeBased, restSeconds: 60, priority: 'compound', score: 1, reasoning: [], levelDelta: 0 } as unknown as WorkoutExercise;
  return { ...we, formattedRepRange: formatRepRange(we) };
};

describe('deriveSwappedEntry, reps ↔ hold (AB3)', () => {
  it('reps → hold: seconds, the hold prescription, label in seconds', () => {
    const old = entry(ex('pushup', 'reps'), false, 10, { min: 8, max: 12 });
    expect(old.formattedRepRange).toContain('חזרות');
    const next = deriveSwappedEntry(old, ex('plank', 'time'), method, 2);
    expect(next.isTimeBased).toBe(true);
    expect(next.formattedRepRange).toContain('שניות');
    expect(next.formattedRepRange).not.toContain('חזרות');
    expect(next.reps).toBeGreaterThanOrEqual(5);
    expect(next.reps).toBeLessThanOrEqual(120);
    expect(next.repsRange).not.toEqual({ min: 8, max: 12 });
  });

  it('hold → reps: reps prescription, label in reps', () => {
    const old = entry(ex('plank', 'time'), true, 30, { min: 20, max: 45 });
    const next = deriveSwappedEntry(old, ex('pushup', 'reps'), method, 2);
    expect(next.isTimeBased).toBe(false);
    expect(next.formattedRepRange).toContain('חזרות');
    expect(next.formattedRepRange).not.toContain('שניות');
    expect(next.reps).toBeLessThanOrEqual(25);
    expect(next.repsRange!.max).toBeLessThan(45);
  });

  it('same metric: label rebuilt from the scaled numbers (no stale string)', () => {
    const old = entry(ex('pushup', 'reps', 3), false, 10, { min: 8, max: 12 });
    const next = deriveSwappedEntry(old, ex('diamond', 'reps', 5), method, 2);
    expect(next.formattedRepRange).toBe(formatRepRange(next));
    expect(next.repsRange).not.toEqual({ min: 8, max: 12 });
  });

  it('no precomputed string on the old entry: none is invented', () => {
    const old = { ...entry(ex('pushup', 'reps'), false, 10, { min: 8, max: 12 }), formattedRepRange: undefined };
    expect(deriveSwappedEntry(old, ex('plank', 'time'), method).formattedRepRange).toBeUndefined();
  });
});
