import { describe, it, expect } from 'vitest';
import { getExerciseCountForDuration } from '../workout-budgeting.utils';

/**
 * Fixed 05.09.2026 (David): DURATION_SCALING['30'] (min:5, max:6,
 * includeAccessories:false) was defined but structurally unreachable — the
 * old `<=30 -> '15'` branch caught every value from 11 to 30 minutes, so a
 * 20 or 30-minute request (David's own users' two most common picks) was
 * sized like a 15-minute one (min:4, max:5). Cutoff moved so the '15' tier
 * covers up to 20min and '30' finally covers 21-30min.
 */
describe('getExerciseCountForDuration — the dead 30-bucket fix', () => {
  it('15min: 4-5 exercises (unchanged)', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(15);
      expect(exerciseCount).toBeGreaterThanOrEqual(4);
      expect(exerciseCount).toBeLessThanOrEqual(5);
      expect(includeAccessories).toBe(false);
    }
  });

  it('20min: 4-5 exercises (still the 15-tier, unchanged boundary)', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount } = getExerciseCountForDuration(20);
      expect(exerciseCount).toBeGreaterThanOrEqual(4);
      expect(exerciseCount).toBeLessThanOrEqual(5);
    }
  });

  it('30min: 5-6 exercises — the previously-dead bucket, now reachable', () => {
    let sawSix = false;
    for (let i = 0; i < 30; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(30);
      expect(exerciseCount).toBeGreaterThanOrEqual(5);
      expect(exerciseCount).toBeLessThanOrEqual(6);
      expect(includeAccessories).toBe(false);
      if (exerciseCount === 6) sawSix = true;
    }
    // Confirms the '30' bucket (max:6) is actually in play, not a fluke
    // that happens to overlap the '15' bucket's range.
    expect(sawSix).toBe(true);
  });

  it('45min: 6-8 exercises, includeAccessories true (unchanged)', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(45);
      expect(exerciseCount).toBeGreaterThanOrEqual(6);
      expect(exerciseCount).toBeLessThanOrEqual(8);
      expect(includeAccessories).toBe(true);
    }
  });

  it('10min: 2-3 exercises (unchanged)', () => {
    const { exerciseCount } = getExerciseCountForDuration(10);
    expect(exerciseCount).toBeGreaterThanOrEqual(2);
    expect(exerciseCount).toBeLessThanOrEqual(3);
  });

  it('60min: 7-10 exercises, includeAccessories true (unchanged)', () => {
    const { exerciseCount, includeAccessories } = getExerciseCountForDuration(60);
    expect(exerciseCount).toBeGreaterThanOrEqual(7);
    expect(exerciseCount).toBeLessThanOrEqual(10);
    expect(includeAccessories).toBe(true);
  });
});
