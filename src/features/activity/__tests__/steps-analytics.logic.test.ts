import { describe, it, expect } from 'vitest';
import {
  shiftDateKey,
  sameDayLastWeekSteps,
  bucketTooltipLabel,
  currentBucketKey,
  deriveStepsChartData,
} from '../lib/steps-analytics.logic';
import type { DailyStepsSnapshot } from '../services/activity-history.service';

function snap(date: string, steps: number): DailyStepsSnapshot {
  return {
    date,
    steps,
    floors: 0,
    stepsGoalMet: steps >= 8000,
    floorsGoalMet: false,
    stepsGoal: 8000,
    floorsGoal: 3,
  } as DailyStepsSnapshot;
}

describe('shiftDateKey', () => {
  it('crosses month and year boundaries', () => {
    expect(shiftDateKey('2026-10-03', -7)).toBe('2026-09-26');
    expect(shiftDateKey('2026-01-02', -7)).toBe('2025-12-26');
  });
  it('rejects garbage', () => {
    expect(shiftDateKey('nope', -7)).toBeNull();
  });
});

describe('sameDayLastWeekSteps', () => {
  it('finds the baseline by date even when history has gaps', () => {
    // 2026-10-09 is missing → an index-based "7 back" would land on the wrong day.
    const snaps = [
      snap('2026-10-08', 5310),
      snap('2026-10-10', 1),
      snap('2026-10-11', 2),
      snap('2026-10-12', 3),
      snap('2026-10-13', 4),
      snap('2026-10-14', 5),
      snap('2026-10-15', 6420),
    ];
    expect(sameDayLastWeekSteps(snaps, '2026-10-15')).toBe(5310);
  });
  it('returns null when the day is not loaded', () => {
    expect(sameDayLastWeekSteps([snap('2026-10-15', 100)], '2026-10-15')).toBeNull();
    expect(sameDayLastWeekSteps([], undefined)).toBeNull();
  });
});

describe('bucketTooltipLabel', () => {
  it('formats day keys with the full weekday', () => {
    expect(bucketTooltipLabel('2026-10-15')).toBe('יום חמישי · 15/10');
  });
  it('formats month keys with the year', () => {
    expect(bucketTooltipLabel('2026-10')).toBe('אוק׳ 2026');
  });
});

describe('currentBucketKey + chart keys line up', () => {
  it('day keys for day ranges, month key for year', () => {
    const now = new Date(2026, 9, 15, 12);
    expect(currentBucketKey('week', now)).toBe('2026-10-15');
    expect(currentBucketKey('year', now)).toBe('2026-10');
    const year = deriveStepsChartData([snap('2026-10-15', 10)], 'year', now);
    expect(year[year.length - 1].key).toBe('2026-10');
    const week = deriveStepsChartData([snap('2026-10-15', 10)], 'week', now);
    expect(week[0].key).toBe('2026-10-15');
  });
});
