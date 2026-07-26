import { describe, it, expect } from 'vitest';
import {
  computeBaseLevel,
  computeDailyStrengthTarget,
  isTodayTrainingDay,
} from '../dailyStrengthTarget';

/**
 * Daily Strength Ring · Layer A — stable daily target derivation.
 * Pins: stability (pure of completed sets), level-driven scaling, fallback,
 * and the rest/off-day closure (target 0, recovery mode).
 */

describe('computeBaseLevel', () => {
  it('max across tracks + domains, min 1', () => {
    expect(computeBaseLevel({ push: { currentLevel: 5 } }, { legs: { currentLevel: 8 } })).toBe(8);
    expect(computeBaseLevel(undefined, undefined)).toBe(1);
    expect(computeBaseLevel({ a: {} }, {})).toBe(1);
  });
});

describe('isTodayTrainingDay', () => {
  // 2026-07-19 is a Sunday → Hebrew letter 'א'.
  const SUN = new Date('2026-07-19T12:00:00');
  const MON = new Date('2026-07-20T12:00:00');

  it('training when the day letter is in scheduleDays', () => {
    expect(isTodayTrainingDay(['א', 'ג'], undefined, SUN)).toBe(true);
    expect(isTodayTrainingDay(['א', 'ג'], undefined, MON)).toBe(false);
  });

  it('training when recurringTemplate has programs for the day', () => {
    expect(isTodayTrainingDay([], { 'א': ['UPPER'] }, SUN)).toBe(true);
    expect(isTodayTrainingDay([], { 'א': [] }, SUN)).toBe(false);
  });

  it('rest/off day when neither source lists the day', () => {
    expect(isTodayTrainingDay(['ב'], { 'ג': ['X'] }, SUN)).toBe(false);
    expect(isTodayTrainingDay(undefined, undefined, SUN)).toBe(false);
  });
});

describe('computeDailyStrengthTarget', () => {
  it('training day → ceil(weekly / days)', () => {
    const t = computeDailyStrengthTarget({ weeklyTarget: 12, scheduleDays: 3, isRestDay: false, source: 'lead' });
    expect(t.targetSets).toBe(4);
    expect(t.source).toBe('lead');
    expect(t.scheduleDays).toBe(3);
  });

  it('ceils partial division', () => {
    expect(computeDailyStrengthTarget({ weeklyTarget: 16, scheduleDays: 3, isRestDay: false, source: 'lead' }).targetSets).toBe(6); // 16/3 = 5.33 → 6
  });

  it('rest/off day → targetSets 0', () => {
    const t = computeDailyStrengthTarget({ weeklyTarget: 12, scheduleDays: 3, isRestDay: true, source: 'lead' });
    expect(t.targetSets).toBe(0);
    expect(t.isRestDay).toBe(true);
  });

  it('stable / pure of completed sets: same inputs → same output', () => {
    const a = computeDailyStrengthTarget({ weeklyTarget: 12, scheduleDays: 3, isRestDay: false, source: 'lead' });
    const b = computeDailyStrengthTarget({ weeklyTarget: 12, scheduleDays: 3, isRestDay: false, source: 'lead' });
    expect(a).toEqual(b);
  });

  it('level-up raises the target (higher weekly → higher daily)', () => {
    const before = computeDailyStrengthTarget({ weeklyTarget: 8, scheduleDays: 3, isRestDay: false, source: 'lead' }).targetSets;
    const after = computeDailyStrengthTarget({ weeklyTarget: 16, scheduleDays: 3, isRestDay: false, source: 'lead' }).targetSets;
    expect(after).toBeGreaterThan(before);
  });

  it('scheduleDays 0 → floored to 1 (no divide-by-zero)', () => {
    const t = computeDailyStrengthTarget({ weeklyTarget: 10, scheduleDays: 0, isRestDay: false, source: 'fallback' });
    expect(t.scheduleDays).toBe(1);
    expect(t.targetSets).toBe(10);
  });
});
