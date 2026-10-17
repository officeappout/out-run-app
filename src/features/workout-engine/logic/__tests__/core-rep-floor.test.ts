import { describe, it, expect } from 'vitest';
import {
  applyCoreRepFloor,
  rederiveVolumeForSwappedExercise,
  CORE_REP_FLOOR,
} from '../workout-budgeting.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Generator audit P0 #4 (2026-10-17): the above-level / staircase tiers gave
 * rep-based core work 1–3 reps ("אופניים 2×1", "קראנץ 2×2"). Core-domain,
 * rep-based, non-skill exercises are floored at CORE_REP_FLOOR..12.
 */

const coreEx = (id: string, extra: Record<string, unknown> = {}): Exercise =>
  ({ id, name: { he: id, en: id }, movementGroup: 'core', type: 'reps', mechanicalType: 'none', symmetry: 'bilateral', tags: [], ...extra } as unknown as Exercise);

describe('core rep floor', () => {
  it('floors an elite-tier (1-3) core prescription to 8-12', () => {
    const r = applyCoreRepFloor(coreEx('bicycle'), 'accessory', false, 1, { min: 1, max: 3 });
    expect(r).toEqual({ reps: CORE_REP_FLOOR, repsRange: { min: CORE_REP_FLOOR, max: 12 } });
  });

  it('leaves time-based core, skill-priority core and non-core exercises alone', () => {
    expect(applyCoreRepFloor(coreEx('plank'), 'accessory', true, 2, { min: 1, max: 3 })).toBeNull();
    expect(applyCoreRepFloor(coreEx('dragon_flag'), 'skill', false, 2, { min: 1, max: 3 })).toBeNull();
    const push = { ...coreEx('pushup'), movementGroup: 'horizontal_push' } as unknown as Exercise;
    expect(applyCoreRepFloor(push, 'compound', false, 2, { min: 1, max: 3 })).toBeNull();
  });

  it('leaves an already-adequate core range untouched', () => {
    expect(applyCoreRepFloor(coreEx('crunch'), 'accessory', false, 11, { min: 10, max: 12 })).toBeNull();
  });

  it('swap re-derivation applies it too: a core exercise swapped in above level never gets <8 reps', () => {
    for (let i = 0; i < 20; i++) {
      const d = rederiveVolumeForSwappedExercise(coreEx('bicycle'), 3, 3); // elite tier
      expect(d.isTimeBased).toBe(false);
      expect(d.reps).toBeGreaterThanOrEqual(CORE_REP_FLOOR);
      expect(d.repsRange!.min).toBeGreaterThanOrEqual(CORE_REP_FLOOR);
    }
  });
});
