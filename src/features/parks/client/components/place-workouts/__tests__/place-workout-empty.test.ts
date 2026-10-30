import { describe, it, expect } from 'vitest';
import { isEmptyGeneratedWorkout, withoutHiddenCard } from '../place-workout-empty';
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';

describe('place-workout-empty (pilot AG8)', () => {
  it('0 min or 0 exercises is empty', () => {
    expect(isEmptyGeneratedWorkout({ durationMin: 0, exerciseCount: 0 })).toBe(true);
    expect(isEmptyGeneratedWorkout({ durationMin: 0, exerciseCount: 3 })).toBe(true);
    expect(isEmptyGeneratedWorkout({ durationMin: 12, exerciseCount: 0 })).toBe(true);
    expect(isEmptyGeneratedWorkout({ durationMin: Number.NaN, exerciseCount: 2 })).toBe(true);
  });

  it('a real workout, or nothing generated yet, is not empty', () => {
    expect(isEmptyGeneratedWorkout({ durationMin: 18, exerciseCount: 5 })).toBe(false);
    expect(isEmptyGeneratedWorkout(null)).toBe(false);
  });

  it('drops only the hidden card and keeps the order', () => {
    const a = { id: 'a' } as PlaceWorkoutSuggestion;
    const b = { id: 'b' } as PlaceWorkoutSuggestion;
    const c = { id: 'c' } as PlaceWorkoutSuggestion;
    expect(withoutHiddenCard([a, b, c], b)).toEqual([a, c]);
    expect(withoutHiddenCard([a, b], null)).toEqual([a, b]);
  });
});
