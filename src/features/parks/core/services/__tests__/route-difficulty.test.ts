import { describe, it, expect } from 'vitest';
import {
  computeDifficulty,
  DIFFICULTY_RATE_THRESHOLDS_M_PER_KM,
  DIFFICULTY_GRADE_THRESHOLDS_PERCENT,
} from '../route-difficulty.service';

describe('computeDifficulty', () => {
  it('level 1: flat, low gain rate, no grade data', () => {
    const result = computeDifficulty(11, null, 5); // matches real הקפת פארק המסילה data: elevationGain=11, maxGrade=undefined
    expect(result.level).toBe(1);
    expect(result.terrainScore).toBe(1);
    expect(result.inputs.gainRate).toBeCloseTo(2.2, 5);
  });

  it('level 2: gain rate in the 10-25 m/km band', () => {
    const result = computeDifficulty(75, null, 5); // 15 m/km
    expect(result.level).toBe(2);
  });

  it('level 3: gain rate above 25 m/km', () => {
    const result = computeDifficulty(200, null, 5); // 40 m/km
    expect(result.level).toBe(3);
  });

  it('level 3: driven by maxGrade alone even with a flat gain rate', () => {
    const result = computeDifficulty(5, 12, 5); // gainRate=1 (bucket1), maxGrade=12% (bucket3)
    expect(result.level).toBe(3);
    expect(result.inputs.gainRate).toBeCloseTo(1, 5);
  });

  it('level = max(gradeBucket, rateBucket), not additive', () => {
    // gainRate bucket 2 (15 m/km), maxGrade bucket 3 (12%) -> max is 3, not 5
    const result = computeDifficulty(75, 12, 5);
    expect(result.level).toBe(3);
  });

  it('a null maxGrade never escalates difficulty above what gainRate alone implies', () => {
    const withNullGrade = computeDifficulty(75, null, 5); // gainRate bucket 2
    expect(withNullGrade.level).toBe(2);
  });

  it('bucket boundaries are inclusive at the threshold (>= not >)', () => {
    const atRateBucket2 = computeDifficulty(DIFFICULTY_RATE_THRESHOLDS_M_PER_KM.bucket2, null, 1);
    expect(atRateBucket2.level).toBe(2);
    const atRateBucket3 = computeDifficulty(DIFFICULTY_RATE_THRESHOLDS_M_PER_KM.bucket3, null, 1);
    expect(atRateBucket3.level).toBe(3);
    const atGradeBucket2 = computeDifficulty(0, DIFFICULTY_GRADE_THRESHOLDS_PERCENT.bucket2, 5);
    expect(atGradeBucket2.level).toBe(2);
    const atGradeBucket3 = computeDifficulty(0, DIFFICULTY_GRADE_THRESHOLDS_PERCENT.bucket3, 5);
    expect(atGradeBucket3.level).toBe(3);
  });

  it('distanceKm <= 0 degrades to gainRate=0 (bucket 1) instead of Infinity/NaN', () => {
    const zero = computeDifficulty(100, null, 0);
    expect(zero.inputs.gainRate).toBe(0);
    expect(Number.isFinite(zero.inputs.gainRate)).toBe(true);
    expect(zero.level).toBe(1);

    const negative = computeDifficulty(100, null, -2);
    expect(negative.inputs.gainRate).toBe(0);
  });

  it('terrainScore currently equals level (documented v1 behavior, may diverge later)', () => {
    const result = computeDifficulty(200, 15, 5);
    expect(result.terrainScore).toBe(result.level);
  });

  it('inputs echo back exactly what was passed plus the derived gainRate', () => {
    const result = computeDifficulty(50, 7.5, 4);
    expect(result.inputs).toEqual({ elevationGain: 50, maxGrade: 7.5, distanceKm: 4, gainRate: 12.5 });
  });

  it('real-world sanity check: a steep 15% terrain climb dominates a modest gain rate', () => {
    // Real data shape from Stage 3's terrain_283469067_320883 (avgGrade 11.6%, maxGrade 15%)
    const result = computeDifficulty(20, 15, 8); // gainRate=2.5 (bucket1), maxGrade=15% (bucket3)
    expect(result.level).toBe(3);
  });
});
