import { describe, it, expect } from 'vitest';
import { shouldShowLevelRing, isProgressionSkippedNoQuestionnaire } from '../utils/level-ring-visibility';

// G8.2 summary guard — the level ring hides when progression was skipped for a user with no
// questionnaire (flag enable_no_auto_strength_level ON); everything else is unchanged.

const gained = { skipped: undefined } as const;
const skipped = { skipped: 'no_questionnaire' } as const;

describe('shouldShowLevelRing', () => {
  it('flag ON, no questionnaire → progression skipped → ring hidden', () => {
    expect(shouldShowLevelRing({ isReadOnly: false, progressionResult: skipped })).toBe(false);
  });
  it('normal workout with progression → ring shown (unchanged)', () => {
    expect(shouldShowLevelRing({ isReadOnly: false, progressionResult: gained })).toBe(true);
  });
  it('result not in yet (null) → ring shown, as today (the flag-OFF / pending path is unchanged)', () => {
    expect(shouldShowLevelRing({ isReadOnly: false, progressionResult: null })).toBe(true);
  });
  it('history view → hidden, as before (isReadOnly gate kept)', () => {
    expect(shouldShowLevelRing({ isReadOnly: true, progressionResult: gained })).toBe(false);
    expect(shouldShowLevelRing({ isReadOnly: true, progressionResult: null })).toBe(false);
  });
});

describe('isProgressionSkippedNoQuestionnaire', () => {
  it('only the explicit marker counts', () => {
    expect(isProgressionSkippedNoQuestionnaire(skipped)).toBe(true);
    expect(isProgressionSkippedNoQuestionnaire(gained)).toBe(false);
    expect(isProgressionSkippedNoQuestionnaire(null)).toBe(false);
    expect(isProgressionSkippedNoQuestionnaire(undefined)).toBe(false);
  });
});
