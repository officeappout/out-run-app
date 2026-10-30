import { describe, it, expect } from 'vitest';
import { streakMinutesLeftToday } from '../streak-today-left';

describe('streakMinutesLeftToday (pilot AG6)', () => {
  it('a 5-minute combined workout leaves 5 minutes to count today', () => {
    expect(streakMinutesLeftToday({ categories: { cardio: { minutes: 4 }, strength: { minutes: 1 } } })).toBe(5);
  });

  it('is 0 once the day reaches 10 minutes', () => {
    expect(streakMinutesLeftToday({ categories: { cardio: { minutes: 10 } } })).toBe(0);
  });

  it('is 0 when the step goal already closed the day', () => {
    expect(streakMinutesLeftToday({ categories: {}, steps: 9000, stepsGoal: 8000 })).toBe(0);
  });

  it('adds the pending session before its own write lands', () => {
    expect(streakMinutesLeftToday({ categories: { cardio: { minutes: 3 } } }, { strengthMinutes: 4 })).toBe(3);
    expect(streakMinutesLeftToday(null, { strengthMinutes: 12 })).toBe(0);
  });

  it('no activity yet: the full 10 minutes', () => {
    expect(streakMinutesLeftToday(null)).toBe(10);
  });
});
