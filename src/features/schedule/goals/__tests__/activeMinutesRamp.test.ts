import { describe, expect, it } from 'vitest';
import {
  isWeakWeek,
  rampRate,
  rampSessionMinutes,
  rampStartMinutes,
  walkMinutesToTarget,
  weekIndexFrom,
  weeklyActiveTarget,
  WHO_WEEKLY_ACTIVE_MINUTES,
} from '../activeMinutesRamp';

describe('first-weeks ramp of the weekly active minutes', () => {
  it('levels 1 to 5 start at 75 to 90 minutes', () => {
    expect(rampStartMinutes(1)).toBe(75);
    expect(rampStartMinutes(5)).toBe(90);
    for (let l = 1; l <= 5; l++) {
      expect(weeklyActiveTarget({ level: l, weekIndex: 0 })).toBeGreaterThanOrEqual(75);
      expect(weeklyActiveTarget({ level: l, weekIndex: 0 })).toBeLessThanOrEqual(90);
    }
  });

  it('level 6 and up get the full 150 from week 1', () => {
    expect(weeklyActiveTarget({ level: 6, weekIndex: 0 })).toBe(WHO_WEEKLY_ACTIVE_MINUTES);
    expect(weeklyActiveTarget({ level: 14, weekIndex: 0 })).toBe(150);
  });

  it('grows 10% to 20% a week and reaches 150 within 6 to 8 weeks', () => {
    for (const level of [1, 3, 5]) {
      const rate = rampRate(rampStartMinutes(level));
      expect(rate).toBeGreaterThanOrEqual(0.1);
      expect(rate).toBeLessThanOrEqual(0.2);
      const weeks = Array.from({ length: 9 }, (_, w) => weeklyActiveTarget({ level, weekIndex: w }));
      for (let w = 1; w < weeks.length; w++) expect(weeks[w]).toBeGreaterThanOrEqual(weeks[w - 1]);
      const firstFull = weeks.findIndex((m) => m >= 150);
      expect(firstFull + 1).toBeGreaterThanOrEqual(6);
      expect(firstFull + 1).toBeLessThanOrEqual(8);
      expect(Math.max(...weeks)).toBe(150);
    }
  });

  it('holds after a weak week (no raise)', () => {
    const normal = weeklyActiveTarget({ level: 2, weekIndex: 2 });
    const held = weeklyActiveTarget({ level: 2, weekIndex: 2, weakWeeks: [1] });
    expect(held).toBe(weeklyActiveTarget({ level: 2, weekIndex: 1 }));
    expect(held).toBeLessThan(normal);
  });

  it('weak week = below 70% of its target', () => {
    expect(isWeakWeek(50, 80)).toBe(true);
    expect(isWeakWeek(60, 80)).toBe(false);
  });

  it('week-1 sessions are 15 to 20 minutes for levels 1 to 5, the choice for 6+', () => {
    expect(rampSessionMinutes(45, { level: 1, weekIndex: 0 })).toBe(15);
    expect(rampSessionMinutes(45, { level: 4, weekIndex: 0 })).toBe(20);
    expect(rampSessionMinutes(20, { level: 4, weekIndex: 0 })).toBe(20);
    expect(rampSessionMinutes(45, { level: 7, weekIndex: 0 })).toBe(45);
    // grows with the target, never above the choice
    expect(rampSessionMinutes(45, { level: 4, weekIndex: 8 })).toBeGreaterThan(20);
    expect(rampSessionMinutes(30, { level: 4, weekIndex: 8 })).toBe(30);
  });

  it('walking fills the rest of the target', () => {
    expect(walkMinutesToTarget(75, 45)).toBe(30);
    expect(walkMinutesToTarget(75, 120)).toBe(0);
  });

  it('week index from the program start', () => {
    const now = new Date('2026-10-27T10:00:00');
    expect(weekIndexFrom(null, now)).toBe(0);
    expect(weekIndexFrom(new Date('2026-10-25T10:00:00'), now)).toBe(0);
    expect(weekIndexFrom(new Date('2026-10-13T10:00:00'), now)).toBe(2);
    expect(weekIndexFrom(new Date('2026-11-13T10:00:00'), now)).toBe(0);
  });
});
