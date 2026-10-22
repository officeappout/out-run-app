/** Planner v2 (enable_week_builder_v1): the planned time ↔ the existing userSchedule `startTime` field. */
import { describe, expect, it } from 'vitest';
import type { AdvisorProfile } from '../../../advisor/types';
import { buildPlannerWeek } from '../plannerWeek';
import {
  PLANNED_HOURS,
  PLANNED_MINUTES,
  entriesToTime,
  formatPlannedTime,
  initialWheelTime,
  parsePlannedTime,
  sessionTimeOf,
  snapToQuarter,
  withPlannedTime,
} from '../plannedTime';

describe('planned time values', () => {
  it('hours 0–23 and quarter hours', () => {
    expect(PLANNED_HOURS).toHaveLength(24);
    expect(PLANNED_MINUTES).toEqual([0, 15, 30, 45]);
  });

  it('parses HH:MM / H:MM, rejects anything else', () => {
    expect(parsePlannedTime('07:30')).toEqual({ h: 7, m: 30 });
    expect(parsePlannedTime('7:05')).toEqual({ h: 7, m: 5 });
    expect(parsePlannedTime('24:00')).toBeNull();
    expect(parsePlannedTime('7.30')).toBeNull();
    expect(parsePlannedTime(undefined)).toBeNull();
    expect(formatPlannedTime({ h: 6, m: 0 })).toBe('06:00');
  });

  it('snaps to the nearest quarter, carrying the hour, never past 23:45', () => {
    expect(snapToQuarter({ h: 7, m: 8 })).toEqual({ h: 7, m: 15 });
    expect(snapToQuarter({ h: 7, m: 53 })).toEqual({ h: 8, m: 0 });
    expect(snapToQuarter({ h: 23, m: 58 })).toEqual({ h: 23, m: 45 });
  });

  it('the wheel starts at the stored time, else the reminder time, else 07:00', () => {
    expect(initialWheelTime('18:20')).toEqual({ h: 18, m: 15 });
    expect(initialWheelTime(undefined, '19:00')).toEqual({ h: 19, m: 0 });
    expect(initialWheelTime(null, 'x')).toEqual({ h: 7, m: 0 });
  });
});

describe('entry mapping', () => {
  const day = [
    { entryId: 'a', type: 'training', source: 'recurring', programIds: ['PUSH'], startTime: '07:00' },
    { entryId: 'b', type: 'training', source: 'community', programIds: ['PUSH'] },
    { entryId: 'c', type: 'training', source: 'manual', programIds: ['LEGS'] },
    { entryId: 'd', type: 'rest', source: 'recurring', programIds: [] },
  ];

  it('writes to the session\'s own entries by id, never a community entry', () => {
    expect(entriesToTime(day, ['a', 'b'], []).map((e) => e.entryId)).toEqual(['a']);
  });

  it('a just-hydrated template day: the training entries of the session\'s programs', () => {
    expect(entriesToTime(day, [], ['LEGS']).map((e) => e.entryId)).toEqual(['c']);
  });

  it('sets only startTime on the entry (the existing field), everything else kept', () => {
    expect(withPlannedTime(day[2], { h: 18, m: 30 })).toEqual({ ...day[2], startTime: '18:30' });
  });

  it('shows the first valid time of a session\'s entries', () => {
    expect(sessionTimeOf([{ startTime: 'bad' }, { startTime: '6:45' }])).toBe('06:45');
    expect(sessionTimeOf([{}])).toBeNull();
  });
});

describe('buildPlannerWeek carries the planned time', () => {
  it('a strength session reads its entries\' startTime; a template day without a doc has none', () => {
    const m = buildPlannerWeek({
      keys: ['2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31'],
      todayKey: '2026-10-25',
      profile: { lifestyle: { recurringTemplate: { ב: ['UPPER_BODY'], ד: ['LOWER_BODY'] } } } as unknown as AdvisorProfile,
      entriesByDate: {
        '2026-10-26': [{ entryId: 'e1', type: 'training', source: 'recurring', programIds: ['UPPER_BODY'], completed: false, startTime: '18:30' } as never],
      },
      workouts: [],
    });
    expect(m.week.days[1].sessions[0].data).toMatchObject({ entryIds: ['e1'], startTime: '18:30' });
    expect(m.week.days[3].sessions[0].data).toMatchObject({ entryIds: [], startTime: null });
  });
});
