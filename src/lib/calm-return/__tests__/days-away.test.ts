import { describe, it, expect } from 'vitest';
import { getDaysAway, latestWorkoutDate, toDateOrNull, daysBetweenLocalDays } from '../days-away';

// Local-time "now" — every day count is in local calendar days.
const NOW = new Date(2026, 9, 18, 9, 30); // 18.10.2026 09:30 local

describe('getDaysAway — one gap from every real-workout date on the profile', () => {
  it('null for a user who never trained (not "returning")', () => {
    expect(getDaysAway({}, NOW)).toBeNull();
    expect(getDaysAway(null, NOW)).toBeNull();
    expect(getDaysAway({ progression: { lastActiveDate: '' } }, NOW)).toBeNull();
  });

  it('reads progression.lastActiveDate as a LOCAL calendar day', () => {
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-18' } }, NOW)).toBe(0);
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-17' } }, NOW)).toBe(1);
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-11' } }, NOW)).toBe(7);
  });

  it('takes the LATEST of lastActiveDate, running.lastWorkoutDate and track dates', () => {
    const profile = {
      progression: {
        lastActiveDate: '2026-09-01',
        tracks: {
          push: { lastWorkoutDate: new Date(2026, 9, 10, 20, 0) },
          pull: { lastWorkoutDate: { seconds: Math.floor(new Date(2026, 9, 12, 7).getTime() / 1000) } },
        },
      },
      running: { lastWorkoutDate: new Date(2026, 9, 14, 18, 0).toISOString() },
    };
    expect(latestWorkoutDate(profile)?.getDate()).toBe(14);
    expect(getDaysAway(profile, NOW)).toBe(4);
  });

  it('a strength-only user is not "away" because running.lastWorkoutDate is old', () => {
    const profile = {
      progression: { lastActiveDate: '2026-10-17' },
      running: { lastWorkoutDate: '2026-08-01T10:00:00.000Z' },
    };
    expect(getDaysAway(profile, NOW)).toBe(1);
  });

  it('accepts Firestore Timestamp-like objects and ignores garbage', () => {
    expect(toDateOrNull({ toDate: () => new Date(2026, 9, 1) })?.getDate()).toBe(1);
    expect(toDateOrNull('not a date')).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
  });

  it('a future date (clock skew) counts as today', () => {
    expect(getDaysAway({ progression: { lastActiveDate: '2026-10-20' } }, NOW)).toBe(0);
  });

  it('is pure: same input, same answer, no clock read', () => {
    const p = { progression: { lastActiveDate: '2026-10-01' } };
    expect(getDaysAway(p, NOW)).toBe(getDaysAway(p, new Date(NOW)));
    expect(getDaysAway(p, new Date(2026, 9, 31))).toBe(30);
  });

  it('daysBetweenLocalDays ignores the time of day', () => {
    expect(daysBetweenLocalDays(new Date(2026, 9, 17, 23, 59), new Date(2026, 9, 18, 0, 1))).toBe(1);
  });
});
