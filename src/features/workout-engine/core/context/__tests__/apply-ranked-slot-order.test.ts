import { describe, it, expect } from 'vitest';
import { applyRankedSlotOrder } from '../apply-ranked-slot-order';
import type { HybridSlot } from '../../../hybrid/hybrid-slots';
import type { Suggestion } from '../../types/suggestion.types';

const baseSlots: HybridSlot[] = [
  { kind: 'hybrid', id: 'recommended', preset: {} as never, timeBudgetMin: 30, title: 'a', subtitle: 's', bolts: 2, recommended: true, accent: '#000' },
  { kind: 'hybrid', id: 'full_park', preset: {} as never, timeBudgetMin: 30, title: 'b', subtitle: 's', bolts: 2, recommended: false, accent: '#000' },
  { kind: 'aerobic_quick', id: 'aerobic_quick', aerobicKind: 'walking', title: 'c', subtitle: 's', bolts: 1, recommended: false, accent: '#0f0' },
];

const suggestion = (generatorId: string): Suggestion => ({
  id: generatorId,
  type: 'daily_workout',
  generatorId,
  title: 't',
  structure: { segments: 1, durationMin: 30 },
  methodsUsed: [],
  difficulty: 2,
  goalTags: [],
  surfaceEligibility: ['map'],
  requiresLocation: true,
  score: 0,
  scoreBreakdown: { goalMatch: 0, gapFilling: 0, stepDeficit: 0, preferenceMatch: 0, recoveryMatch: 0, locationBonus: 0, timeOfDayMatch: 0 },
});

describe('applyRankedSlotOrder — safety net', () => {
  it('returns baseSlots unchanged (same array) when ranked is null', () => {
    expect(applyRankedSlotOrder(baseSlots, null)).toBe(baseSlots);
  });

  it('returns baseSlots unchanged when ranked is empty', () => {
    expect(applyRankedSlotOrder(baseSlots, [])).toBe(baseSlots);
  });

  it('returns baseSlots unchanged when nothing ranked maps to a real slot id', () => {
    const ranked = [suggestion('full-strength'), suggestion('route')]; // non-map generators
    expect(applyRankedSlotOrder(baseSlots, ranked)).toBe(baseSlots);
  });

  it('moves the winning slot to the front and marks it recommended, when it matches', () => {
    const ranked = [suggestion('full-park-workout')];
    const result = applyRankedSlotOrder(baseSlots, ranked);

    expect(result[0].id).toBe('full_park');
    expect(result[0].recommended).toBe(true);
    expect(result.map((s) => s.id).sort()).toEqual(baseSlots.map((s) => s.id).sort());
  });

  it('never fabricates a new slot — every returned slot object traces back to baseSlots', () => {
    const ranked = [suggestion('route-stops'), suggestion('full-park-workout')];
    // route_stops isn't in baseSlots -> falls through to the next ranked candidate that IS
    const result = applyRankedSlotOrder(baseSlots, ranked);
    expect(result[0].id).toBe('full_park');
    expect(result[0].title).toBe(baseSlots.find((s) => s.id === 'full_park')!.title); // real title, not invented
  });

  it('only one slot ends up recommended:true after reordering', () => {
    const ranked = [suggestion('full-park-workout')];
    const result = applyRankedSlotOrder(baseSlots, ranked);
    expect(result.filter((s) => s.recommended)).toHaveLength(1);
  });
});
