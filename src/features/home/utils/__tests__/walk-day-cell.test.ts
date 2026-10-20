import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { resolveDayDisplayProps } from '../day-display.utils';
import { WALK_DAY_COLOR, walkDayCell, walkSessionOverride } from '../walk-day-cell';

const walk = {
  entryId: 'walkplan_2026-10-20', userId: 'u', date: '2026-10-20', programIds: [], type: 'training', source: 'auto',
  completed: false, scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } },
} as UserScheduleEntry;
const strength = { entryId: 's', userId: 'u', date: '2026-10-20', programIds: ['full_body'], type: 'training', source: 'recurring', completed: false } as UserScheduleEntry;

describe('walkDayCell', () => {
  it('a walk-only day is walk-primary; done follows the entry', () => {
    expect(walkDayCell([walk])).toEqual({ walkPrimary: true, walkDone: false });
    expect(walkDayCell([{ ...walk, completed: true }])).toEqual({ walkPrimary: true, walkDone: true });
  });
  it('walk + strength → the strength look stays primary', () => {
    expect(walkDayCell([strength, walk]).walkPrimary).toBe(false);
  });
  it('no walk → nothing', () => {
    expect(walkDayCell([strength])).toEqual({ walkPrimary: false, walkDone: false });
  });
  it('session override only for planned walks', () => {
    expect(walkSessionOverride(walk)).toEqual({ programIconKey: 'walking', runningColor: WALK_DAY_COLOR });
    expect(walkSessionOverride(strength)).toBeNull();
  });
});

describe('a walk day through the strip resolver (the inputs SmartWeeklySchedule passes under v2)', () => {
  it('today pending: walk colour fill + walking icon', () => {
    const p = resolveDayDisplayProps({ state: 'today', isSelected: false, isRest: false, isMissed: false, isCompleted: false, programIconKey: 'walking', runningColor: WALK_DAY_COLOR });
    expect(p.container.bgColor).toBe(WALK_DAY_COLOR);
    expect(p.icon).toMatchObject({ type: 'program', iconKey: 'walking' });
  });
  it('done: the flame (medal) in the walk colour', () => {
    const p = resolveDayDisplayProps({ state: 'today', isSelected: false, isRest: false, isMissed: false, isCompleted: true, programIconKey: 'walking', runningColor: WALK_DAY_COLOR });
    expect(p.icon.type).toBe('img');
    expect(p.container.borderColor).toBe(WALK_DAY_COLOR);
  });
});
