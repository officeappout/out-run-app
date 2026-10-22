import { describe, it, expect } from 'vitest';
import {
  ARRIVAL_WINDOW_MIN,
  arrivalDayOptions,
  arrivalHourOptions,
  arrivalMinuteOptions,
  arrivalRangeMinutes,
  arrivalStart,
  arrivalWindow,
  ceilToStep,
  defaultArrival,
  earliestArrival,
  normalizeArrival,
} from '../arrival-wheel-logic';
import { resolveArrivalWindow } from '../../park-detail/utils/park-detail-logic';

const at = (h: number, m: number, s = 0) => new Date(2026, 9, 21, h, m, s);

describe('arrival wheel — default slot', () => {
  it('next 15-min slot ≥ now + 15 min', () => {
    expect(defaultArrival(at(17, 0))).toEqual({ day: 0, hour: 17, minute: 15 });
    expect(defaultArrival(at(17, 1))).toEqual({ day: 0, hour: 17, minute: 30 });
    expect(defaultArrival(at(17, 0, 30))).toEqual({ day: 0, hour: 17, minute: 30 });
    expect(defaultArrival(at(17, 50))).toEqual({ day: 0, hour: 18, minute: 15 });
  });
  it('late night rolls to tomorrow, and today drops off the wheel', () => {
    expect(defaultArrival(at(23, 50))).toEqual({ day: 1, hour: 0, minute: 15 });
    expect(arrivalDayOptions(at(23, 50))).toEqual([1]);
    expect(arrivalDayOptions(at(12, 0))).toEqual([0, 1]);
  });
});

describe('arrival wheel — step rounding', () => {
  it('ceilToStep keeps steps and rounds up between them', () => {
    expect(ceilToStep(60)).toBe(60);
    expect(ceilToStep(61)).toBe(75);
    expect(ceilToStep(74)).toBe(75);
  });
  it('normalize rounds the minute up to the step', () => {
    expect(normalizeArrival({ day: 1, hour: 9, minute: 7 }, at(12, 0))).toEqual({ day: 1, hour: 9, minute: 15 });
    expect(normalizeArrival({ day: 1, hour: 9, minute: 50 }, at(12, 0))).toEqual({ day: 1, hour: 10, minute: 0 });
  });
});

describe('arrival wheel — past times excluded', () => {
  const now = at(17, 20); // earliest 17:45
  it('earliest is never in the past', () => {
    expect(earliestArrival(now).getTime()).toBeGreaterThan(now.getTime());
  });
  it('today hours start at the earliest hour; tomorrow has all 24', () => {
    expect(arrivalHourOptions(0, now)[0]).toBe(17);
    expect(arrivalHourOptions(0, now).at(-1)).toBe(23);
    expect(arrivalHourOptions(1, now)).toHaveLength(24);
  });
  it('minutes in the earliest hour start at the earliest slot', () => {
    expect(arrivalMinuteOptions(0, 17, now)).toEqual([45]);
    expect(arrivalMinuteOptions(0, 18, now)).toEqual([0, 15, 30, 45]);
    expect(arrivalMinuteOptions(1, 17, now)).toEqual([0, 15, 30, 45]);
  });
  it('a past selection snaps to the earliest slot', () => {
    expect(normalizeArrival({ day: 0, hour: 9, minute: 0 }, now)).toEqual({ day: 0, hour: 17, minute: 45 });
    expect(normalizeArrival({ day: 0, hour: 17, minute: 30 }, now)).toEqual({ day: 0, hour: 17, minute: 45 });
  });
  it('switching to tomorrow keeps an early hour', () => {
    expect(normalizeArrival({ day: 1, hour: 6, minute: 0 }, now)).toEqual({ day: 1, hour: 6, minute: 0 });
  });
});

describe('arrival wheel — publish payload', () => {
  const now = at(12, 0);
  it('same startTime/endTime as today\'s slider path for the same window', () => {
    for (const sel of [{ day: 0 as const, hour: 17, minute: 0 }, { day: 1 as const, hour: 7, minute: 45 }]) {
      const wheel = arrivalWindow(sel, now);
      const legacy = resolveArrivalWindow(sel.day === 0 ? 'today' : 'tomorrow', '', arrivalRangeMinutes(sel), now);
      expect(legacy.ok).toBe(true);
      if (!legacy.ok) return;
      expect(wheel.startTime.getTime()).toBe(legacy.startTime.getTime());
      expect(wheel.endTime.getTime()).toBe(legacy.endTime.getTime());
    }
  });
  it('the default 17:00 pick writes the old default 17:00–19:00 window', () => {
    const { startTime, endTime } = arrivalWindow({ day: 0, hour: 17, minute: 0 }, now);
    expect([startTime.getHours(), startTime.getMinutes()]).toEqual([17, 0]);
    expect((endTime.getTime() - startTime.getTime()) / 60000).toBe(ARRIVAL_WINDOW_MIN);
    expect([endTime.getHours(), endTime.getMinutes()]).toEqual([19, 0]);
  });
  it('tomorrow is the next calendar day', () => {
    expect(arrivalStart({ day: 1, hour: 8, minute: 0 }, now).getDate()).toBe(22);
  });
});
