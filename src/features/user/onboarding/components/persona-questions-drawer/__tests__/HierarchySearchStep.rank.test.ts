import { describe, it, expect } from 'vitest';
import { effectiveServiceType, effectiveUserStatus } from '../service-type-rank';

describe('effectiveUserStatus', () => {
  it('maps career to regular', () => {
    expect(effectiveUserStatus('career')).toBe('regular');
  });
  it('passes regular/reserve through unchanged', () => {
    expect(effectiveUserStatus('regular')).toBe('regular');
    expect(effectiveUserStatus('reserve')).toBe('reserve');
  });
});

describe('effectiveServiceType', () => {
  it('prefers unit-level serviceType over legacy statusCategory', () => {
    expect(effectiveServiceType({ serviceType: 'reserve', statusCategory: 'סדיר' })).toBe('reserve');
  });
  it('falls back to legacy Hebrew statusCategory when serviceType is absent — the bug this fixes: before this map, statusCategory (Hebrew) was compared directly against the English status answer and could never match', () => {
    expect(effectiveServiceType({ serviceType: null, statusCategory: 'סדיר' })).toBe('regular');
    expect(effectiveServiceType({ serviceType: null, statusCategory: 'מילואים' })).toBe('reserve');
  });
  it('returns null for unmapped/absent values rather than guessing', () => {
    expect(effectiveServiceType({ serviceType: null, statusCategory: null })).toBeNull();
    expect(effectiveServiceType({ serviceType: null, statusCategory: 'מרחבית' })).toBeNull();
    expect(effectiveServiceType({ serviceType: '?' as any, statusCategory: null })).toBe('?');
  });
});
