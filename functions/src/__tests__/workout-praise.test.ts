import { describe, it, expect } from 'vitest';
import { praiseDue } from '../workoutPraiseScheduler';

describe('workout praise push (pilot N5)', () => {
  const base = { todayKey: '2026-10-31', lastWorkoutMs: 1_000 };
  it('due after a workout when progress was not opened after it', () => {
    expect(praiseDue({ ...base, praiseSeenAt: undefined, lastPraiseDay: undefined })).toBe(true);
    expect(praiseDue({ ...base, praiseSeenAt: 500, lastPraiseDay: '2026-10-30' })).toBe(true);
  });
  it('skipped when progress was opened after the last workout, or already sent today', () => {
    expect(praiseDue({ ...base, praiseSeenAt: 1_500, lastPraiseDay: undefined })).toBe(false);
    expect(praiseDue({ ...base, praiseSeenAt: undefined, lastPraiseDay: '2026-10-31' })).toBe(false);
  });
});
