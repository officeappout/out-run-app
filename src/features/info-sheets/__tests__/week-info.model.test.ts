import { describe, it, expect } from 'vitest';
import { buildWeekInfo, type WeekInfoDayInput } from '../week/week-info.model';

const LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
/** today = dow; `plan` = planned dows; `done` = done dows. */
const week = (today: number, plan: number[], done: number[] = []): WeekInfoDayInput[] =>
  LETTERS.map((letter, dow) => ({
    dow,
    letter,
    date: dow + 1,
    planned: plan.includes(dow),
    done: done.includes(dow),
    past: dow < today,
  }));

describe('buildWeekInfo (board DragCard as corrected: the week builder flow)', () => {
  it('moves the first session ahead to the next free day after it', () => {
    const m = buildWeekInfo(week(0, [0, 2, 4], [0]))!;
    // Sunday done; Tuesday is the first session ahead; Wednesday is free.
    expect(m.move).toEqual({ fromDow: 2, toDow: 3 });
    expect(m.rows.map((r) => r.dow)).toEqual([0, 1, 2, 3]);
    expect(m.rows[0]).toMatchObject({ hasSession: true, done: true });
  });

  it('today counts when its session is not done yet', () => {
    expect(buildWeekInfo(week(3, [3, 5]))!.move).toEqual({ fromDow: 3, toDow: 4 });
  });

  it('skips over back-to-back sessions to the first free day', () => {
    const m = buildWeekInfo(week(1, [1, 2, 3]))!;
    expect(m.move).toEqual({ fromDow: 1, toDow: 4 });
    expect(m.rows.map((r) => r.dow)).toEqual([1, 2, 3, 4]);
  });

  it('never moves a past or done session', () => {
    const m = buildWeekInfo(week(4, [1, 2, 4], [4]))!;
    // Monday / Tuesday are past, Thursday is done → nothing ahead to move.
    expect(m.move).toBeNull();
  });

  it('fallback: a full week ahead → no move, today and the next days', () => {
    const m = buildWeekInfo(week(2, [2, 3, 4, 5, 6]))!;
    expect(m.move).toBeNull();
    expect(m.rows.map((r) => r.dow)).toEqual([2, 3, 4, 5]);
  });

  it('fallback: late in the week the rows end on Saturday', () => {
    expect(buildWeekInfo(week(6, []))!.rows.map((r) => r.dow)).toEqual([3, 4, 5, 6]);
  });

  it('not a 7-day week → no "i"', () => {
    expect(buildWeekInfo(week(0, [1]).slice(0, 5))).toBeNull();
  });
});
