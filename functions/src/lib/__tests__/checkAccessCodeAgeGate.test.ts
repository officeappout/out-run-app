import { describe, it, expect } from 'vitest';
import { checkAccessCodeAgeGate } from '../checkAccessCodeAgeGate';

/**
 * SPEC-04 Wave C / test #5 — "a school code combined with a 13-year-old
 * must be blocked." validateAccessCode.ts used to write
 * core.tenantId/unitId/tenantType (a school-code redemption is a real,
 * live tenantType:'educational' path — arena/create/page.tsx) with only an
 * auth check, completely independent of complete-profile's own under-14
 * gate. This proves the extracted gate closes both real bypasses found:
 * a never-onboarded caller (birthDate missing entirely) and a genuinely
 * under-14 caller.
 */

function dateYearsAgo(years: number, extraDays = 0): Date {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - extraDays);
  return d;
}

// Mimics a Firestore Timestamp's shape (duck-typed via .toDate()), matching
// what users/{uid}.core.birthDate actually is in production — not a raw JS Date.
function fakeTimestamp(date: Date) {
  return { toDate: () => date };
}

describe('checkAccessCodeAgeGate', () => {
  it('test #5 — a 13-year-old is blocked (under the 14 floor)', () => {
    const result = checkAccessCodeAgeGate(fakeTimestamp(dateYearsAgo(13)));
    expect(result).toEqual({ allowed: false, reason: 'under-minimum-age' });
  });

  it('a comfortably-14-year-old is allowed (14 + 7 days, clear of the 365.25-day-year rounding boundary)', () => {
    const result = checkAccessCodeAgeGate(fakeTimestamp(dateYearsAgo(14, 7)));
    expect(result).toEqual({ allowed: true });
  });

  it('a clear adult is allowed', () => {
    const result = checkAccessCodeAgeGate(fakeTimestamp(dateYearsAgo(30)));
    expect(result).toEqual({ allowed: true });
  });

  it('the second, distinct bypass: a caller who never completed identity (no birthDate at all — e.g. the anonymous "Explore Map" guest path) is blocked, not assumed adult', () => {
    expect(checkAccessCodeAgeGate(undefined)).toEqual({ allowed: false, reason: 'no-birthdate' });
    expect(checkAccessCodeAgeGate(null)).toEqual({ allowed: false, reason: 'no-birthdate' });
  });

  it('a real JS Date (not a Timestamp-shaped object) is also accepted — defensive against either representation', () => {
    expect(checkAccessCodeAgeGate(dateYearsAgo(30))).toEqual({ allowed: true });
  });

  it('an unparseable value fails closed as no-birthdate, not as an exception or a silent allow', () => {
    expect(checkAccessCodeAgeGate('not-a-date')).toEqual({ allowed: false, reason: 'no-birthdate' });
    expect(checkAccessCodeAgeGate({})).toEqual({ allowed: false, reason: 'no-birthdate' });
  });
});
