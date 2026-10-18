import { describe, it, expect } from 'vitest';
import {
  advanceStreakForDay,
  advanceStreakForDayWithGrace,
  graceDayFor,
  isStreakAliveWithGrace,
  streakWeekKey,
} from '../streak-rules';

describe('streak grace day (calm return) — one automatic "יום חסד" per week', () => {
  it('week key is the Sunday of that week', () => {
    expect(streakWeekKey('2026-10-18')).toBe('2026-10-18'); // Sunday
    expect(streakWeekKey('2026-10-21')).toBe('2026-10-18'); // Wednesday
    expect(streakWeekKey('2026-10-24')).toBe('2026-10-18'); // Saturday
    expect(streakWeekKey('2026-10-25')).toBe('2026-10-25');
  });

  it('a single missed day does not break the streak: N → N+2 (grace day + today)', () => {
    const r = advanceStreakForDayWithGrace({ currentStreak: 5, lastStreakDate: '2026-10-19' }, '2026-10-21');
    expect(r).toEqual({
      currentStreak: 7,
      lastStreakDate: '2026-10-21',
      advanced: true,
      graceDate: '2026-10-20',
      graceWeekKey: '2026-10-18',
    });
  });

  it('only once per week: the second missed day that week breaks it (restart at 1)', () => {
    const r = advanceStreakForDayWithGrace(
      { currentStreak: 7, lastStreakDate: '2026-10-22', graceWeekKey: '2026-10-18' },
      '2026-10-24',
    );
    expect(r.currentStreak).toBe(1);
    expect(r.graceDate).toBeNull();
  });

  it('a new week banks a new grace day', () => {
    const r = advanceStreakForDayWithGrace(
      { currentStreak: 9, lastStreakDate: '2026-10-25', graceWeekKey: '2026-10-18' },
      '2026-10-27',
    );
    expect(r.currentStreak).toBe(11);
    expect(r.graceWeekKey).toBe('2026-10-25');
  });

  it('two missed days are not covered', () => {
    expect(graceDayFor({ currentStreak: 4, lastStreakDate: '2026-10-19' }, '2026-10-22')).toBeNull();
    expect(advanceStreakForDayWithGrace({ currentStreak: 4, lastStreakDate: '2026-10-19' }, '2026-10-22').currentStreak).toBe(1);
  });

  it('no streak, nothing to save', () => {
    expect(graceDayFor({ currentStreak: 0, lastStreakDate: '2026-10-19' }, '2026-10-21')).toBeNull();
    expect(graceDayFor({ currentStreak: 3, lastStreakDate: '' }, '2026-10-21')).toBeNull();
  });

  it('ordinary days behave exactly like advanceStreakForDay', () => {
    for (const [counters, today] of [
      [{ currentStreak: 3, lastStreakDate: '2026-10-20' }, '2026-10-21'],
      [{ currentStreak: 3, lastStreakDate: '2026-10-21' }, '2026-10-21'],
      [{ currentStreak: 0, lastStreakDate: '' }, '2026-10-21'],
    ] as const) {
      const legacy = advanceStreakForDay(counters, today);
      const r = advanceStreakForDayWithGrace(counters, today);
      expect({ currentStreak: r.currentStreak, lastStreakDate: r.lastStreakDate, advanced: r.advanced }).toEqual(legacy);
      expect(r.graceDate).toBeNull();
    }
  });

  it('on load, a one-day gap with grace left keeps the streak alive', () => {
    expect(isStreakAliveWithGrace({ currentStreak: 5, lastStreakDate: '2026-10-19' }, '2026-10-21')).toBe(true);
    expect(isStreakAliveWithGrace({ currentStreak: 5, lastStreakDate: '2026-10-20' }, '2026-10-21')).toBe(true);
    expect(isStreakAliveWithGrace({ currentStreak: 5, lastStreakDate: '2026-10-18' }, '2026-10-21')).toBe(false);
    expect(
      isStreakAliveWithGrace({ currentStreak: 5, lastStreakDate: '2026-10-19', graceWeekKey: '2026-10-18' }, '2026-10-21'),
    ).toBe(false);
  });
});
