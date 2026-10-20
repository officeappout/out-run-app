import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { nextSevenDates, walkWeekFrom } from '../walk-week';

const walk = (date: string, over: Partial<UserScheduleEntry> = {}) =>
  ({
    entryId: `walkplan_${date}`, userId: 'u', date, programIds: [], type: 'training', source: 'auto', completed: false,
    scheduledCategories: ['walking'], plannedRun: { goal: { type: 'time', value: 30 } }, ...over,
  }) as UserScheduleEntry;

describe('home walk slice', () => {
  const dates = nextSevenDates(new Date(2026, 9, 21));
  it('seven dates from today', () => {
    expect(dates[0]).toBe('2026-10-21');
    expect(dates[6]).toBe('2026-10-27');
  });
  it('today / next walk', () => {
    const s = walkWeekFrom({ '2026-10-21': [walk('2026-10-21')], '2026-10-23': [walk('2026-10-23')] }, dates, isPlannedWalkEntry);
    expect(s.isWalker).toBe(true);
    expect(s.today?.date).toBe('2026-10-21');
    expect(s.next?.date).toBe('2026-10-23');
  });
  it('not a walker without planned walks', () => {
    const strength = walk('2026-10-21', { programIds: ['push'], plannedRun: undefined });
    expect(walkWeekFrom({ '2026-10-21': [strength] }, dates, isPlannedWalkEntry).isWalker).toBe(false);
  });
});
