import { describe, expect, it } from 'vitest';
import {
  freeDays, initialDays, lastFreeDay, nextFreeDay, setDayTime, tapWindow, timeOfChoice, toggleDay,
} from '../model/days';
import { groupLevelsOf, runSlotsFor, runsPerWeekOf } from '../model/profileInputs';

describe('ל3 days state', () => {
  it('toggles a day on with the fallback window and off again', () => {
    const s1 = toggleDay({}, 3, 'morning');
    expect(s1).toEqual({ 3: { window: 'morning' } });
    expect(toggleDay(s1, 3, 'morning')).toEqual({});
  });

  it('a new window replaces the window and clears the exact time; the same window asks for an exact time', () => {
    const s = { 1: { window: 'morning' as const, time: '07:30' } };
    expect(tapWindow(s, 1, 'evening')).toEqual({ state: { 1: { window: 'evening' } }, editTime: false });
    expect(tapWindow(s, 1, 'morning')).toEqual({ state: s, editTime: true });
    expect(tapWindow(s, 2, 'morning')).toEqual({ state: s, editTime: false });
  });

  it('exact time for one day only; invalid clears it', () => {
    const s = initialDays([0, 1], 'morning');
    const t = setDayTime(s, 0, '07:30');
    expect(t[0]).toEqual({ window: 'morning', time: '07:30' });
    expect(t[1]).toEqual({ window: 'morning' });
    expect(timeOfChoice(t[0]!)).toBe('07:30');
    expect(timeOfChoice(t[1]!)).toBe('07:00');
    expect(setDayTime(t, 0, '')[0]).toEqual({ window: 'morning' });
    expect(setDayTime(t, 0, '25:00')[0]).toEqual({ window: 'morning' });
  });

  it('free days, last free day and the long-run cycle', () => {
    const s = initialDays([4, 0, 2], 'evening');
    expect(freeDays(s)).toEqual([0, 2, 4]);
    expect(lastFreeDay(s)).toBe(4);
    expect(nextFreeDay(s, 4)).toBe(0);
    expect(nextFreeDay(s, 0)).toBe(2);
    expect(nextFreeDay({}, 1)).toBeNull();
  });
});

describe('profile inputs', () => {
  it('group levels: max of track and domain, missing groups filled from the others', () => {
    expect(groupLevelsOf({ tracks: { push: { currentLevel: 6 } }, domains: { push: { currentLevel: 8 }, pull: { level: 4 } } }))
      .toEqual({ push: 8, pull: 4, legs: 6 });
    expect(groupLevelsOf(null)).toEqual({ push: 1, pull: 1, legs: 1 });
  });

  it('runs a week and their slots', () => {
    expect(runsPerWeekOf({ scheduleDays: ['א', 'ג'] })).toBe(2);
    expect(runsPerWeekOf(null)).toBe(3);
    expect(runSlotsFor(3)).toEqual(['quality_primary', 'quality_secondary', 'long_run']);
    expect(runSlotsFor(9)).toHaveLength(4);
  });
});
