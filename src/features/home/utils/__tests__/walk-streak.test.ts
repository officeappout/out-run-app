import { describe, it, expect } from 'vitest';
import { walkStreakDates, walkStreakFrom, weekStartOf } from '../walk-streak';
import { isTryRunningDismissed, shouldShowTryRunning, TRY_RUNNING_DISMISS_DAYS } from '../try-running';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

// Wednesday 2026-10-21 (week starts Sunday 2026-10-18).
const NOW = new Date(2026, 9, 21, 12, 0);
const walk = (completed: boolean) => ({ completed, walk: true }) as unknown as UserScheduleEntry;
const isWalk = (e: UserScheduleEntry) => (e as unknown as { walk?: boolean }).walk === true;
const day = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

describe('walkStreak', () => {
  it('week starts on Sunday', () => {
    expect(weekStartOf(NOW).getDate()).toBe(18);
  });
  it('reads from the Sunday 4 weeks back through today', () => {
    const dates = walkStreakDates(NOW);
    expect(dates[0]).toBe('2026-09-20');
    expect(dates[dates.length - 1]).toBe('2026-10-21');
    expect(dates).toHaveLength(32);
  });
  it('counts consecutive weeks, the empty current week does not break the run', () => {
    const byDate = {
      [day(2026, 10, 14)]: [walk(true)], // last week
      [day(2026, 10, 7)]: [walk(true), walk(true)],
      [day(2026, 9, 30)]: [walk(true)],
      [day(2026, 9, 23)]: [walk(true)],
    };
    expect(walkStreakFrom(byDate, isWalk, NOW)).toEqual({ weeks: 4, walks: 5 });
  });
  it('this week counts when it has a walk', () => {
    const byDate = { [day(2026, 10, 19)]: [walk(true)], [day(2026, 10, 14)]: [walk(true)] };
    expect(walkStreakFrom(byDate, isWalk, NOW).weeks).toBe(2);
  });
  it('a gap week breaks the run; planned-but-not-done walks do not count', () => {
    const byDate = {
      [day(2026, 10, 14)]: [walk(true)],
      [day(2026, 10, 7)]: [walk(false)], // planned only
      [day(2026, 9, 30)]: [walk(true)],
    };
    expect(walkStreakFrom(byDate, isWalk, NOW)).toEqual({ weeks: 1, walks: 1 });
  });
  it('nothing -> 0', () => {
    expect(walkStreakFrom({}, isWalk, NOW)).toEqual({ weeks: 0, walks: 0 });
  });
});

describe('try-running visibility', () => {
  const now = Date.UTC(2026, 9, 21);
  const base = { enabled: true, walkOnly: true, streakWeeks: 4, dismissedAtMs: null, nowMs: now };
  it('needs the flag, a walk-only user and 4+ weeks', () => {
    expect(shouldShowTryRunning(base)).toBe(true);
    expect(shouldShowTryRunning({ ...base, enabled: false })).toBe(false);
    expect(shouldShowTryRunning({ ...base, walkOnly: false })).toBe(false);
    expect(shouldShowTryRunning({ ...base, streakWeeks: 3 })).toBe(false);
  });
  it('"not now" hides it for 30 days, then it returns', () => {
    const day = 86_400_000;
    expect(isTryRunningDismissed(now - 29 * day, now)).toBe(true);
    expect(isTryRunningDismissed(now - TRY_RUNNING_DISMISS_DAYS * day, now)).toBe(false);
    expect(isTryRunningDismissed(now + day, now)).toBe(false); // future stamp = bad data
    expect(isTryRunningDismissed(NaN, now)).toBe(false);
    expect(shouldShowTryRunning({ ...base, dismissedAtMs: now - 5 * day })).toBe(false);
  });
});
