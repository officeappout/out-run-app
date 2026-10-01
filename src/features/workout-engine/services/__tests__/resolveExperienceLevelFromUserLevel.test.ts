import { describe, it, expect } from 'vitest';
import { resolveExperienceLevelFromUserLevel } from '../workout-metadata.service';

/**
 * Pins the numeric→categorical mapping feeding WorkoutMetadataContext.
 * experienceLevel (the @רמה content tag) — see the function's own doc
 * comment (workout-metadata.service.ts) for why this was added and why the
 * beginner/intermediate boundary matches getLevelTier (split-decision.types.ts).
 */
describe('resolveExperienceLevelFromUserLevel', () => {
  it('maps the beginner band (≤5), matching getLevelTier\'s boundary', () => {
    expect(resolveExperienceLevelFromUserLevel(1)).toBe('beginner');
    expect(resolveExperienceLevelFromUserLevel(5)).toBe('beginner');
  });

  it('maps the intermediate band (6-13), matching getLevelTier\'s boundary', () => {
    expect(resolveExperienceLevelFromUserLevel(6)).toBe('intermediate');
    expect(resolveExperienceLevelFromUserLevel(13)).toBe('intermediate');
  });

  it('maps the advanced band (14-19)', () => {
    expect(resolveExperienceLevelFromUserLevel(14)).toBe('advanced');
    expect(resolveExperienceLevelFromUserLevel(19)).toBe('advanced');
  });

  it('maps the pro band (20+)', () => {
    expect(resolveExperienceLevelFromUserLevel(20)).toBe('pro');
    expect(resolveExperienceLevelFromUserLevel(25)).toBe('pro');
  });

  it('never returns the generic placeholder — always one of the 4 real bands', () => {
    for (let level = 1; level <= 30; level++) {
      expect(['beginner', 'intermediate', 'advanced', 'pro']).toContain(
        resolveExperienceLevelFromUserLevel(level),
      );
    }
  });
});
