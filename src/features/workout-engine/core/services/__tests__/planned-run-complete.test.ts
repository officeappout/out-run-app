import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), runTransaction: vi.fn(), serverTimestamp: vi.fn() }));

import { completeEntryInSchedule } from '../planned-run-complete';

const sched = () => [
  { week: 1, day: 1, workoutId: 'a', status: 'completed' as const },
  { week: 2, day: 3, workoutId: 'b', status: 'pending' as const, category: 'easy_run' as const },
  { week: 2, day: 5, workoutId: 'c', status: 'pending' as const },
];

describe('completeEntryInSchedule', () => {
  it('completes only the matching pending entry and leaves the rest untouched', () => {
    const s = sched();
    const next = completeEntryInSchedule(s, { week: 2, day: 3, workoutId: 'w9', coverage: 'plan' })!;
    expect(next[1]).toMatchObject({ workoutId: 'b', status: 'completed', coveredBy: 'w9', coverage: 'plan', category: 'easy_run' });
    expect(next[0]).toBe(s[0]);
    expect(next[2]).toBe(s[2]);
  });
  it('is idempotent: an entry that is already completed / skipped is not touched', () => {
    expect(completeEntryInSchedule(sched(), { week: 1, day: 1, coverage: 'plan' })).toBeNull();
    const done = completeEntryInSchedule(sched(), { week: 2, day: 3, coverage: 'plan' })!;
    expect(completeEntryInSchedule(done, { week: 2, day: 3, coverage: 'free' })).toBeNull();
  });
  it('an entry with no status counts as pending (legacy)', () => {
    const next = completeEntryInSchedule([{ week: 1, day: 2, workoutId: 'x' } as never], { week: 1, day: 2, coverage: 'free' });
    expect(next?.[0]).toMatchObject({ status: 'completed', coverage: 'free' });
  });
  it('no match / no schedule → null (nothing is written)', () => {
    expect(completeEntryInSchedule(sched(), { week: 9, day: 9, coverage: 'plan' })).toBeNull();
    expect(completeEntryInSchedule(undefined, { week: 1, day: 1, coverage: 'plan' })).toBeNull();
  });
  it('records actualPerformance only when both numbers are given', () => {
    const n = completeEntryInSchedule(sched(), { week: 2, day: 3, coverage: 'plan', avgPace: 330, completionRate: 0.9 })!;
    expect(n[1].actualPerformance).toEqual({ avgPace: 330, completionRate: 0.9 });
    const m = completeEntryInSchedule(sched(), { week: 2, day: 3, coverage: 'plan', avgPace: 330 })!;
    expect(m[1].actualPerformance).toBeUndefined();
  });
});
