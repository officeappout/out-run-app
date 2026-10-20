import { describe, expect, it } from 'vitest';
import type { ProgressDay, ProgressWorkout } from '../progress-model';
import { consistencyDays, missedLine, reasonCounts } from '../consistency-days';
import { activitySplit, periodSpark } from '../period-spark';
import { periodRanges, summarizePeriod } from '../progress-period';

// Wednesday 21.10.2026, noon local
const NOW = new Date(2026, 9, 21, 12);

function w(over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout {
  return { id: Math.random().toString(36), kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 10, domainSets: {}, ...over };
}
function day(date: string, over: Partial<ProgressDay> = {}): ProgressDay {
  return { date, steps: 0, stepsGoal: 8000, distanceMeters: 0, activeMinutes: 0, ...over };
}

describe('consistencyDays (P-7)', () => {
  const workouts = [
    w({ date: new Date(2026, 9, 21, 8), kind: 'run', type: 'running', minutes: 32, km: 5.1 }),
    w({ date: new Date(2026, 9, 20, 18), minutes: 48 }),
    w({ date: new Date(2026, 9, 18, 7), kind: 'walk', type: 'walking', minutes: 40, km: 3.4 }),
  ];
  const days = [
    day('2026-10-20', { steps: 11240, activeMinutes: 48 }),
    day('2026-10-19', { steps: 6100, activeMinutes: 6 }),
    day('2026-10-17', { activeMinutes: 15, minutesByCategory: { strength: 0, cardio: 0, maintenance: 15 } }),
    day('2026-10-16', { activeMinutes: 22, minutesByCategory: { strength: 0, cardio: 22, maintenance: 0 } }),
  ];
  const list = consistencyDays(workouts, days, new Date(2026, 9, 15), NOW);

  it('lists from start through today, newest first', () => {
    expect(list.map((d) => d.iso)).toEqual(['2026-10-21', '2026-10-20', '2026-10-19', '2026-10-18', '2026-10-17', '2026-10-16', '2026-10-15']);
    expect(list[0].isToday).toBe(true);
  });

  it('a workout day counts, with its reason', () => {
    expect(list[0]).toMatchObject({ counted: true, tones: ['cardio'] });
    expect(list[0].reasons).toEqual([{ reason: 'run', text: 'ריצה · 5.1 ק״מ' }]);
  });

  it('two reasons: strength + steps goal, minutes not double-counted', () => {
    expect(list[1].reasons.map((r) => r.reason)).toEqual(['strength', 'steps']);
    expect(list[1].tones).toEqual(['strength', 'steps']);
    expect(list[1].minutes).toBe(48);
  });

  it('a short day without the steps goal does not count and says what was missing', () => {
    expect(list[2].counted).toBe(false);
    expect(list[2].reasons).toEqual([]);
    expect(missedLine(list[2])).toBe('6 דק׳ פעילות · 6,100 מתוך 8,000 צעדים');
  });

  it('walk, recovery and plain active minutes', () => {
    expect(list[3].reasons[0]).toEqual({ reason: 'walk', text: 'הליכה · 3.4 ק״מ' });
    expect(list[3].tones).toEqual(['steps']);
    expect(list[4].reasons).toEqual([{ reason: 'recovery', text: 'התאוששות · 15 דק׳' }]);
    expect(list[4].tones).toEqual(['maintenance']);
    expect(list[5].reasons).toEqual([{ reason: 'active', text: 'דקות פעילות · 22' }]);
    expect(list[6].counted).toBe(false);
  });

  it('steps goal alone counts (streak-rules steps rule)', () => {
    const [d] = consistencyDays([], [day('2026-10-21', { steps: 9000, stepsGoal: 8000, activeMinutes: 3 })], new Date(2026, 9, 21), NOW);
    expect(d.counted).toBe(true);
    expect(d.reasons).toEqual([{ reason: 'steps', text: 'יעד צעדים · 9,000' }]);
  });

  it('counts reasons over the list', () => {
    expect(reasonCounts(list)).toEqual([
      { reason: 'strength', count: 1 },
      { reason: 'run', count: 1 },
      { reason: 'walk', count: 1 },
      { reason: 'steps', count: 1 },
      { reason: 'recovery', count: 1 },
      { reason: 'active', count: 1 },
    ]);
  });
});

describe('periodSpark + activitySplit (P-1c)', () => {
  const workouts = [
    w({ date: new Date(2026, 9, 18, 9), minutes: 40 }),
    w({ date: new Date(2026, 9, 20, 9), kind: 'run', type: 'running', minutes: 30, km: 5 }),
    w({ date: new Date(2026, 9, 20, 19), kind: 'walk', type: 'walking', minutes: 20, km: 2 }),
    w({ date: new Date(2026, 9, 11, 9) }), // last week — outside the current range
  ];
  const days = [day('2026-10-18', { steps: 4000 }), day('2026-10-21', { steps: 7000 }), day('2026-10-12', { steps: 9999 })];

  it('week: 7 buckets Sunday → Saturday, today highlighted', () => {
    const r = periodRanges('week', NOW);
    const s = periodSpark('week', r.current, workouts, days, NOW);
    expect(s.workouts).toEqual([1, 0, 2, 0, 0, 0, 0]);
    expect(s.km).toEqual([0, 0, 7, 0, 0, 0, 0]);
    expect(s.steps).toEqual([4000, 0, 0, 7000, 0, 0, 0]);
    expect(s.todayIndex).toBe(3);
  });

  it('month: one bucket per calendar row', () => {
    const r = periodRanges('month', NOW);
    const s = periodSpark('month', r.current, workouts, days, NOW);
    // October 2026 starts on a Thursday → 5 rows; the 11th, 18th and 21st are rows 2, 3, 3.
    expect(s.workouts.length).toBe(5);
    expect(s.workouts).toEqual([0, 0, 1, 3, 0]);
    expect(s.todayIndex).toBe(3);
  });

  it('split: minutes per activity, biggest first, empty kinds dropped', () => {
    const r = periodRanges('week', NOW);
    const sum = summarizePeriod(workouts, days, r.current);
    expect(activitySplit(sum)).toEqual([
      { kind: 'strength', minutes: 40, count: 1 },
      { kind: 'run', minutes: 30, count: 1 },
      { kind: 'walk', minutes: 20, count: 1 },
    ]);
  });
});
