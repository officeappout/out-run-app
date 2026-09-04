import { describe, it, expect } from 'vitest';
import { resolveRunningDayState } from '../running-day-resolution';

// Sunday 06.09.2026 — date.getDay() === 0 (verified via node -e directly, not assumed).
const SUNDAY = new Date('2026-09-06T09:00:00');

const PENDING_1 = { week: 1, day: 1, status: 'pending' as const, workoutName: 'קלה' };
const PENDING_2 = { week: 1, day: 2, status: 'pending' as const, workoutName: 'אינטרוולים' };
const COMPLETED_1 = { week: 1, day: 1, status: 'completed' as const, workoutName: 'קלה' };
const COMPLETED_2 = { week: 1, day: 2, status: 'completed' as const, workoutName: 'אינטרוולים' };
const OTHER_WEEK = { week: 2, day: 1, status: 'pending' as const, workoutName: 'שבוע הבא' };

describe('resolveRunningDayState', () => {
  it('empty scheduleDays + a real program with a pending entry this week: run day, program-sourced', () => {
    const result = resolveRunningDayState([], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY);
    expect(result.isRunDay).toBe(true);
    expect(result.todayEntry).toBe(PENDING_1);
    expect(result.source).toBe('program');
    expect(result.nextEntryDaysAway).toBeUndefined();
  });

  it('empty scheduleDays + a real program whose whole week is already completed: a genuine rest day, not a permanent one', () => {
    const result = resolveRunningDayState([], [COMPLETED_1, COMPLETED_2, OTHER_WEEK], 1, SUNDAY);
    expect(result.isRunDay).toBe(false);
    expect(result.todayEntry).toBeUndefined();
    expect(result.source).toBe('program');
  });

  it('full scheduleDays + a real program: scheduleDays governs, byte-identical to the pre-existing weekday lookup', () => {
    // Sunday (א) is in scheduleDays -> today's slot is day 1 (first trainingDayIndex).
    const result = resolveRunningDayState(['א', 'ג'], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY);
    expect(result.isRunDay).toBe(true);
    expect(result.todayEntry).toBe(PENDING_1);
    expect(result.source).toBe('scheduleDays');
    // Next scheduled day after Sunday is Tuesday (ג), 2 days away -> slot 2.
    expect(result.nextEntryDaysAway).toBe(2);
    expect(result.nextEntry).toBe(PENDING_2);
  });

  it('full scheduleDays, today NOT in it: rest day per scheduleDays even though the program has a pending entry (scheduleDays governs, not the program)', () => {
    // Sunday is not in scheduleDays — today is a real rest day per the user's own picked days.
    const result = resolveRunningDayState(['ב', 'ד'], [PENDING_1, PENDING_2], 1, SUNDAY);
    expect(result.isRunDay).toBe(false);
    expect(result.todayEntry).toBeUndefined();
    expect(result.source).toBe('scheduleDays');
  });

  it('both empty: no plan at all, pre-existing default state preserved', () => {
    const result = resolveRunningDayState([], [], 1, SUNDAY);
    expect(result.isRunDay).toBe(false);
    expect(result.todayEntry).toBeUndefined();
    expect(result.source).toBe('none');
  });

  it('both empty, schedule undefined entirely: same as an empty array, no crash', () => {
    const result = resolveRunningDayState([], undefined, 1, SUNDAY);
    expect(result.isRunDay).toBe(false);
    expect(result.source).toBe('none');
  });
});
