import { describe, expect, it } from 'vitest';
import { flameSrc, sortTones, streakRuns, toneFromCategory, toneFromFlameKey, type FlameTone } from '../streak';

describe('streakRuns', () => {
  it('joins consecutive done days', () => {
    expect(streakRuns(['done', 'done', 'done', 'other'])).toEqual([{ from: 0, to: 2 }]);
  });
  it('a single rest day between done days keeps the run', () => {
    expect(streakRuns(['done', 'done', 'rest', 'done', 'other'])).toEqual([{ from: 0, to: 3 }]);
  });
  it('a rest day at the edge does not extend the run', () => {
    expect(streakRuns(['done', 'done', 'rest', 'other'])).toEqual([{ from: 0, to: 1 }]);
  });
  it('one done day alone is not a run', () => {
    expect(streakRuns(['other', 'done', 'other', 'done'])).toEqual([]);
  });
  it('two runs split by a missed day', () => {
    expect(streakRuns(['done', 'done', 'other', 'done', 'done'])).toEqual([
      { from: 0, to: 1 },
      { from: 3, to: 4 },
    ]);
  });
  it('a run reaching the end of the week', () => {
    expect(streakRuns(['other', 'done', 'done'])).toEqual([{ from: 1, to: 2 }]);
  });
});

describe('tones', () => {
  it('maps flame buckets', () => {
    expect(toneFromFlameKey('strength')).toBe('strength');
    expect(toneFromFlameKey('endurance')).toBe('cardio');
    expect(toneFromFlameKey('intensity')).toBe('cardio');
    expect(toneFromFlameKey('steps')).toBe('steps');
    expect(toneFromFlameKey('maintenance')).toBe('maintenance');
    expect(toneFromFlameKey(undefined)).toBe('strength');
  });
  it('maps categories', () => {
    expect(toneFromCategory('cardio')).toBe('cardio');
    expect(toneFromCategory('maintenance')).toBe('maintenance');
    expect(toneFromCategory('strength')).toBe('strength');
  });
  it('sorts and dedupes', () => {
    expect(sortTones(['steps', 'strength', 'steps'] as FlameTone[])).toEqual(['strength', 'steps']);
  });
});

describe('flameSrc', () => {
  it('one tone', () => {
    expect(flameSrc(['cardio'])).toBe('/assets/animations/flames/cardio.lottie');
  });
  it('a shipped blend, in canonical order', () => {
    expect(flameSrc(['steps', 'strength'])).toBe('/assets/animations/flames/strength-steps.lottie');
    expect(flameSrc(['steps', 'cardio', 'strength'])).toBe('/assets/animations/flames/strength-cardio-steps.lottie');
  });
  it('maintenance blends fall back to the other tones / the first tone', () => {
    expect(flameSrc(['maintenance', 'strength', 'cardio'])).toBe('/assets/animations/flames/strength-cardio.lottie');
    expect(flameSrc(['maintenance'])).toBe('/assets/animations/flames/maintenance.lottie');
  });
  it('empty falls back to strength', () => {
    expect(flameSrc([])).toBe('/assets/animations/flames/strength.lottie');
  });
});
