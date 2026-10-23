import { describe, it, expect } from 'vitest';
import { normalizeInstitutionCode, pickInstitutionCode, accessCodeErrorKey } from '../institution-code';

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
  it('maps CF errors to catalog keys', () => {
    expect(accessCodeErrorKey({ code: 'functions/not-found' })).toBe('accessCodeLink.error.notFound');
    expect(accessCodeErrorKey({ message: 'code expired' })).toBe('accessCodeLink.error.expired');
    expect(accessCodeErrorKey({ code: 'resource-exhausted' })).toBe('accessCodeLink.error.exhausted');
    expect(accessCodeErrorKey({ message: 'no longer active' })).toBe('accessCodeLink.error.inactive');
    expect(accessCodeErrorKey({ message: 'complete your profile' })).toBe('accessCodeLink.error.profile');
    expect(accessCodeErrorKey({ message: 'under-minimum-age' })).toBe('accessCodeLink.error.age');
    expect(accessCodeErrorKey(new Error('boom'))).toBe('accessCodeLink.error.generic');
  });
});
