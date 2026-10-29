import { describe, it, expect } from 'vitest';
import { isStepsGoalInCarousel } from '../steps-goal-slot';

const base = {
  carouselOn: true,
  startOnly: false,
  workoutDone: false,
  v2Walker: false,
  suggestions: [{ generatorId: 'hero' }, { generatorId: 'safety-net' }],
};

describe('isStepsGoalInCarousel (pilot O4)', () => {
  it('the carousel shows the steps slot today', () => {
    expect(isStepsGoalInCarousel(base)).toBe(true);
  });
  it('no steps slot in today\'s suggestions → the strip keeps the card', () => {
    expect(isStepsGoalInCarousel({ ...base, suggestions: [{ generatorId: 'hero' }] })).toBe(false);
    expect(isStepsGoalInCarousel({ ...base, suggestions: null })).toBe(false);
  });
  it('carousel hidden (workout done, start-only, carousel off) → the strip keeps the card', () => {
    expect(isStepsGoalInCarousel({ ...base, workoutDone: true })).toBe(false);
    expect(isStepsGoalInCarousel({ ...base, startOnly: true })).toBe(false);
    expect(isStepsGoalInCarousel({ ...base, carouselOn: false })).toBe(false);
  });
  it('v2 walker: the short walk replaced the steps card', () => {
    expect(isStepsGoalInCarousel({ ...base, v2Walker: true })).toBe(false);
  });
});
