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

  it('does NOT physically reorder — array order matches baseSlots exactly, only the badge flips', () => {
    const ranked = [suggestion('full-park-workout')];
    const result = applyRankedSlotOrder(baseSlots, ranked);

    expect(result.map((s) => s.id)).toEqual(baseSlots.map((s) => s.id)); // same order, no splice/unshift
    expect(result.find((s) => s.id === 'full_park')!.recommended).toBe(true);
    expect(result.find((s) => s.id === 'recommended')!.recommended).toBe(false);
  });

  it('never fabricates a new slot — every returned slot object traces back to baseSlots', () => {
    const ranked = [suggestion('route-stops'), suggestion('full-park-workout')];
    // route_stops isn't in baseSlots -> falls through to the next ranked candidate that IS
    const result = applyRankedSlotOrder(baseSlots, ranked);
    const winner = result.find((s) => s.recommended);
    expect(winner?.id).toBe('full_park');
    expect(winner?.title).toBe(baseSlots.find((s) => s.id === 'full_park')!.title); // real title, not invented
  });

  it('only one slot ends up recommended:true', () => {
    const ranked = [suggestion('full-park-workout')];
    const result = applyRankedSlotOrder(baseSlots, ranked);
    expect(result.filter((s) => s.recommended)).toHaveLength(1);
  });

  it('returns baseSlots BY REFERENCE (no new array) when the ranked winner already agrees with the default', () => {
    const ranked = [suggestion('anchor-loop')]; // baseSlots' own 'recommended' slot already has recommended:true
    const result = applyRankedSlotOrder(baseSlots, ranked);
    expect(result).toBe(baseSlots); // reference equality, not just deep equality — proves no re-render
  });
});
