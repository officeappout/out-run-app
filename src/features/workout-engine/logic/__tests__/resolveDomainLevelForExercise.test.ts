import { describe, expect, it } from 'vitest';
import { resolveDomainLevelForExercise } from '../workout-selection.utils';

// The identity resolver — real callers pass `resolveToSlug` (Firestore-backed);
// tests pass an identity fn since `targetPrograms[].programId` in these fixtures
// is already the slug, keeping the function itself decoupled from that cache.
const identity = (id: string) => id;

describe('resolveDomainLevelForExercise', () => {
  it('exercise with only a specific tag — returns its level', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'planche', level: 7 }],
      'planche',
      ['push'],
      identity,
    );
    expect(result).toBe(7);
  });

  it('exercise with only a parent tag — falls back to the parent-alias level', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'push', level: 16 }],
      'planche',
      ['push'],
      identity,
    );
    expect(result).toBe(16);
  });

  it('exercise with both, specific first in array — returns the specific level', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'planche', level: 7 }, { programId: 'push', level: 16 }],
      'planche',
      ['push'],
      identity,
    );
    expect(result).toBe(7);
  });

  it('exercise with both, parent first in array — the broken case, must still return the specific level', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'push', level: 16 }, { programId: 'planche', level: 7 }],
      'planche',
      ['push'],
      identity,
    );
    expect(result).toBe(7);
  });

  it('order independence — both "both" cases return the identical value', () => {
    const specificFirst = resolveDomainLevelForExercise(
      [{ programId: 'planche', level: 7 }, { programId: 'push', level: 16 }],
      'planche',
      ['push'],
      identity,
    );
    const parentFirst = resolveDomainLevelForExercise(
      [{ programId: 'push', level: 16 }, { programId: 'planche', level: 7 }],
      'planche',
      ['push'],
      identity,
    );
    expect(specificFirst).toBe(parentFirst);
    expect(specificFirst).toBe(7);
  });

  it('exercise with no relevant tag at all — returns null (caller falls back to recommendedLevel/userLevel)', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'legs', level: 5 }],
      'planche',
      ['push'],
      identity,
    );
    expect(result).toBeNull();
  });

  it('no targetPrograms at all — returns null', () => {
    const result = resolveDomainLevelForExercise(undefined, 'planche', ['push'], identity);
    expect(result).toBeNull();
  });

  it('resolves via the injected slug resolver, not the raw programId, when they differ', () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'pCI5NHXpowu2ySucqDn8', level: 7 }],
      'planche',
      ['push'],
      (id) => (id === 'pCI5NHXpowu2ySucqDn8' ? 'planche' : id),
    );
    expect(result).toBe(7);
  });

  it("David's real regression — HSYxn9dL4d9nUImW3Y7G (push L16, planche L7), push first — must resolve to planche's L7, not push's L16", () => {
    const result = resolveDomainLevelForExercise(
      [{ programId: 'J0fLpmJhG0KDN2tQouxh', level: 16 }, { programId: 'pCI5NHXpowu2ySucqDn8', level: 7 }],
      'planche',
      ['push'],
      (id) => (id === 'J0fLpmJhG0KDN2tQouxh' ? 'push' : id === 'pCI5NHXpowu2ySucqDn8' ? 'planche' : id),
    );
    expect(result).toBe(7);
  });
});
