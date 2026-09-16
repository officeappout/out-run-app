import { describe, it, expect } from 'vitest';
import { getExerciseCountForDuration } from '../workout-budgeting.utils';

/**
 * Fixed 05.09.2026 (David): DURATION_SCALING['30'] was defined but
 * structurally unreachable — the old `<=30 -> '15'` branch caught every
 * value from 11 to 30 minutes, so a 20 or 30-minute request (David's own
 * users' two most common picks) was sized like a 15-minute one. Cutoff
 * moved so the '15' tier covers up to 20min and '30' finally covers 21-30min.
 *
 * Widened 16.09.2026 (duration-volume-convergence fix, docs/workout-engine —
 * see PresentationFormatter.ts's enforceVolumeCap Phase D): this table is
 * now just a rest-blind STARTING GUESS, not the source of truth for session
 * size — Phase A-D convergence in enforceVolumeCap owns that. Ranges bumped
 * up modestly per bucket so the common case needs less Phase-D add-back.
 */
describe('getExerciseCountForDuration — the dead 30-bucket fix', () => {
  it('15min: 5-6 exercises', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(15);
      expect(exerciseCount).toBeGreaterThanOrEqual(5);
      expect(exerciseCount).toBeLessThanOrEqual(6);
      expect(includeAccessories).toBe(false);
    }
  });

  it('20min: 5-6 exercises (still the 15-tier, unchanged boundary)', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount } = getExerciseCountForDuration(20);
      expect(exerciseCount).toBeGreaterThanOrEqual(5);
      expect(exerciseCount).toBeLessThanOrEqual(6);
    }
  });

  it('30min: 6-8 exercises — the previously-dead bucket, now reachable', () => {
    let sawMax = false;
    for (let i = 0; i < 30; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(30);
      expect(exerciseCount).toBeGreaterThanOrEqual(6);
      expect(exerciseCount).toBeLessThanOrEqual(8);
      expect(includeAccessories).toBe(false);
      if (exerciseCount === 8) sawMax = true;
    }
    // Confirms the '30' bucket's full range is actually in play, not a fluke
    // that happens to overlap the '15' bucket's range.
    expect(sawMax).toBe(true);
  });

  it('45min: 8-10 exercises, includeAccessories true', () => {
    for (let i = 0; i < 20; i++) {
      const { exerciseCount, includeAccessories } = getExerciseCountForDuration(45);
      expect(exerciseCount).toBeGreaterThanOrEqual(8);
      expect(exerciseCount).toBeLessThanOrEqual(10);
      expect(includeAccessories).toBe(true);
    }
  });

  it('10min: 2-3 exercises (unchanged)', () => {
    const { exerciseCount } = getExerciseCountForDuration(10);
    expect(exerciseCount).toBeGreaterThanOrEqual(2);
    expect(exerciseCount).toBeLessThanOrEqual(3);
  });

  it('60min: 9-12 exercises, includeAccessories true', () => {
    const { exerciseCount, includeAccessories } = getExerciseCountForDuration(60);
    expect(exerciseCount).toBeGreaterThanOrEqual(9);
    expect(exerciseCount).toBeLessThanOrEqual(12);
    expect(includeAccessories).toBe(true);
  });
});
