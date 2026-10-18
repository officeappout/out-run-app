/**
 * Soft-adaptation Phase 0: the post-workout survey is RECORD-ONLY — it must
 * never change level or progress, and it is shown on the first 3 strength
 * sessions then about every 4th.
 */
import { describe, it, expect } from 'vitest';
import { processFeedback, type WorkoutFeedback } from '@/features/workout-engine/components/PostWorkoutSurvey';
import { shouldPromptPostWorkoutSurvey } from '../survey-cadence';

describe('processFeedback — no level / progress effect', () => {
  it.each<WorkoutFeedback>(['too_easy', 'just_right', 'too_hard'])('%s → message only', (rating) => {
    const r = processFeedback(rating);
    expect(Object.keys(r).sort()).toEqual(['feedback', 'message']);
    expect(r.feedback).toBe(rating);
    expect(r).not.toHaveProperty('progressBonus');
    expect(r).not.toHaveProperty('levelAdjustment');
    // and the copy promises nothing about levels / bonuses
    expect(r.message).not.toMatch(/בונוס|רמה|%/);
  });
});

describe('shouldPromptPostWorkoutSurvey cadence', () => {
  it('asks the first 3 sessions', () => {
    expect([1, 2, 3].map(shouldPromptPostWorkoutSurvey)).toEqual([true, true, true]);
  });

  it('then about every 4th', () => {
    const asked = Array.from({ length: 20 }, (_, i) => i + 1).filter(shouldPromptPostWorkoutSurvey);
    expect(asked).toEqual([1, 2, 3, 7, 11, 15, 19]);
  });

  it('never for invalid counts', () => {
    expect(shouldPromptPostWorkoutSurvey(0)).toBe(false);
    expect(shouldPromptPostWorkoutSurvey(-2)).toBe(false);
    expect(shouldPromptPostWorkoutSurvey(NaN)).toBe(false);
  });
});
