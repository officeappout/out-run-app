import { describe, expect, it } from 'vitest';
import { compareHeadline, compareRows, previousLabel, stageLabel } from '../period-compare';
import { periodRanges, summarizePeriod, type PeriodSummary } from '../progress-period';
import type { ProgressDay, ProgressWorkout } from '../progress-model';

// Wednesday 21.10.2026 → this week = Sun 18 … Wed 21, previous = Sun 11 … Wed 14.
const NOW = new Date(2026, 9, 21, 12);
const w = (over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout => ({
  id: Math.random().toString(36), kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 0, domainSets: {}, ...over,
});
const day = (date: string, steps: number): ProgressDay => ({ date, steps, stepsGoal: 8000, distanceMeters: 0, activeMinutes: 0 });

function summaries(workouts: ProgressWorkout[], days: ProgressDay[] = [], period: 'week' | 'month' = 'week') {
  const ranges = periodRanges(period, NOW);
  return { ranges, current: summarizePeriod(workouts, days, ranges.current), previous: summarizePeriod(workouts, days, ranges.previous) };
}

describe('compareHeadline', () => {
  it('up: "זזת N% יותר" with minutes now vs before at the same stage', () => {
    const { ranges, current, previous } = summaries([
      w({ date: new Date(2026, 9, 19, 8), minutes: 120 }),
      w({ date: new Date(2026, 9, 12, 8), minutes: 100 }),
      // after the same stage last week → not counted
      w({ date: new Date(2026, 9, 16, 8), minutes: 300 }),
    ]);
    const h = compareHeadline('week', current, previous, ranges, NOW);
    expect(h.tone).toBe('up');
    expect(h.title).toBe('זזת 20% יותר');
    expect(h.detail).toBe('120 דק׳ עד יום ד׳ · בשבוע שעבר 100 דק׳ באותו שלב');
  });

  it('down / flat / new / none', () => {
    const a = summaries([w({ date: new Date(2026, 9, 19), minutes: 75 }), w({ date: new Date(2026, 9, 12), minutes: 100 })]);
    expect(compareHeadline('week', a.current, a.previous, a.ranges, NOW)).toMatchObject({ tone: 'down', title: 'זזת 25% פחות' });
    const b = summaries([w({ date: new Date(2026, 9, 19), minutes: 100 }), w({ date: new Date(2026, 9, 12), minutes: 100 })]);
    expect(compareHeadline('week', b.current, b.previous, b.ranges, NOW)).toMatchObject({ tone: 'flat', title: 'זזת בדיוק כמו בשבוע שעבר' });
    const c = summaries([w({ date: new Date(2026, 9, 19), minutes: 40 })]);
    expect(compareHeadline('week', c.current, c.previous, c.ranges, NOW)).toMatchObject({ tone: 'new', title: 'זזת 40 דק׳' });
    const d = summaries([]);
    expect(compareHeadline('week', d.current, d.previous, d.ranges, NOW).tone).toBe('none');
  });

  it('month labels name the previous month and the day of the month', () => {
    const r = periodRanges('month', NOW);
    expect(previousLabel('month', r.previous)).toBe('בספטמבר');
    expect(stageLabel('month', NOW)).toBe('עד ה-21 בחודש');
    expect(stageLabel('week', NOW)).toBe('עד יום ד׳');
  });
});

describe('compareRows', () => {
  it('one row per activity with something in either period; empty ones dropped', () => {
    const { ranges, current, previous } = summaries(
      [
        w({ date: new Date(2026, 9, 19), minutes: 96 }),
        w({ date: new Date(2026, 9, 12), minutes: 70 }),
        w({ date: new Date(2026, 9, 20), kind: 'run', type: 'running', minutes: 60, km: 11 }),
        w({ date: new Date(2026, 9, 13), kind: 'run', type: 'running', minutes: 60, km: 12 }),
      ],
      [day('2026-10-19', 6000), day('2026-10-12', 5000)],
    );
    const rows = compareRows('week', current, previous, ranges);
    expect(rows.map((r) => r.key)).toEqual(['strength', 'run', 'steps']);
    expect(rows[0]).toMatchObject({ current: 96, previous: 70, currentText: '96′', previousText: '70′' });
    expect(rows[1]).toMatchObject({ current: 11, previous: 12, currentText: '11', previousText: '12' });
    expect(rows[2]).toMatchObject({ label: 'צעדים', current: 6000, previous: 5000 });
  });

  it('month steps are per day (months differ in length)', () => {
    const empty = (steps: number): PeriodSummary => ({
      workouts: 0, minutes: 0, km: 0, steps, activeDays: 0,
      byKind: { strength: { count: 0, minutes: 0, km: 0, sets: 0 }, run: { count: 0, minutes: 0, km: 0, sets: 0 }, walk: { count: 0, minutes: 0, km: 0, sets: 0 }, other: { count: 0, minutes: 0, km: 0, sets: 0 } },
    });
    const ranges = periodRanges('month', NOW); // 21 days each
    const rows = compareRows('month', empty(210_000), empty(105_000), ranges);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: 'steps', label: 'צעדים ליום', current: 10_000, previous: 5_000 });
  });
});
