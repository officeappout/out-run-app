import { describe, it, expect } from 'vitest';
import { normalizeInstitutionCode, pickInstitutionCode, accessCodeErrorMessage } from '../institution-code';

describe('institution-code', () => {
  it('normalises and rejects junk', () => {
    expect(normalizeInstitutionCode(' unit-x79 ')).toBe('UNIT-X79');
    expect(normalizeInstitutionCode('a b')).toBeNull();
    expect(normalizeInstitutionCode('<script>')).toBeNull();
    expect(normalizeInstitutionCode('')).toBeNull();
    expect(normalizeInstitutionCode(null)).toBeNull();
  });
  it('prefers the query, falls back to storage', () => {
    expect(pickInstitutionCode('abc', 'zzz')).toBe('ABC');
    expect(pickInstitutionCode(null, 'zzz')).toBe('ZZZ');
    expect(pickInstitutionCode('bad code', 'zzz')).toBe('ZZZ');
    expect(pickInstitutionCode(null, null)).toBeNull();
  });
  it('maps CF errors', () => {
    expect(accessCodeErrorMessage({ code: 'functions/not-found' })).toContain('לא נמצא');
    expect(accessCodeErrorMessage({ message: 'code expired' })).toContain('פג תוקף');
    expect(accessCodeErrorMessage(new Error('boom'))).toContain('שגיאה');
  });
});
