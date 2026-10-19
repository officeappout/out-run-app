import { describe, it, expect } from 'vitest';
import { mapRunEntriesToWeekdays, runOverlayDayFields } from '../run-overlay-day';

const DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

describe('runOverlayDayFields', () => {
  it('no run → the strength day as is', () => {
    expect(runOverlayDayFields(true, undefined)).toEqual({ isRest: true });
    expect(runOverlayDayFields(false, undefined)).toEqual({ isRest: false });
  });
  it('strength day + run → unchanged (the run joins the planned sessions)', () => {
    expect(runOverlayDayFields(false, { category: 'tempo' })).toEqual({ isRest: false });
  });
  it('run-only day → a training day with the run icon', () => {
    expect(runOverlayDayFields(true, { category: 'tempo' })).toEqual({ isRest: false, runningCategory: 'tempo' });
    expect(runOverlayDayFields(true, {})).toEqual({ isRest: false, runningCategory: 'easy_run' });
  });
});

describe('mapRunEntriesToWeekdays', () => {
  it('maps 1-based slots onto the sorted run weekdays', () => {
    const e1 = { day: 1, id: 'a' };
    const e2 = { day: 2, id: 'b' };
    const e3 = { day: 3, id: 'c' };
    const m = mapRunEntriesToWeekdays([e1, e2, e3], ['ה', 'ב'], DAYS);
    expect(m.get(1)).toBe(e1); // Monday
    expect(m.get(4)).toBe(e2); // Thursday
    expect(m.size).toBe(2); // slot 3 has no day
  });
});
