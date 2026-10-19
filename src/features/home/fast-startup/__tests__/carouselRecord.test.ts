import { describe, it, expect } from 'vitest';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { buildHomeCarouselSnapshot, isHomeCarouselSnapshot } from '../carouselRecord';
import {
  clearProvisionalHeroWorkouts,
  getProvisionalHeroWorkout,
  seedProvisionalHeroWorkouts,
} from '../provisionalHeroWorkouts';

const s = (id: string, generatorId: string) => ({ id, generatorId }) as unknown as Suggestion;
const w = (title: string) => ({ title, exercises: [] }) as unknown as GeneratedWorkout;

describe('home carousel snapshot', () => {
  it('keeps suggestions and only the hero workouts the real caches have', () => {
    const fs = s('full-strength-cheap-u1', 'full-strength');
    const sn = s('safety-net-x', 'safety-net');
    const snap = buildHomeCarouselSnapshot([fs, sn], (x) => (x.generatorId === 'full-strength' ? w('A') : null));
    expect(snap.suggestions).toEqual([fs, sn]);
    expect(Object.keys(snap.heroWorkouts)).toEqual(['full-strength-cheap-u1']);
    expect(isHomeCarouselSnapshot(snap)).toBe(true);
  });

  it('rejects malformed / empty records', () => {
    expect(isHomeCarouselSnapshot(null)).toBe(false);
    expect(isHomeCarouselSnapshot({ suggestions: [], heroWorkouts: {} })).toBe(false);
    expect(isHomeCarouselSnapshot({ suggestions: [{ id: 1 }], heroWorkouts: {} })).toBe(false);
    expect(isHomeCarouselSnapshot({ suggestions: [s('a', 'b')] })).toBe(false);
  });
});

describe('provisional hero workouts', () => {
  it('serves seeded workouts until cleared; empty by default (flag-off parity)', () => {
    clearProvisionalHeroWorkouts();
    expect(getProvisionalHeroWorkout('x')).toBeUndefined();
    seedProvisionalHeroWorkouts({ x: w('cached') });
    expect(getProvisionalHeroWorkout('x')?.title).toBe('cached');
    seedProvisionalHeroWorkouts({ y: w('other') });
    expect(getProvisionalHeroWorkout('x')).toBeUndefined();
    clearProvisionalHeroWorkouts();
    expect(getProvisionalHeroWorkout('y')).toBeUndefined();
  });
});
