import { describe, it, expect } from 'vitest';
import { derivePeriodizationWeek } from '../periodization.service';

/**
 * Crash regression (09.07.2026): an Invalid Date is truthy, so it passed the
 * !startDate guard and crashed toISOString(). The guard must fall back to
 * Week 1 (Build) — identical semantics to a missing startDate — and never
 * throw, for ANY malformed input.
 */
describe('derivePeriodizationWeek — invalid-date guard', () => {
  it('returns 1 for missing program / startDate', () => {
    expect(derivePeriodizationWeek(null)).toBe(1);
    expect(derivePeriodizationWeek(undefined)).toBe(1);
    expect(derivePeriodizationWeek({} as never)).toBe(1);
  });

  it('DECODES Firestore-Timestamp-shaped startDate to the real cycle week (12.07.2026)', () => {
    // Real user docs carry this shape (writers pass new Date() to Firestore).
    // Previously it fell to Week 1 forever — now the clock actually runs.
    const eightDaysAgoSec = Math.floor(Date.now() / 1000) - 8 * 86400;
    expect(derivePeriodizationWeek({ startDate: { seconds: eightDaysAgoSec, nanoseconds: 0 } } as never)).toBe(2);
    // JSON round-trip shape (underscore keys) — same decode.
    expect(derivePeriodizationWeek({ startDate: { _seconds: eightDaysAgoSec, _nanoseconds: 0 } } as never)).toBe(2);
    // Timestamp INSTANCE shape (has toDate()).
    expect(derivePeriodizationWeek({ startDate: { toDate: () => new Date(eightDaysAgoSec * 1000) } } as never)).toBe(2);
  });

  it('does NOT crash on garbage strings / Invalid Date', () => {
    expect(derivePeriodizationWeek({ startDate: 'not-a-date' } as never)).toBe(1);
    expect(derivePeriodizationWeek({ startDate: new Date('invalid') } as never)).toBe(1);
  });

  it('SANITY FLOOR: valid-but-ancient dates are treated as missing → Week 1', () => {
    // Epoch artifacts pass BOTH the falsy guard and the Invalid-Date guard —
    // and would land the clock on an arbitrary week (worst case permanent
    // Deload: protocolProbability × 0, no protocols ever).
    expect(derivePeriodizationWeek({ startDate: '1970-01-01T00:00:00.000Z' } as never)).toBe(1);
    expect(derivePeriodizationWeek({ startDate: { seconds: 0, nanoseconds: 0 } } as never)).toBe(1);
    expect(derivePeriodizationWeek({ startDate: '2023-12-31T23:59:59.000Z' } as never)).toBe(1);
    // 2024+ is a legitimate cycle anchor — floor must NOT swallow it.
    const eightDaysAgo = new Date(Date.now() - 8 * 86400 * 1000).toISOString();
    expect(derivePeriodizationWeek({ startDate: eightDaysAgo } as never)).toBe(2);
  });

  it('still computes real weeks for valid dates', () => {
    const today = new Date();
    expect(derivePeriodizationWeek({ startDate: today.toISOString() } as never)).toBe(1);
    const eightDaysAgo = new Date(today.getTime() - 8 * 24 * 3600 * 1000);
    expect(derivePeriodizationWeek({ startDate: eightDaysAgo.toISOString() } as never)).toBe(2);
  });
});
