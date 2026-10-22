import { describe, expect, it } from 'vitest';
import { authoritySizeClass, quotaForAuthority, QUOTAS, REGIONAL_TOTAL_MAX, REGIONAL_TOTAL_MIN } from '../quota';

describe('quota', () => {
  it('classifies by population and type (§3.7)', () => {
    expect(authoritySizeClass({ type: 'city', population: 990_000 }).sizeClass).toBe('large');
    expect(authoritySizeClass({ type: 'city', population: 100_000 }).sizeClass).toBe('medium');
    expect(authoritySizeClass({ type: 'local_council', population: 20_000 }).sizeClass).toBe('small');
    expect(authoritySizeClass({ type: 'regional_council' }).sizeClass).toBe('regional');
  });
  it('falls back to small and says so when population is missing', () => {
    expect(authoritySizeClass({ type: 'city' })).toEqual({ sizeClass: 'small', populationKnown: false });
  });
  it('quota ranges match the plan table', () => {
    expect(quotaForAuthority({ population: 300_000 }).total).toEqual({ min: 25, max: 40 });
    expect(quotaForAuthority({ type: 'regional_council' }).cycling).toEqual({ min: 2, max: 5 });
  });
  it('regional councils: 20-40 (owner 22.10.2026), named constants; other classes unchanged', () => {
    expect(REGIONAL_TOTAL_MIN).toBe(20);
    expect(REGIONAL_TOTAL_MAX).toBe(40);
    expect(quotaForAuthority({ type: 'regional_council' }).total).toEqual({ min: 20, max: 40 });
    expect(QUOTAS.medium.total).toEqual({ min: 15, max: 25 });
    expect(QUOTAS.small.total).toEqual({ min: 8, max: 15 });
    expect(QUOTAS.regional.parkLoops).toEqual({ min: 0, max: 3 });
  });
});
