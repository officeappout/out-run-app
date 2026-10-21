import { describe, expect, it } from 'vitest';
import { toDateOrNull } from '../dates';

describe('toDateOrNull', () => {
  const d = new Date('2026-10-21T10:00:00Z');
  it('accepts Timestamp-like, Date, ISO, millis, {seconds}', () => {
    expect(toDateOrNull({ toDate: () => d })?.getTime()).toBe(d.getTime());
    expect(toDateOrNull(d)?.getTime()).toBe(d.getTime());
    expect(toDateOrNull(d.toISOString())?.getTime()).toBe(d.getTime());
    expect(toDateOrNull(d.getTime())?.getTime()).toBe(d.getTime());
    expect(toDateOrNull({ seconds: d.getTime() / 1000 })?.getTime()).toBe(d.getTime());
    expect(toDateOrNull({ _seconds: d.getTime() / 1000 })?.getTime()).toBe(d.getTime());
  });
  it('null for garbage', () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    expect(toDateOrNull('')).toBeNull();
    expect(toDateOrNull('not a date')).toBeNull();
    expect(toDateOrNull(new Date(NaN))).toBeNull();
    expect(toDateOrNull({})).toBeNull();
  });
});
