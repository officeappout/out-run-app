/**
 * Admin user page, workouts tab: the period-comparison chart's buckets and totals (owner 01.11).
 */
import { describe, it, expect } from 'vitest';
import { activityKind, comparePeriods, percentChange, workoutSets } from '../activity-periods';
import { programCardInfo, UNKNOWN_PROGRAM_LABEL } from '../program-card-info';

const now = new Date(2026, 10, 1, 18, 0);
const daysAgo = (n: number) => new Date(2026, 10, 1 - n, 9, 0);
const w = (over: Record<string, unknown>) => ({
  date: daysAgo(0), workoutType: 'strength', activityType: 'strength', duration: 1800, distance: 0, ...over,
}) as never;

describe('activityKind', () => {
  it('running / walking / strength, legacy workout and cycling mapped', () => {
    expect(activityKind({ workoutType: 'running', activityType: 'running' })).toBe('running');
    expect(activityKind({ workoutType: 'cycling', activityType: 'cycling' })).toBe('running');
    expect(activityKind({ workoutType: 'walking', activityType: 'walking' })).toBe('walking');
    expect(activityKind({ workoutType: 'running', activityType: 'workout' })).toBe('strength');
    expect(activityKind({ workoutType: 'recovery', activityType: 'strength' })).toBe('strength');
  });
});

describe('workoutSets', () => {
  it('stored count first, else the logged sets', () => {
    expect(workoutSets({ setsCompleted: 12 })).toBe(12);
    expect(workoutSets({ segments: [{ actual: { exerciseLog: [{ confirmedReps: [5, 5, 4] }, { confirmedReps: [8] }] } }] as never })).toBe(4);
    expect(workoutSets({})).toBe(0);
  });
});

describe('comparePeriods', () => {
  const list = [
    w({ date: daysAgo(0), setsCompleted: 10 }),
    w({ date: daysAgo(2), workoutType: 'running', activityType: 'running', duration: 1500, distance: 5 }),
    w({ date: daysAgo(3), workoutType: 'walking', activityType: 'walking', duration: 3600, distance: 4 }),
    w({ date: daysAgo(9), workoutType: 'running', activityType: 'running', duration: 1200, distance: 4 }),
  ];
  it('week: 7 day buckets, minutes stacked by kind, totals vs the previous week', () => {
    const r = comparePeriods(list, 'week', now);
    expect(r.points).toHaveLength(7);
    expect(r.points[6]).toMatchObject({ strength: 30, running: 0, walking: 0 });
    expect(r.points[4]).toMatchObject({ running: 25 });
    expect(r.points[3]).toMatchObject({ walking: 60 });
    expect(r.current).toEqual({ minutes: 115, sessions: 3, km: 9, sets: 10 });
    expect(r.previous).toEqual({ minutes: 20, sessions: 1, km: 4, sets: 0 });
  });
  it('month: 30 buckets; year: 12 month buckets', () => {
    expect(comparePeriods(list, 'month', now).points).toHaveLength(30);
    const y = comparePeriods(list, 'year', now);
    expect(y.points).toHaveLength(12);
    expect(y.current.sessions).toBe(4);
  });
});

describe('percentChange', () => {
  it('null without a base', () => {
    expect(percentChange(5, 0)).toBeNull();
    expect(percentChange(15, 10)).toBe(50);
  });
});

describe('programCardInfo', () => {
  const programs = [{ id: 'abc123', slug: 'pull', name: 'משיכה', maxLevels: 22, iconKey: 'pull' }] as never;
  const tracks = { pull: { currentLevel: 11, percent: 40 } };
  it('Hebrew name, icon, level and percent under any key form', () => {
    expect(programCardInfo('abc123', tracks, programs)).toMatchObject({ name: 'משיכה', level: 11, percent: 40, maxLevel: 22, resolved: true });
  });
  it('never the raw id', () => {
    const info = programCardInfo('pull_level_11_xyz', undefined, [] as never);
    expect(info.name).toBe(UNKNOWN_PROGRAM_LABEL);
    expect(info.resolved).toBe(false);
  });
});
