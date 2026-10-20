import { describe, expect, it } from 'vitest';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { completedWalkEntry } from '../walkComplete';
import { walkEntryFor } from '../walkSchedule';

const walk = walkEntryFor('2026-10-20', { dow: 2, target: { type: 'time', minutes: 30 }, isLong: false } as never, undefined, 'u1');
const strength: UserScheduleEntry = {
  entryId: 's1', userId: 'u1', date: '2026-10-20', programIds: ['full_body'], type: 'training', source: 'recurring', completed: false,
};

describe('completedWalkEntry', () => {
  it('marks the planned walk completed with the workout id (existing fields only)', () => {
    const next = completedWalkEntry([strength, walk], walk.entryId!, 'w123');
    expect(next).toEqual({ ...walk, completed: true, completedWorkoutId: 'w123' });
    expect(Object.keys(next!).sort()).toEqual([...Object.keys(walk), 'completedWorkoutId'].sort());
  });
  it('no workout id → completed only', () => {
    expect(completedWalkEntry([walk], walk.entryId!, null)).toEqual({ ...walk, completed: true });
  });
  it('missing, already done, or not a planned walk → null', () => {
    expect(completedWalkEntry([strength], walk.entryId!, 'w')).toBeNull();
    expect(completedWalkEntry([{ ...walk, completed: true }], walk.entryId!, 'w')).toBeNull();
    expect(completedWalkEntry([strength], 's1', 'w')).toBeNull();
  });
});
