import { describe, it, expect } from 'vitest';
import { streakWriteDate } from '../utils/streak-sync';

const today = '2026-10-21';

describe('streakWriteDate', () => {
  it('first sync of a new day, nothing counted yet → keeps the server date (the rule\'s "unchanged" shape)', () => {
    expect(streakWriteDate({ currentStreak: 4, longestStreak: 9, todayDate: today }, { currentStreak: 4, longestStreak: 9, lastActivityDate: '2026-10-20' })).toBe('2026-10-20');
  });
  it('a streak event (advance / reset / undo) → today, as before', () => {
    expect(streakWriteDate({ currentStreak: 5, longestStreak: 9, todayDate: today }, { currentStreak: 4, longestStreak: 9, lastActivityDate: '2026-10-20' })).toBe(today);
    expect(streakWriteDate({ currentStreak: 1, longestStreak: 9, todayDate: today }, { currentStreak: 4, longestStreak: 9, lastActivityDate: '2026-10-15' })).toBe(today);
    expect(streakWriteDate({ currentStreak: 3, longestStreak: 9, todayDate: today }, { currentStreak: 4, longestStreak: 9, lastActivityDate: today })).toBe(today);
  });
  it('no server doc / no usable date → today', () => {
    expect(streakWriteDate({ currentStreak: 1, longestStreak: 1, todayDate: today }, null)).toBe(today);
    expect(streakWriteDate({ currentStreak: 0, longestStreak: 3, todayDate: today }, { currentStreak: 0, longestStreak: 3, lastActivityDate: null })).toBe(today);
    expect(streakWriteDate({ currentStreak: 0, longestStreak: 3, todayDate: today }, { currentStreak: 0, longestStreak: 3, lastActivityDate: 'yesterday' })).toBe(today);
  });
});
