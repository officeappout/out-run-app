import { describe, it, expect, vi } from 'vitest';
import { serverTimestamp, deleteField, arrayUnion, Timestamp, GeoPoint, increment } from 'firebase/firestore';
import {
  assertNoSerializedSentinels,
  findSerializedSentinels,
  isPlainObject,
  isSerializedSentinel,
  SerializedSentinelError,
  stripUndefinedDeep,
} from '../firestore-sanitize';
import { convertTimestampToDate } from '../utils/date-formatter';

/**
 * 19.10.2026 — users.lastActive / onboardingCompletedAt /
 * marketingAttribution.capturedAt (and more) were stored as the plain map
 * { _methodName: 'serverTimestamp' } because onboarding-sync's sanitizeObject
 * recursed into the FieldValue sentinel and copied its own keys.
 */

/** The old onboarding-sync sanitizeObject, verbatim — kept to prove the bug. */
const legacySanitizeObject = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (Array.isArray(obj)) return obj.map(legacySanitizeObject);
  if (typeof obj === 'object') {
    const sanitized: any = {};
    Object.keys(obj).forEach((key) => {
      if (obj[key] !== undefined) sanitized[key] = legacySanitizeObject(obj[key]);
    });
    return sanitized;
  }
  return obj;
};

describe('the bug (legacy sanitizer)', () => {
  it('turned serverTimestamp() into { _methodName } and a Timestamp into { seconds, nanoseconds }', () => {
    const out = legacySanitizeObject({ lastActive: serverTimestamp(), at: Timestamp.fromMillis(1_000), d: new Date(0) });
    expect(isSerializedSentinel(out.lastActive)).toBe(true);
    expect(out.lastActive).toEqual({ _methodName: 'serverTimestamp' });
    expect(isPlainObject(out.at)).toBe(true);
    expect(out.d).toEqual({});
  });
});

describe('stripUndefinedDeep', () => {
  it('passes FieldValue sentinels, Timestamp, Date and GeoPoint through by reference', () => {
    const st = serverTimestamp();
    const del = deleteField();
    const au = arrayUnion('x');
    const inc = increment(1);
    const ts = Timestamp.fromMillis(1_700_000_000_000);
    const date = new Date(1_700_000_000_000);
    const geo = new GeoPoint(32, 34);
    const out = stripUndefinedDeep({
      lastActive: st,
      onboardingCompletedAt: st,
      marketingAttribution: { capturedAt: st, source: 'organic', term: undefined },
      gone: del,
      tokens: au,
      n: inc,
      core: { birthDate: ts, updatedAt: date, home: geo },
      list: [ts, undefined, { at: st }],
    });
    expect(out.lastActive).toBe(st);
    expect(out.onboardingCompletedAt).toBe(st);
    expect(out.marketingAttribution.capturedAt).toBe(st);
    expect('term' in out.marketingAttribution).toBe(false);
    expect(out.gone).toBe(del);
    expect(out.tokens).toBe(au);
    expect(out.n).toBe(inc);
    expect(out.core.birthDate).toBe(ts);
    expect(out.core.updatedAt).toBe(date);
    expect(out.core.home).toBe(geo);
    expect(out.list[0]).toBe(ts);
    expect(out.list[1]).toBeNull();
    expect((out.list[2] as any).at).toBe(st);
    expect(findSerializedSentinels(out)).toEqual([]);
  });

  it('keeps the old onboarding semantics: undefined keys omitted, null kept, plain data deep-copied', () => {
    const input = { a: undefined, b: null, c: { d: undefined, e: 1 }, f: [1, 'x'] };
    const out = stripUndefinedDeep(input);
    expect(out).toEqual({ b: null, c: { e: 1 }, f: [1, 'x'] });
    expect(out.c).not.toBe(input.c);
  });

  it("undefinedValue: 'null' writes null instead of omitting", () => {
    expect(stripUndefinedDeep({ a: undefined, b: { c: undefined } }, { undefinedValue: 'null' })).toEqual({ a: null, b: { c: null } });
  });

  it('never writes an already-serialized sentinel: drops it (default) and logs', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const out = stripUndefinedDeep({ lastActive: { _methodName: 'serverTimestamp' }, keep: 1, m: { capturedAt: { _methodName: 'serverTimestamp' } } });
    expect(out).toEqual({ keep: 1, m: {} });
    expect(err).toHaveBeenCalledTimes(1);
    expect(String(err.mock.calls[0][0])).toContain('lastActive');
    err.mockRestore();
  });

  it("onSerializedSentinel: 'throw' throws with the paths", () => {
    expect(() =>
      stripUndefinedDeep({ x: [{ y: { _methodName: 'deleteField' } }] }, { onSerializedSentinel: 'throw' }),
    ).toThrow(SerializedSentinelError);
  });
});

describe('assertNoSerializedSentinels', () => {
  it('passes real sentinels and throws on serialized ones (incl. a JSON round-trip)', () => {
    expect(() => assertNoSerializedSentinels({ a: serverTimestamp(), b: Timestamp.now() })).not.toThrow();
    const roundTripped = JSON.parse(JSON.stringify({ a: serverTimestamp() }));
    expect(() => assertNoSerializedSentinels(roundTripped, 'body')).toThrow(/a/);
    expect(findSerializedSentinels({ m: { capturedAt: { _methodName: 'serverTimestamp' } } })).toEqual(['m.capturedAt']);
  });
});

describe('readers treat a sentinel map as missing', () => {
  it('convertTimestampToDate', () => {
    expect(convertTimestampToDate({ _methodName: 'serverTimestamp' })).toBeNull();
    expect(convertTimestampToDate(Timestamp.fromMillis(5_000))?.getTime()).toBe(5_000);
  });
});
