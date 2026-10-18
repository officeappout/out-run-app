import { describe, it, expect } from 'vitest';
import { buildFreshWeekRunningProgram, resolveResumeWeek, calmRunWorkout, type CalmRunBlock } from '../running';
import { CALM_LOADS, NO_CHANGE_LOAD } from '../policy';
import { calculateCurrentWeek } from '@/lib/running-current-week';

const NOW = new Date(2026, 9, 18, 9, 0);

const schedule = [
  { week: 1, day: 1, workoutId: 'a', status: 'completed', actualPerformance: { avgPace: 1, completionRate: 1 } },
  { week: 1, day: 2, workoutId: 'b', status: 'completed' },
  { week: 2, day: 1, workoutId: 'c', status: 'completed' },
  { week: 2, day: 2, workoutId: 'd', status: 'skipped' },
  { week: 3, day: 1, workoutId: 'e', status: 'skipped' },
  { week: 3, day: 2, workoutId: 'f', status: 'pending' },
  { week: 4, day: 1, workoutId: 'g', status: 'pending' },
];

describe('buildFreshWeekRunningProgram — silent fresh week, position kept, no backlog', () => {
  it('resumes the week the user had reached (first unfinished week from the last completed one)', () => {
    expect(resolveResumeWeek(schedule)).toBe(2);
    expect(resolveResumeWeek([])).toBe(1);
    expect(resolveResumeWeek([{ week: 1, day: 1, status: 'skipped' }])).toBe(1);
    expect(resolveResumeWeek([{ week: 1, day: 1, status: 'completed' }, { week: 2, day: 1, status: 'pending' }])).toBe(2);
  });

  it('the resumed week starts TODAY and the calendar agrees', () => {
    const r = buildFreshWeekRunningProgram({ startDate: '2026-08-01T00:00:00.000Z', currentWeek: 9, schedule }, NOW);
    expect(r.currentWeek).toBe(2);
    expect(calculateCurrentWeek(r.startDate, NOW)).toBe(2);
    // 6 days later still the same week; 7 days later the next one.
    expect(calculateCurrentWeek(r.startDate, new Date(2026, 9, 24))).toBe(2);
    expect(calculateCurrentWeek(r.startDate, new Date(2026, 9, 25))).toBe(3);
  });

  it('history before the resumed week is untouched; the rest is pending again, with no stale results', () => {
    const r = buildFreshWeekRunningProgram({ startDate: '2026-08-01', schedule }, NOW);
    expect(r.schedule.filter((e) => e.week < 2)).toEqual(schedule.filter((e) => e.week < 2));
    for (const e of r.schedule.filter((x) => x.week >= 2)) {
      expect(e.status).toBe('pending');
      expect('actualPerformance' in e).toBe(false);
    }
    expect(r.schedule.map((e) => e.workoutId)).toEqual(schedule.map((e) => e.workoutId));
  });
});

const block = (id: string, type: string, sec?: number, extra: Record<string, unknown> = {}): CalmRunBlock => ({
  id, type, label: id, colorHex: '#000', ...(sec != null ? { durationSeconds: sec } : {}), ...extra,
});

describe('calmRunWorkout — intervals → easy, volume per tier', () => {
  const intervals = {
    id: 'w', title: 'אינטרוולים', isQualityWorkout: true, category: 'short_intervals',
    blocks: [
      block('wu', 'warmup', 600, { _isDynamicWrapper: true }),
      block('i1', 'interval', 120, { isQualityExercise: true }),
      block('r1', 'recovery', 60),
      block('i2', 'interval', 120, { isQualityExercise: true }),
      block('cd', 'cooldown', 300, { _isDynamicWrapper: true }),
    ],
  };

  it('no load → the very same object (flag-off safe)', () => {
    expect(calmRunWorkout(intervals, NO_CHANGE_LOAD)).toBe(intervals);
  });

  it('fresh week: one easy block, core time −20%, warm-up/cool-down kept', () => {
    const w = calmRunWorkout(intervals, CALM_LOADS.fresh_start_w1, { easyPace: { min: 100, max: 110 } });
    expect(w.isQualityWorkout).toBe(false);
    expect(w.category).toBe('easy_run');
    expect(w.blocks.map((b) => b.type)).toEqual(['warmup', 'run', 'cooldown']);
    expect(w.blocks[1].durationSeconds).toBe(Math.round(300 * 0.8));
    expect(w.blocks[1].zoneType).toBe('easy');
    expect(w.blocks[1].targetPacePercentage).toEqual({ min: 100, max: 110 });
  });

  it('4–6 days: easy run at full volume', () => {
    const w = calmRunWorkout(intervals, CALM_LOADS.welcome_back);
    expect(w.blocks[1].durationSeconds).toBe(300);
  });

  it('an easy run only loses volume (no type change)', () => {
    const easy = { id: 'e', title: 'קלה', isQualityWorkout: false, blocks: [block('run', 'run', 1800)] };
    const w = calmRunWorkout(easy, CALM_LOADS.fresh_start_w1);
    expect(w.blocks).toHaveLength(1);
    expect(w.blocks[0].type).toBe('run');
    expect(w.blocks[0].durationSeconds).toBe(1440);
    expect(calmRunWorkout(easy, CALM_LOADS.welcome_back)).toBe(easy);
  });

  it('distance-only cores are scaled by distance', () => {
    const tempo = { id: 't', title: 'טמפו', isQualityWorkout: true, blocks: [block('t1', 'run', undefined, { distanceMeters: 3000 })] };
    const w = calmRunWorkout(tempo, CALM_LOADS.fresh_start_w1);
    expect(w.blocks[0].distanceMeters).toBe(2400);
    expect(w.blocks[0].durationSeconds).toBeUndefined();
  });
});
