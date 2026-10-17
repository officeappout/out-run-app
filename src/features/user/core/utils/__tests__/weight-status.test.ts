import { describe, it, expect } from 'vitest';
import { isWeightMissing, SIGNUP_PLACEHOLDER_WEIGHT_KG } from '../weight-status';

describe('isWeightMissing', () => {
  it('treats no profile / no weight as missing', () => {
    expect(isWeightMissing(null)).toBe(true);
    expect(isWeightMissing(undefined)).toBe(true);
    expect(isWeightMissing({})).toBe(true);
    expect(isWeightMissing({ weight: null })).toBe(true);
  });

  it('treats 0, negative and non-finite weights as missing', () => {
    expect(isWeightMissing({ weight: 0 })).toBe(true);
    expect(isWeightMissing({ weight: -5 })).toBe(true);
    expect(isWeightMissing({ weight: Number.NaN })).toBe(true);
    // even with the flag — the value itself is unusable
    expect(isWeightMissing({ weight: 0, weightSetByUser: true })).toBe(true);
  });

  it('a user who entered exactly 70kg is NOT asked again (the bug)', () => {
    expect(isWeightMissing({ weight: 70, weightSetByUser: true })).toBe(false);
  });

  it('the untouched signup placeholder (70, no flag) still counts as missing', () => {
    expect(SIGNUP_PLACEHOLDER_WEIGHT_KG).toBe(70);
    expect(isWeightMissing({ weight: 70 })).toBe(true);
    expect(isWeightMissing({ weight: 70, weightSetByUser: false })).toBe(true);
  });

  it('any other real weight counts as set, flag or not', () => {
    expect(isWeightMissing({ weight: 71 })).toBe(false);
    expect(isWeightMissing({ weight: 69.5 })).toBe(false);
    expect(isWeightMissing({ weight: 82, weightSetByUser: true })).toBe(false);
  });
});
