import { describe, expect, it } from 'vitest';
import {
  BELOW_EXPECTED_DENSITY_RATIO,
  countCoveragePct,
  densityCoveragePct,
  densityPerKm,
  isBelowExpectedDensity,
  isUntaggedMajority,
  lengthCoveragePct,
  median,
  parkAreaCoveragePct,
  pct,
} from '../coverage';

describe('pct', () => {
  it('rounds to 1 decimal and clamps', () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(5, 4)).toBe(100);
    expect(pct(0, 10)).toBe(0);
  });
  it('zero / invalid denominator is not measurable ⇒ null (never 0)', () => {
    expect(pct(0, 0)).toBeNull();
    expect(pct(1, NaN)).toBeNull();
    expect(pct(NaN, 4)).toBeNull();
  });
});

describe('lengthCoveragePct', () => {
  it('is length-weighted and skips bad lengths', () => {
    expect(lengthCoveragePct([{ lengthM: 300, covered: true }, { lengthM: 100, covered: false }, { lengthM: -5, covered: true }, { lengthM: NaN, covered: true }])).toBe(75);
  });
  it('empty ⇒ null', () => {
    expect(lengthCoveragePct([])).toBeNull();
  });
});

describe('countCoveragePct', () => {
  it('counts trues', () => {
    expect(countCoveragePct([true, false, true, true])).toBe(75);
    expect(countCoveragePct([])).toBeNull();
  });
});

describe('density', () => {
  it('densityPerKm', () => {
    expect(densityPerKm(11, 1000)).toBe(0.011);
    expect(densityPerKm(5, 0)).toBeNull();
    expect(densityPerKm(-1, 10)).toBeNull();
  });
  it('median', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([null, undefined, NaN])).toBeNull();
  });
  it('below expected density at < 25% of peer median', () => {
    expect(BELOW_EXPECTED_DENSITY_RATIO).toBe(0.25);
    expect(isBelowExpectedDensity(0.24, 1)).toBe(true);
    expect(isBelowExpectedDensity(0.25, 1)).toBe(false);
    expect(isBelowExpectedDensity(null, 1)).toBeNull();
    expect(isBelowExpectedDensity(0.1, 0)).toBeNull();
  });
  it('densityCoveragePct is density as % of peers, capped', () => {
    expect(densityCoveragePct(0.5, 1)).toBe(50);
    expect(densityCoveragePct(2, 1)).toBe(100);
    expect(densityCoveragePct(null, 1)).toBeNull();
  });
});

describe('parks + untagged', () => {
  it('parkAreaCoveragePct needs a reference', () => {
    expect(parkAreaCoveragePct(2, 4)).toBe(50);
    expect(parkAreaCoveragePct(2, null)).toBeNull();
  });
  it('isUntaggedMajority', () => {
    expect(isUntaggedMajority(6.4)).toBe(true);
    expect(isUntaggedMajority(50)).toBe(false);
    expect(isUntaggedMajority(null)).toBe(false);
  });
});
