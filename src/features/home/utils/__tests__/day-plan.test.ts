import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { buildPlannedDay, dayTimingOf, leadPlanKinds, strengthTitleOf } from '../day-plan';
import type { HomeRunEntry } from '../home-run-slot';

const entry = (over: Partial<UserScheduleEntry>): UserScheduleEntry =>
  ({ userId: 'u', date: '2026-10-22', programIds: [], type: 'training', source: 'recurring', completed: false, ...over }) as UserScheduleEntry;

const walk = entry({ entryId: 'walkplan_1', source: 'auto' as UserScheduleEntry['source'], scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } } as UserScheduleEntry['plannedRun'], startTime: '07:00' });
const strength = entry({ programIds: ['PLANCHE'], scheduledCategories: ['strength'] });
const quality: HomeRunEntry = { week: 1, day: 1, status: 'pending', workoutName: 'אינטרוולים 6×400', category: 'short_intervals', isQualityWorkout: true };
const easy: HomeRunEntry = { week: 1, day: 2, status: 'pending', workoutName: 'ריצה קלה', category: 'easy_run' };

describe('dayTimingOf', () => {
  it('past / today / future by ISO date', () => {
    expect(dayTimingOf('2026-10-19', '2026-10-20')).toBe('past');
    expect(dayTimingOf('2026-10-20', '2026-10-20')).toBe('today');
    expect(dayTimingOf('2026-10-22', '2026-10-20')).toBe('future');
  });
});

describe('buildPlannedDay — order', () => {
  it('walk day → just the walk, with its goal and time', () => {
    const d = buildPlannedDay({ entries: [walk], hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['walk']);
    expect(d.items[0].subtitle).toBe('30 דק׳ · בשעה 07:00');
    expect(d.isRestDay).toBe(false);
  });
  it('strength + quality run → run first', () => {
    const d = buildPlannedDay({ entries: [strength], run: quality, hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['run', 'strength']);
  });
  it('strength + easy run → strength first, run after', () => {
    const d = buildPlannedDay({ entries: [strength], run: easy, hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['strength', 'run']);
  });
  it('strength + walk → walk leads (the pinned card)', () => {
    const d = buildPlannedDay({ entries: [strength, walk], hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['walk', 'strength']);
  });
  it('run only (running-only user) → the run', () => {
    const d = buildPlannedDay({ entries: [], run: easy, hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['run']);
  });
  it('no entry → the template day, then scheduleDays', () => {
    expect(buildPlannedDay({ entries: [], templateDayIds: ['PLANCHE'], hasSchedule: true }).items[0].title).toBe(strengthTitleOf(['PLANCHE']));
    expect(buildPlannedDay({ entries: [], isStrengthScheduleDay: true, hasSchedule: true }).items[0].title).toBe('אימון כוח');
  });
  it('the running shadow entry is not a strength session', () => {
    const shadow = entry({ programIds: ['run-prog'] });
    const d = buildPlannedDay({ entries: [shadow], runningProgramId: 'run-prog', run: easy, hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['run']);
  });
  it('explicit rest / nothing planned with a schedule → rest day', () => {
    expect(buildPlannedDay({ entries: [entry({ type: 'rest' })], templateDayIds: ['PLANCHE'], hasSchedule: true })).toEqual({ items: [], isRestDay: true });
    expect(buildPlannedDay({ entries: [], hasSchedule: true }).isRestDay).toBe(true);
    expect(buildPlannedDay({ entries: [], hasSchedule: false }).isRestDay).toBe(false);
  });
  it('a planned walk alone does not suppress the template strength day', () => {
    const d = buildPlannedDay({ entries: [walk], templateDayIds: ['PLANCHE'], hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['walk', 'strength']);
  });
  it('group sessions go last', () => {
    const g = entry({ source: 'community', groupName: 'הליכה בפארק' });
    const d = buildPlannedDay({ entries: [g, strength], hasSchedule: true });
    expect(d.items.map((i) => i.kind)).toEqual(['strength', 'group']);
  });
});

describe('leadPlanKinds', () => {
  it('walk, then a quality run or a run without strength', () => {
    expect(leadPlanKinds({ walk: true, run: { quality: true }, strength: true })).toEqual(['walk', 'run']);
    expect(leadPlanKinds({ walk: false, run: { quality: false }, strength: true })).toEqual([]);
    expect(leadPlanKinds({ walk: false, run: { quality: false }, strength: false })).toEqual(['run']);
  });
});
