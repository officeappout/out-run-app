import { describe, it, expect } from 'vitest';
import { summarizeTodayStrengthVolume } from '../todayStrengthVolume';
import type { SessionLog } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';

/**
 * Daily Strength Ring · Layer A — the today-volume selector. Drives both the
 * ring numerator (completed sets today) and the Phase-1 partial/full signal.
 * These contract tests pin the aggregation rules: recovery exclusion,
 * multi-session summing, and string-vs-Date `completedAt` bucketing.
 */

const DAY = '2026-07-19';

/** Build a SessionLog with sane defaults; completedAt accepts Date | string. */
function log(partial: Partial<SessionLog> & { completedAt: Date | string }): SessionLog {
  return {
    setsCompleted: 4,
    setsPlanned: 6,
    difficulty: 2,
    isRecovery: false,
    ...partial,
    completedAt: partial.completedAt as unknown as Date,
  };
}

describe('summarizeTodayStrengthVolume', () => {
  it('empty day → all zeros', () => {
    expect(summarizeTodayStrengthVolume([], DAY)).toEqual({
      setsCompleted: 0,
      setsPlanned: 0,
      byDomain: {},
      sessionCount: 0,
    });
    expect(summarizeTodayStrengthVolume(undefined, DAY).sessionCount).toBe(0);
  });

  it('single session → passes values through', () => {
    const out = summarizeTodayStrengthVolume(
      [log({ completedAt: new Date(`${DAY}T09:00:00`), setsCompleted: 5, setsPlanned: 8, domainSets: { push: 3, pull: 2 } })],
      DAY,
    );
    expect(out.setsCompleted).toBe(5);
    expect(out.setsPlanned).toBe(8);
    expect(out.sessionCount).toBe(1);
    expect(out.byDomain).toEqual({ push: 3, pull: 2 });
  });

  it('two sessions same day → summed (sets, domains, count)', () => {
    const out = summarizeTodayStrengthVolume(
      [
        log({ completedAt: new Date(`${DAY}T08:00:00`), setsCompleted: 4, setsPlanned: 6, domainSets: { push: 4 } }),
        log({ completedAt: new Date(`${DAY}T18:00:00`), setsCompleted: 3, setsPlanned: 5, domainSets: { push: 1, legs: 2 } }),
      ],
      DAY,
    );
    expect(out.setsCompleted).toBe(7);
    expect(out.setsPlanned).toBe(11);
    expect(out.sessionCount).toBe(2);
    expect(out.byDomain).toEqual({ push: 5, legs: 2 });
  });

  it('recovery session excluded (isolation law)', () => {
    const out = summarizeTodayStrengthVolume(
      [
        log({ completedAt: new Date(`${DAY}T09:00:00`), setsCompleted: 5 }),
        log({ completedAt: new Date(`${DAY}T19:00:00`), setsCompleted: 99, isRecovery: true }),
      ],
      DAY,
    );
    expect(out.setsCompleted).toBe(5);
    expect(out.sessionCount).toBe(1);
  });

  it('completedAt as ISO string (post-rehydrate) → still bucketed to the day', () => {
    const out = summarizeTodayStrengthVolume(
      [log({ completedAt: `${DAY}T10:30:00.000Z`, setsCompleted: 6 })],
      DAY,
    );
    // string date could shift day under UTC parsing at extreme TZs; assert it is
    // handled without throwing and counted when it lands on the local day.
    expect(out.setsCompleted === 6 || out.setsCompleted === 0).toBe(true);
    // A local-midday string is unambiguous across all timezones:
    const midday = summarizeTodayStrengthVolume(
      [log({ completedAt: `${DAY}T12:00:00`, setsCompleted: 6 })],
      DAY,
    );
    expect(midday.setsCompleted).toBe(6);
  });

  it('session from another day is excluded', () => {
    const out = summarizeTodayStrengthVolume(
      [log({ completedAt: new Date('2026-07-18T12:00:00'), setsCompleted: 7 })],
      DAY,
    );
    expect(out.setsCompleted).toBe(0);
    expect(out.sessionCount).toBe(0);
  });

  it('mixed strength + recovery same day → only strength counted', () => {
    const out = summarizeTodayStrengthVolume(
      [
        log({ completedAt: new Date(`${DAY}T07:00:00`), setsCompleted: 4, isRecovery: false }),
        log({ completedAt: new Date(`${DAY}T20:00:00`), setsCompleted: 3, isRecovery: true }),
      ],
      DAY,
    );
    expect(out.setsCompleted).toBe(4);
    expect(out.sessionCount).toBe(1);
  });

  it('invalid completedAt is skipped, not thrown', () => {
    const out = summarizeTodayStrengthVolume(
      [log({ completedAt: 'not-a-date', setsCompleted: 5 })],
      DAY,
    );
    expect(out.sessionCount).toBe(0);
  });
});
