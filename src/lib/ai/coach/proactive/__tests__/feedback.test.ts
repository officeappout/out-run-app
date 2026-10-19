import { describe, expect, it } from 'vitest';
import { feedbackBias, feedbackRefusal, isWorkoutRating } from '../feedback';

describe('"איך היה?" answers', () => {
  it('accepts an unanswered post-workout question only', () => {
    expect(feedbackRefusal(undefined)).toBe('not_found');
    expect(feedbackRefusal({ proactive: { trigger: 'morning' } })).toBe('not_a_question');
    expect(feedbackRefusal({ proactive: { trigger: 'post_workout' } })).toBe('not_a_question');
    expect(feedbackRefusal({ proactive: { trigger: 'post_workout', workoutId: 'w1', feedback: 'hard' } })).toBe('already_answered');
    expect(feedbackRefusal({ proactive: { trigger: 'post_workout', workoutId: 'w1' } })).toBeNull();
    expect(isWorkoutRating('right')).toBe(true);
    expect(isWorkoutRating('meh')).toBe(false);
  });
  it('deferred generator rule: 2 of the last 3 hard → easier; 3 of 3 easy → harder; old answers ignored', () => {
    const now = 100 * 86_400_000;
    const r = (rating: 'easy' | 'right' | 'hard', daysAgo: number) => ({ rating, createdAtMs: now - daysAgo * 86_400_000 });
    expect(feedbackBias([r('hard', 1), r('right', 3), r('hard', 5)], now)).toBe('easier');
    expect(feedbackBias([r('easy', 1), r('easy', 2), r('easy', 3)], now)).toBe('harder');
    expect(feedbackBias([r('easy', 1), r('easy', 2)], now)).toBeNull();
    expect(feedbackBias([r('hard', 1), r('hard', 30)], now)).toBeNull();
    expect(feedbackBias([], now)).toBeNull();
  });
});
