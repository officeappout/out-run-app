import { describe, it, expect } from 'vitest';
import { resolveRunningDayState } from '../running-day-resolution';

// Sunday 06.09.2026 — date.getDay() === 0 (verified via node -e directly, not assumed).
const SUNDAY = new Date('2026-09-06T09:00:00');

const PENDING_1 = { week: 1, day: 1, status: 'pending' as const, workoutName: 'קלה' };
const PENDING_2 = { week: 1, day: 2, status: 'pending' as const, workoutName: 'אינטרוולים' };
const COMPLETED_1 = { week: 1, day: 1, status: 'completed' as const, workoutName: 'קלה' };
const COMPLETED_2 = { week: 1, day: 2, status: 'completed' as const, workoutName: 'אינטרוולים' };
const OTHER_WEEK = { week: 2, day: 1, status: 'pending' as const, workoutName: 'שבוע הבא' };

// A real 8-week plan, one entry per week, starting Sunday 02.08.2026
// (verified via node -e: getDay()===0). Used for the date-boundary tests —
// deliberately spans real week numbers so "before start"/"after end" are
// unambiguous relative to real schedule data, not just an empty array.
const PROGRAM_START = new Date('2026-08-02T09:00:00');
const EIGHT_WEEK_PLAN = Array.from({ length: 8 }, (_, i) => ({
  week: i + 1,
  day: 1,
  status: 'pending' as const,
  workoutName: `שבוע ${i + 1}`,
}));

describe('resolveRunningDayState', () => {
  describe('scheduleDays present — regression: byte-identical to the pre-existing weekday lookup', () => {
    it('empty scheduleDays + a real program with a pending entry this week: run day, program-sourced', () => {
      const result = resolveRunningDayState([], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(true);
      expect(result.todayEntry).toBe(PENDING_1);
      expect(result.source).toBe('program');
      expect(result.nextEntryDaysAway).toBeUndefined();
    });

    it('empty scheduleDays + a real program whose whole week is already completed: a genuine rest day, not a permanent one', () => {
      const result = resolveRunningDayState([], [COMPLETED_1, COMPLETED_2, OTHER_WEEK], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(false);
      expect(result.todayEntry).toBeUndefined();
      expect(result.source).toBe('program');
    });

    it('full scheduleDays + a real program: scheduleDays governs, byte-identical to the pre-existing weekday lookup', () => {
      // Sunday (א) is in scheduleDays -> today's slot is day 1 (first trainingDayIndex).
      const result = resolveRunningDayState(['א', 'ג'], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(true);
      expect(result.todayEntry).toBe(PENDING_1);
      expect(result.source).toBe('scheduleDays');
      // Next scheduled day after Sunday is Tuesday (ג), 2 days away -> slot 2.
      expect(result.nextEntryDaysAway).toBe(2);
      expect(result.nextEntry).toBe(PENDING_2);
    });

    it('full scheduleDays, today NOT in it: rest day per scheduleDays even though the program has a pending entry (scheduleDays governs, not the program)', () => {
      // Sunday is not in scheduleDays — today is a real rest day per the user's own picked days.
      const result = resolveRunningDayState(['ב', 'ד'], [PENDING_1, PENDING_2], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(false);
      expect(result.todayEntry).toBeUndefined();
      expect(result.source).toBe('scheduleDays');
    });

    it('full scheduleDays: passing a startDate (now required for the program-fallback path) does not change the scheduleDays branch at all — same result with or without it', () => {
      const withoutStartDate = resolveRunningDayState(['א', 'ג'], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY, undefined);
      const withStartDate = resolveRunningDayState(['א', 'ג'], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY, PROGRAM_START);
      expect(withStartDate).toEqual(withoutStartDate);
    });
  });

  describe('program fallback — date-scoped and plan-bounded (05.09.2026 fix)', () => {
    it('a date BEFORE the plan started: no workout, and explicitly not a "rest day" (out-of-range, not program)', () => {
      const dayBeforeStart = new Date('2026-08-01T09:00:00'); // verified Saturday, one day before PROGRAM_START
      const result = resolveRunningDayState([], EIGHT_WEEK_PLAN, 1, dayBeforeStart, PROGRAM_START);
      expect(result.isRunDay).toBe(false);
      expect(result.todayEntry).toBeUndefined();
      expect(result.source).toBe('out-of-range');
    });

    it('a date long AFTER the plan ends: no workout (the date-derived week has no schedule entries)', () => {
      const wayAfterEnd = new Date('2026-12-01T09:00:00'); // verified: resolves to week 18, plan only has 8
      const result = resolveRunningDayState([], EIGHT_WEEK_PLAN, 1, wayAfterEnd, PROGRAM_START);
      expect(result.isRunDay).toBe(false);
      expect(result.todayEntry).toBeUndefined();
      expect(result.source).toBe('none');
    });

    it('a date within range resolving to week 3: returns week 3\'s workout, not "currentWeek" (proves the week is derived from the date, not trusted from the caller)', () => {
      const weekThreeDate = new Date('2026-08-16T09:00:00'); // verified: 14 days after PROGRAM_START -> week 3
      // currentWeek is deliberately wrong (1) here — if the function still
      // trusted it instead of deriving from `date`, this would return week
      // 1's entry instead of week 3's.
      const result = resolveRunningDayState([], EIGHT_WEEK_PLAN, 1, weekThreeDate, PROGRAM_START);
      expect(result.isRunDay).toBe(true);
      expect(result.todayEntry).toEqual({ week: 3, day: 1, status: 'pending', workoutName: 'שבוע 3' });
      expect(result.source).toBe('program');
    });

    it('a date exactly on startDate: within range, resolves to week 1', () => {
      const result = resolveRunningDayState([], EIGHT_WEEK_PLAN, 1, PROGRAM_START, PROGRAM_START);
      expect(result.isRunDay).toBe(true);
      expect(result.todayEntry).toEqual({ week: 1, day: 1, status: 'pending', workoutName: 'שבוע 1' });
      expect(result.source).toBe('program');
    });

    it('no startDate available at all: falls back to trusting currentWeek, as before (no regression for callers that cannot supply one)', () => {
      const result = resolveRunningDayState([], [PENDING_1, PENDING_2, OTHER_WEEK], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(true);
      expect(result.todayEntry).toBe(PENDING_1);
      expect(result.source).toBe('program');
    });
  });

  describe('no plan at all', () => {
    it('both scheduleDays and schedule empty: no plan at all, pre-existing default state preserved', () => {
      const result = resolveRunningDayState([], [], 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(false);
      expect(result.todayEntry).toBeUndefined();
      expect(result.source).toBe('none');
    });

    it('schedule undefined entirely: same as an empty array, no crash', () => {
      const result = resolveRunningDayState([], undefined, 1, SUNDAY, undefined);
      expect(result.isRunDay).toBe(false);
      expect(result.source).toBe('none');
    });
  });
});
