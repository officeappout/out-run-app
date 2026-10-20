import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { sanitizePlannedRun } from '@/lib/planned-run';
import { recommendWalkPlan } from '../walkPlan';
import {
  buildWalkEntries,
  datesNeedingHydration,
  isOwnWalkEntry,
  isPlannedWalkEntry,
  planWalkDayWrites,
  walkHorizon,
  walkPlannedRun,
} from '../walkSchedule';

// Wednesday 21.10.2026
const WED = new Date(2026, 9, 21, 9, 30);

const plan = recommendWalkPlan({ goal: 'health', comfort: 'medium', stepGoal: 8000, availableDays: [0, 1, 2, 3, 4, 5], audience: 'general' });

const strength = (date: string): UserScheduleEntry => ({
  entryId: 'r1', userId: 'u', date, programIds: ['push'], type: 'training', source: 'recurring', completed: false,
});

describe('horizon', () => {
  it('today → the end of the last week, Sunday-based weeks', () => {
    const h = walkHorizon(WED, 2);
    expect(h[0]).toEqual({ date: '2026-10-21', dow: 3, week: 0 });
    expect(h[h.length - 1]).toEqual({ date: '2026-10-31', dow: 6, week: 1 });
    expect(h.find((d) => d.date === '2026-10-25')?.week).toBe(1);
  });
});

describe('entries', () => {
  const entries = buildWalkEntries(plan, { 4: 'evening' }, WED, 'u');
  it('only the walk days from today on, with the existing entry fields', () => {
    const dates = Object.keys(entries).sort();
    expect(dates[0] >= '2026-10-21').toBe(true);
    const e = entries[dates[0]];
    expect(e.type).toBe('training');
    expect(e.source).toBe('auto');
    expect(e.programIds).toEqual([]);
    expect(e.scheduledCategories).toEqual(['walking']);
    expect(isOwnWalkEntry(e)).toBe(true);
    expect(isPlannedWalkEntry(e)).toBe(true);
    expect(sanitizePlannedRun(e.plannedRun)).toEqual(e.plannedRun);
  });
  it('the chosen time of day', () => {
    const thu = Object.values(entries).find((e) => new Date(`${e.date}T00:00:00`).getDay() === 4);
    expect(thu?.startTime).toBe('19:00');
  });
  it('plannedRun carries the walk target', () => {
    expect(walkPlannedRun({ type: 'time', minutes: 30 }).goal).toEqual({ type: 'time', value: 30 });
    expect(walkPlannedRun({ type: 'distance', km: 3 }).goal).toEqual({ type: 'distance', value: 3 });
  });
});

describe('isPlannedWalkEntry', () => {
  it('ignores strength, community and walks without a goal', () => {
    expect(isPlannedWalkEntry(strength('2026-10-21'))).toBe(false);
    const walk = { type: 'training' as const, source: 'auto' as const, programIds: [], scheduledCategories: ['walking' as const], plannedRun: walkPlannedRun({ type: 'time', minutes: 30 }) };
    expect(isPlannedWalkEntry(walk)).toBe(true);
    expect(isPlannedWalkEntry({ ...walk, source: 'community' })).toBe(false);
    expect(isPlannedWalkEntry({ ...walk, plannedRun: undefined })).toBe(false);
  });
});

describe('day writes', () => {
  const walk = buildWalkEntries(plan, {}, WED, 'u');
  const date = Object.keys(walk).sort()[0];

  it('keeps every other entry and adds the walk', () => {
    const w = planWalkDayWrites({ [date]: [strength(date)] }, walk, [date]);
    expect(w).toHaveLength(1);
    expect(w[0].entries.map((e) => e.entryId)).toEqual(['r1', walk[date].entryId]);
  });
  it('a re-plan replaces the old walk and clears days without a walk now', () => {
    const old = { ...walk[date], title: 'old' };
    const other = '2026-10-30';
    const oldOther = { ...walk[date], entryId: `walkplan_${other}`, date: other };
    const w = planWalkDayWrites({ [date]: [old], [other]: [strength(other), oldOther] }, { [date]: walk[date] }, [date, other]);
    expect(w.find((x) => x.date === date)?.entries).toEqual([walk[date]]);
    expect(w.find((x) => x.date === other)?.entries.map((e) => e.entryId)).toEqual(['r1']);
  });
  it('untouched days are not written', () => {
    expect(planWalkDayWrites({ '2026-10-22': [strength('2026-10-22')] }, {}, ['2026-10-22'])).toEqual([]);
  });
  it('hydrates the recurring template first on empty template days', () => {
    const letter = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'][new Date(`${date}T00:00:00`).getDay()];
    expect(datesNeedingHydration({}, { [date]: walk[date] }, new Set([letter]))).toEqual([date]);
    expect(datesNeedingHydration({ [date]: [strength(date)] }, { [date]: walk[date] }, new Set([letter]))).toEqual([]);
    expect(datesNeedingHydration({}, { [date]: walk[date] }, new Set())).toEqual([]);
  });
});
