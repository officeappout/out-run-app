import { describe, it, expect } from 'vitest';
import { resolveRunningDayState } from '../running-day-resolution';

// Pilot O13: "מחר יש ריצה" opened an easy run. The next run day past the plan's week
// boundary must come from the plan's NEXT week, not this week's already-passed run.
// Plan starts Sunday 02.08.2026; runs on Sunday (א) + Thursday (ה).
const START = new Date('2026-08-02T09:00:00');
const W1_EASY = { week: 1, day: 1, status: 'pending' as const, workoutName: 'ריצה קלה' };
const W1_INT = { week: 1, day: 2, status: 'completed' as const, workoutName: 'אינטרוולים' };
const W2_TEMPO = { week: 2, day: 1, status: 'pending' as const, workoutName: 'טמפו' };
const W2_LONG = { week: 2, day: 2, status: 'pending' as const, workoutName: 'ארוכה' };
const PLAN = [W1_EASY, W1_INT, W2_TEMPO, W2_LONG];
const SATURDAY_W1 = new Date('2026-08-08T09:00:00');
const FRIDAY_W1 = new Date('2026-08-07T09:00:00');
const MONDAY_W1 = new Date('2026-08-03T09:00:00');

describe('resolveRunningDayState: next run across the plan week', () => {
  it('Saturday: tomorrow (Sunday) is week 2, day 1, not week 1 easy run', () => {
    const r = resolveRunningDayState(['א', 'ה'], PLAN, 1, SATURDAY_W1, START);
    expect(r.nextEntryDaysAway).toBe(1);
    expect(r.nextEntry).toBe(W2_TEMPO);
  });

  it('by-type placement (enable_home_v2) takes the same week', () => {
    const r = resolveRunningDayState(['א', 'ה'], PLAN, 1, FRIDAY_W1, START, { byType: true });
    expect(r.nextEntryDaysAway).toBe(2);
    expect(r.nextEntry?.week).toBe(2);
  });

  it('inside the same week nothing changes', () => {
    const r = resolveRunningDayState(['א', 'ה'], PLAN, 1, MONDAY_W1, START);
    expect(r.nextEntryDaysAway).toBe(3);
    expect(r.nextEntry).toBe(W1_INT);
  });

  it('past the last plan week: no next run instead of a stale one', () => {
    const r = resolveRunningDayState(['א', 'ה'], [W1_EASY, W1_INT], 1, SATURDAY_W1, START);
    expect(r.nextEntry).toBeUndefined();
  });
});
