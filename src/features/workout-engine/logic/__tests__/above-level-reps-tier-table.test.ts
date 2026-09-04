import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { assignVolume } from '../workout-budgeting.utils';
import { TIER_TABLE } from '../workout-generator.types';
import type { WorkoutGenerationContext, VolumeAdjustment } from '../workout-generator.types';
import type { ScoredExercise } from '../contextual-engine.types';

/**
 * Regression test for the "above-level reps" bug (docs/workout-engine/
 * 03-CHANGES.md): hard/elite tier (delta >= 1, exercise above the user's
 * level) reps were silently overridden by the bolt-indexed DIFFICULTY_VOLUME
 * table (bolt 1 → 10-12 reps) instead of TIER_TABLE's hard/elite range
 * (1-3 reps), contradicting the comment above getStaircaseRange that already
 * promised TIER_TABLE governs this case. Confirmed via snapshot.sqlite: bolt
 * 1, level_diff>=1, main/rep-based exercises averaged 9.9 reps with 50%
 * landing at 8+ reps, while bolt 2/3 (same tier, different DIFFICULTY_VOLUME
 * row) were already correct (~4.3 / ~3.3 avg).
 */

const bilateralExercise = (id: string, levelDiff: number): ScoredExercise & { levelDiff: number } => ({
  exercise: {
    id,
    name: { he: id, en: id },
    type: 'reps',
    mechanicalType: 'bent_arm',
    movementGroup: 'vertical_push',
    symmetry: 'bilateral',
    tags: [],
  } as never,
  method: 'bodyweight' as never,
  mechanicalType: 'bent_arm' as never,
  score: 80,
  reasoning: [],
  levelDiff,
});

const baseContext: WorkoutGenerationContext = {
  availableTime: 30,
  userLevel: 10,
  daysInactive: 0,
  intentMode: 'standard',
  persona: null,
  location: 'park',
  injuryCount: 0,
} as never;

const noAdjustment: VolumeAdjustment = {
  reason: 'inactivity',
  reductionPercent: 0,
  originalSets: 0,
  adjustedSets: 0,
  badge: '',
};

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('assignVolume — above-level (hard/elite) reps come from TIER_TABLE, not the bolt', () => {
  const TRIALS = 20; // reps is randomized within the range — sample repeatedly

  for (const difficulty of [1, 2, 3] as const) {
    it(`bolt ${difficulty}: delta=1 (hard) never exceeds TIER_TABLE's 1-3 reps`, () => {
      for (let i = 0; i < TRIALS; i++) {
        const [result] = assignVolume([bilateralExercise('hard_ex', 1)], baseContext, noAdjustment, difficulty);
        expect(result.reps).toBeGreaterThanOrEqual(TIER_TABLE.hard.reps.min);
        expect(result.reps).toBeLessThanOrEqual(TIER_TABLE.hard.reps.max);
        expect(result.reps).toBeLessThanOrEqual(3);
      }
    });

    it(`bolt ${difficulty}: delta=2 (elite) never exceeds TIER_TABLE's 1-3 reps`, () => {
      for (let i = 0; i < TRIALS; i++) {
        const [result] = assignVolume([bilateralExercise('elite_ex', 2)], baseContext, noAdjustment, difficulty);
        expect(result.reps).toBeGreaterThanOrEqual(TIER_TABLE.elite.reps.min);
        expect(result.reps).toBeLessThanOrEqual(TIER_TABLE.elite.reps.max);
        expect(result.reps).toBeLessThanOrEqual(3);
      }
    });
  }

  it('sanity check: delta=0 (match tier) is unaffected — still driven by the DAVID STAIRCASE, not this fix', () => {
    const [result] = assignVolume([bilateralExercise('match_ex', 0)], baseContext, noAdjustment, 1);
    // Match tier's staircase range (levelProgressPercent undefined → pct=0, <50%) is 2-4.
    expect(result.reps).toBeGreaterThanOrEqual(2);
    expect(result.reps).toBeLessThanOrEqual(4);
  });
});
