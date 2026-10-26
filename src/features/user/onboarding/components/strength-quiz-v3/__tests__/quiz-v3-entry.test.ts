import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: {} }));

import {
  INTRO_STEP_STORAGE_KEY,
  NEXT_ROUTE,
  PUSH_LADDER,
  isStrengthQuizV3Entry,
  nextLadderIndex,
  parseIntroStep,
} from '../quiz-v3-entry';
import { FULL_BODY_PROGRAM_SELECTION } from '../../../utils/program-path-persist';
import { FULL_BODY_ID, toggleMuscleSelection, toPersistedMuscleFocus } from '../../../utils/muscle-selection';
import { deriveActiveProgramFromMuscleFocus } from '../../../services/assessment-path-config.service';

describe('isStrengthQuizV3Entry (routing)', () => {
  it('flag off: always the legacy screen', () => {
    for (const gatewayTrack of [null, 'STRENGTH', 'RUNNING']) {
      expect(isStrengthQuizV3Entry({ flagOn: false, flagsReady: true, gatewayTrack })).toBe(false);
      expect(isStrengthQuizV3Entry({ flagOn: false, flagsReady: false, gatewayTrack })).toBe(false);
    }
  });

  it('flag on: the v3 intro for strength (and unknown track)', () => {
    expect(isStrengthQuizV3Entry({ flagOn: true, flagsReady: true, gatewayTrack: 'STRENGTH' })).toBe(true);
    expect(isStrengthQuizV3Entry({ flagOn: true, flagsReady: true, gatewayTrack: null })).toBe(true);
  });

  it('flag on but a running visitor: legacy (it redirects to the running flow)', () => {
    expect(isStrengthQuizV3Entry({ flagOn: true, flagsReady: true, gatewayTrack: 'RUNNING' })).toBe(false);
  });

  it('flags not known yet: legacy, never a guess', () => {
    expect(isStrengthQuizV3Entry({ flagOn: true, flagsReady: false, gatewayTrack: 'STRENGTH' })).toBe(false);
  });

  it('the intro ends in the existing visual assessment', () => {
    expect(NEXT_ROUTE).toBe('/onboarding-new/assessment-visual');
  });
});

describe('intro step', () => {
  it('parses only "assessment"; anything else is the welcome screen', () => {
    expect(parseIntroStep('assessment')).toBe('assessment');
    expect(parseIntroStep(null)).toBe('welcome');
    expect(parseIntroStep('junk')).toBe('welcome');
    expect(INTRO_STEP_STORAGE_KEY).toBe('strength_quiz_v3_intro_step');
  });
});

describe('full body program (goal screen skipped)', () => {
  it('is the legacy "כל הגוף" chip choice, deriving full_body downstream', () => {
    expect(FULL_BODY_PROGRAM_SELECTION.cards).toEqual(['body_focus']);
    expect(FULL_BODY_PROGRAM_SELECTION.muscles).toEqual(
      toPersistedMuscleFocus(toggleMuscleSelection([], FULL_BODY_ID)),
    );
    expect(FULL_BODY_PROGRAM_SELECTION.muscles).toEqual(['push', 'pull', 'legs', 'core']);
    expect(FULL_BODY_PROGRAM_SELECTION.skills).toEqual([]);
    expect(FULL_BODY_PROGRAM_SELECTION.wishlist).toEqual([]);
    expect(deriveActiveProgramFromMuscleFocus(FULL_BODY_PROGRAM_SELECTION.muscles)).toBe('full_body');
  });
});

describe('push ladder', () => {
  it('push 2 → 5 → 10, easy to hard', () => {
    expect(PUSH_LADDER.map((i) => i.level)).toEqual([2, 5, 10]);
    expect(PUSH_LADDER.map((i) => i.tone)).toEqual(['easy', 'mid', 'hard']);
    expect(new Set(PUSH_LADDER.map((i) => i.exerciseId)).size).toBe(3);
  });

  it('plays in order and wraps', () => {
    expect([0, 1, 2].map((i) => nextLadderIndex(i, 3))).toEqual([1, 2, 0]);
    expect(nextLadderIndex(0, 0)).toBe(0);
  });
});
