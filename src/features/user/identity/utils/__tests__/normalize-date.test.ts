import { describe, it, expect } from 'vitest';
import { normalizeDateField } from '../normalize-date';

/**
 * Crash regression (09.07.2026): startDate arrives in THREE shapes (ISO
 * string / Firestore Timestamp / Date). The bare `new Date(timestampObject)`
 * produced Invalid Date — truthy — which crashed toISOString() inside
 * derivePeriodizationWeek after a cycle restart.
 */
describe('normalizeDateField', () => {
  it('parses ISO strings', () => {
    const d = normalizeDateField('2026-06-06T13:52:05.605Z');
    expect(d?.getTime()).toBe(new Date('2026-06-06T13:52:05.605Z').getTime());
  });

  it('converts Firestore Timestamp objects via toDate()', () => {
    const ts = { toDate: () => new Date('2026-07-09T00:00:00Z') };
    expect(normalizeDateField(ts)?.toISOString()).toBe('2026-07-09T00:00:00.000Z');
  });

  it('converts serialized {seconds} Timestamps that lost their prototype', () => {
    const secs = Math.floor(new Date('2026-07-09T00:00:00Z').getTime() / 1000);
    expect(normalizeDateField({ seconds: secs, nanoseconds: 0 })?.toISOString())
      .toBe('2026-07-09T00:00:00.000Z');
  });

  it('passes Date instances through', () => {
    const d = new Date('2026-01-01T00:00:00Z');
    expect(normalizeDateField(d)?.getTime()).toBe(d.getTime());
  });

  it('returns undefined (never Invalid Date) for garbage', () => {
    expect(normalizeDateField('not-a-date')).toBeUndefined();
    expect(normalizeDateField({})).toBeUndefined();
    expect(normalizeDateField(null)).toBeUndefined();
    expect(normalizeDateField(undefined)).toBeUndefined();
    expect(normalizeDateField(new Date('invalid'))).toBeUndefined();
  });
});
