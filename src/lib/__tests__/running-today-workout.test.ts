import { describe, it, expect } from 'vitest';
import { resolveTodayRunningWorkout } from '../running-today-workout';

const SUNDAY = { day: 1, status: 'pending' as const, id: 'sun' };
const TUESDAY = { day: 2, status: 'pending' as const, id: 'tue' };
const THURSDAY = { day: 3, status: 'pending' as const, id: 'thu' };
const WEEK = [SUNDAY, TUESDAY, THURSDAY];

describe('resolveTodayRunningWorkout', () => {
  it('a real training day: todayEntry is the matching entry, isRestDay=false, no nextUpEntry needed', () => {
    const result = resolveTodayRunningWorkout(WEEK, 2); // Tuesday
    expect(result.todayEntry).toBe(TUESDAY);
    expect(result.isRestDay).toBe(false);
    expect(result.nextUpEntry).toBeUndefined();
  });

  it('a real rest day (todayScheduleDay nullish, real workouts still pending this week): rest-day card can render, with a "next" entry', () => {
    const result = resolveTodayRunningWorkout(WEEK, undefined);
    expect(result.todayEntry).toBeUndefined();
    expect(result.isRestDay).toBe(true);
    expect(result.nextUpEntry).toBe(SUNDAY); // first pending, for the "הבא: ..." line
  });

  it('null todayScheduleDay behaves the same as undefined', () => {
    const result = resolveTodayRunningWorkout(WEEK, null);
    expect(result.isRestDay).toBe(true);
  });

  it('whole week already completed, on a rest day: rest-day card still renders, no nextUpEntry (nothing left to preview) -- not a bug, an honest empty state', () => {
    const allDone = WEEK.map((e) => ({ ...e, status: 'completed' as const }));
    const result = resolveTodayRunningWorkout(allDone, undefined);
    expect(result.todayEntry).toBeUndefined();
    expect(result.isRestDay).toBe(true);
    expect(result.nextUpEntry).toBeUndefined();
  });
});
