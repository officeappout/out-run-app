import { describe, it, expect } from 'vitest';
import { selectMethodForContext } from '../method-selection.utils';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Regression coverage for the park-branch bodyweight-tier leak
 * (execution-method-toggle-and-park-leak-investigation.md §2a, FIX 3,
 * 2026-10-07). The "no park-tagged methods at all -> bodyweight/surface
 * methods survive" fallback (method-selection.utils.ts:184-200) filtered by
 * gear only, never checking m.location/locationMapping -- directly
 * contradicting its own comment ("Home-tagged methods are NOT used even if
 * their gear happens to be available"). A home-tagged, gear-less method
 * could leak into a park request. Confirmed via a real-catalog measurement
 * (0 of 358 exercises have zero park-tagged method today) that this branch
 * is unreachable for live data -- these tests cover the synthetic case the
 * real catalog doesn't exercise, so a future exercise authored without a
 * park method can't silently reopen the leak.
 */

function makeExercise(id: string, methods: Array<Record<string, unknown>>): Exercise {
  return {
    id,
    name: { he: id, en: id },
    execution_methods: methods,
  } as any;
}

describe('selectMethodForContext — park-branch bodyweight-tier location leak (FIX 3)', () => {
  it('a home-tagged, gear-less method is EXCLUDED (null) for a park request, not leaked', () => {
    const ex = makeExercise('home-bw-1', [
      { location: 'home', requiredGearType: 'none', media: { imageUrl: 'x.jpg' } },
    ]);
    const result = selectMethodForContext(ex, 'park' as any, []);
    expect(result).toBeNull();
  });

  it('a park-tagged, gear-less method is still correctly selected for a park request (no regression)', () => {
    const ex = makeExercise('park-bw-1', [
      { location: 'park', requiredGearType: 'none', media: { imageUrl: 'x.jpg' } },
    ]);
    const result = selectMethodForContext(ex, 'park' as any, []);
    expect(result).not.toBeNull();
    expect(result?.location).toBe('park');
  });

  it('a park-tagged method requiring unavailable gear still hard-rejects (null) -- untouched code path', () => {
    const ex = makeExercise('park-gear-1', [
      { location: 'park', requiredGearType: 'fixed_equipment', equipmentIds: ['pullup_bar'], media: {} },
    ]);
    const result = selectMethodForContext(ex, 'park' as any, []);
    expect(result).toBeNull();
  });

  it('a home-tagged method that DOES require real gear is also excluded for park (already-correct case, confirmed still correct)', () => {
    const ex = makeExercise('home-gear-1', [
      { location: 'home', requiredGearType: 'user_gear', gearIds: ['resistance_band'], media: {} },
    ]);
    const result = selectMethodForContext(ex, 'park' as any, []);
    expect(result).toBeNull();
  });

  it('an exercise with BOTH a home method and a real park method still correctly picks the park one', () => {
    const ex = makeExercise('mixed-1', [
      { location: 'home', requiredGearType: 'none', media: { imageUrl: 'home.jpg' } },
      { location: 'park', requiredGearType: 'none', media: { imageUrl: 'park.jpg' } },
    ]);
    const result = selectMethodForContext(ex, 'park' as any, []);
    expect(result?.location).toBe('park');
  });
});
