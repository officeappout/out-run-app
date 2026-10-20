import { describe, expect, it } from 'vitest';
import { kindOfWorkoutType, setsFromDoc, toProgressDay, toProgressWorkout, type ProgressWorkout } from '../progress-model';
import { longestActiveRun, monthCells, periodRanges, summarizePeriod, weekCells } from '../progress-period';
import { domainBreakdown, monthCompare, paceOf, paceSeries, stepsStats, weeklySeries } from '../progress-series';
import { formatMinutes, formatPace, relativeDay, weekRangeLabel } from '../progress-format';
import { runningPlanProgress } from '../running-plan-progress';

// Wednesday 21.10.2026, noon local
const NOW = new Date(2026, 9, 21, 12);

function w(over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout {
  return { id: Math.random().toString(36), kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 10, domainSets: {}, ...over };
}

describe('progress-model', () => {
  it('maps workout types to lenses', () => {
    expect(kindOfWorkoutType('running')).toBe('run');
    expect(kindOfWorkoutType('walking')).toBe('walk');
    expect(kindOfWorkoutType('hybrid')).toBe('strength');
    expect(kindOfWorkoutType('recovery')).toBe('other');
  });

  it('counts sets from setsCompleted, else the exercise log, with domains', () => {
    const segs = [{ actual: { exerciseLog: [{ confirmedReps: [8, 8, 7], domain: 'pull' }, { confirmedReps: [10, 9], domain: 'push' }] } }];
    expect(setsFromDoc({ segments: segs })).toEqual({ sets: 5, domainSets: { pull: 3, push: 2 } });
    expect(setsFromDoc({ setsCompleted: 12, segments: segs }).sets).toBe(12);
    expect(setsFromDoc({})).toEqual({ sets: 0, domainSets: {} });
  });

  it('drops docs without a date and never keeps routePath', () => {
    expect(toProgressWorkout('a', { workoutType: 'running' })).toBeNull();
    const r = toProgressWorkout('b', { workoutType: 'running', date: { seconds: NOW.getTime() / 1000 }, duration: 1800, distance: 5, pace: 6, routePath: [[1, 2]] });
    expect(r).toMatchObject({ kind: 'run', minutes: 30, km: 5, pace: 6 });
    expect(r).not.toHaveProperty('routePath');
  });

  it('sums category minutes on a day doc', () => {
    expect(toProgressDay({ date: '2026-10-21', steps: 5000, categories: { strength: { minutes: 20 }, cardio: { minutes: 10 } } }, 8000)).toEqual({
      date: '2026-10-21',
      steps: 5000,
      stepsGoal: 8000,
      distanceMeters: 0,
      activeMinutes: 30,
    });
  });
});

describe('periodRanges', () => {
  it('week = Sunday→today vs the same days last week', () => {
    const r = periodRanges('week', NOW);
    expect(r.current.startISO).toBe('2026-10-18');
    expect(r.current.endISO).toBe('2026-10-21');
    expect(r.previous.startISO).toBe('2026-10-11');
    expect(r.previous.endISO).toBe('2026-10-14');
  });

  it('month = 1st→today vs last month at the same stage (clamped)', () => {
    const r = periodRanges('month', NOW);
    expect(r.current.startISO).toBe('2026-10-01');
    expect(r.previous).toMatchObject({ startISO: '2026-09-01', endISO: '2026-09-21' });
    const mar31 = periodRanges('month', new Date(2026, 2, 31));
    expect(mar31.previous.endISO).toBe('2026-02-28');
  });
});

describe('summarizePeriod', () => {
  it('splits by activity and compares windows', () => {
    const ws = [
      w({ date: new Date(2026, 9, 19, 8), kind: 'strength', minutes: 40, sets: 20 }),
      w({ date: new Date(2026, 9, 20, 8), kind: 'run', type: 'running', minutes: 30, km: 5.2, sets: 0 }),
      w({ date: new Date(2026, 9, 21, 7), kind: 'walk', type: 'walking', minutes: 20, km: 1.9, sets: 0 }),
      w({ date: new Date(2026, 9, 12, 8), kind: 'run', type: 'running', minutes: 25, km: 4, sets: 0 }),
    ];
    const days = [{ date: '2026-10-20', steps: 9000, stepsGoal: 8000, distanceMeters: 0, activeMinutes: 30 }];
    const r = periodRanges('week', NOW);
    const cur = summarizePeriod(ws, days, r.current);
    expect(cur).toMatchObject({ workouts: 3, minutes: 90, km: 7.1, steps: 9000, activeDays: 3 });
    expect(cur.byKind.strength.sets).toBe(20);
    expect(summarizePeriod(ws, days, r.previous)).toMatchObject({ workouts: 1, km: 4 });
  });

  it('builds the 7-day strip and month calendar', () => {
    const ws = [w({ date: new Date(2026, 9, 19) }), w({ date: new Date(2026, 9, 20), kind: 'run' })];
    const cells = weekCells(ws, [], NOW);
    expect(cells).toHaveLength(7);
    expect(cells[1].tones).toEqual(['strength']);
    expect(cells[2].tones).toEqual(['cardio']);
    expect(cells[3].isToday).toBe(true);
    expect(cells[4].isFuture).toBe(true);
    const m = monthCells(ws, [], NOW);
    expect(m.lead).toBe(4); // 1.10.2026 is a Thursday
    expect(m.cells).toHaveLength(31);
    expect(longestActiveRun(m.cells)).toBe(2);
  });
});

describe('series', () => {
  it('weekly buckets end with "השבוע"', () => {
    const ws = [w({ date: new Date(2026, 9, 20), km: 5 }), w({ date: new Date(2026, 9, 13), km: 3 })];
    const s = weeklySeries(ws, 'km', NOW);
    expect(s).toHaveLength(8);
    expect(s[7]).toMatchObject({ key: 'now', label: 'השבוע', value: 5 });
    expect(s[6].value).toBe(3);
  });

  it('pace is plotted as speed and read back as min/km', () => {
    const p = paceSeries([w({ date: NOW, pace: 6 }), w({ date: NOW, pace: 0 })]);
    expect(p).toHaveLength(1);
    expect(p[0].value).toBe(10);
    expect(paceOf(10)).toBe(6);
  });

  it('month compare and domains', () => {
    const ws = [
      w({ date: new Date(2026, 9, 3), km: 5, pace: 6, minutes: 30 }),
      w({ date: new Date(2026, 8, 3), km: 4, pace: 6, minutes: 24 }),
      w({ date: new Date(2026, 8, 25), km: 9 }),
    ];
    const c = monthCompare(ws, NOW);
    expect(c.current.km).toBe(5);
    expect(c.previous.km).toBe(4);
    expect(c.current.pace).toBe(6);
    expect(domainBreakdown([w({ date: new Date(2026, 9, 20), domainSets: { pull: 4, push: 6 } })], NOW)).toEqual([
      { domain: 'push', label: 'דחיפה', sets: 6 },
      { domain: 'pull', label: 'משיכה', sets: 4 },
    ]);
  });

  it('steps stats: averages, best, goal streak skips an unfinished today', () => {
    const d = (date: string, steps: number) => ({ date, steps, stepsGoal: 8000, distanceMeters: 1000, activeMinutes: 0 });
    const s = stepsStats([d('2026-10-12', 4000), d('2026-10-18', 9000), d('2026-10-19', 8500), d('2026-10-20', 10000), d('2026-10-21', 2000)], NOW, 8000);
    expect(s.weekAvg).toBe(Math.round((9000 + 8500 + 10000 + 2000) / 4));
    expect(s.prevWeekAvg).toBe(4000);
    expect(s.best).toEqual({ steps: 10000, date: '2026-10-20' });
    expect(s.goalStreak).toBe(3);
    expect(s.daysInGoal).toBe(3);
    expect(s.today).toBe(2000);
    expect(s.chart).toHaveLength(5);
  });
});

describe('format', () => {
  it('formats', () => {
    expect(formatPace(5.7)).toBe('5:42');
    expect(formatMinutes(214)).toEqual({ value: '214', unit: 'דק׳' });
    expect(formatMinutes(760)).toEqual({ value: '12:40', unit: 'שע׳' });
    expect(relativeDay(new Date(2026, 9, 20), NOW)).toBe('אתמול');
    expect(weekRangeLabel(new Date(2026, 9, 18), new Date(2026, 9, 24))).toBe('18–24 באוק׳');
  });
});

describe('runningPlanProgress', () => {
  it('reads week X of Y and sessions done', () => {
    const schedule = [1, 1, 2, 2, 3, 3, 4, 4].map((week, i) => ({ week, status: i < 3 ? 'completed' : 'pending' }));
    const p = runningPlanProgress({ activeProgram: { currentWeek: 2, schedule }, generatedProgramTemplate: { targetDistance: '5k', canonicalWeeks: 8 } });
    expect(p).toMatchObject({ title: 'תוכנית 5 ק״מ', weeks: 8, currentWeek: 2, done: 3, dueSoFar: 4 });
    expect(runningPlanProgress({})).toBeNull();
  });
});
