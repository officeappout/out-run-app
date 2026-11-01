import { describe, it, expect } from 'vitest';
import { quizReminderCandidate, quizReminderDue } from '../strengthQuizReminderScheduler';

const H = 3_600_000;

describe('strength quiz reminder push (pilot AJ16)', () => {
  it('first send about 24h after signup, second on day 3, then stop', () => {
    expect(quizReminderDue(20 * H, 0)).toBeNull();
    expect(quizReminderDue(25 * H, 0)).toBe(0);
    expect(quizReminderDue(30 * H, 1)).toBeNull();
    expect(quizReminderDue(73 * H, 1)).toBe(1);
    expect(quizReminderDue(73 * H, 2)).toBeNull();
    expect(quizReminderDue(130 * H, 0)).toBeNull();
  });
  it('a missed first window still sends only once, on day 3', () => {
    expect(quizReminderDue(80 * H, 0)).toBe(1);
  });
  it('only users with no strength level, past signup, not on a run / walk track', () => {
    expect(quizReminderCandidate({ onboardingStatus: 'MAP_ONLY' })).toBe(true);
    expect(quizReminderCandidate({ onboardingStatus: 'IN_PROGRESS' })).toBe(false);
    expect(quizReminderCandidate({ onboardingStatus: 'COMPLETED', progression: { tracks: { push: { currentLevel: 3 } } } })).toBe(false);
    expect(quizReminderCandidate({ onboardingStatus: 'COMPLETED', progression: { tracks: { running: { currentLevel: 2 } } } })).toBe(true);
    expect(quizReminderCandidate({ onboardingStatus: 'COMPLETED', running: { isUnlocked: true } })).toBe(false);
    expect(quizReminderCandidate({ onboardingStatus: 'COMPLETED', lifestyle: { primaryTrack: 'health' } })).toBe(false);
  });
});
