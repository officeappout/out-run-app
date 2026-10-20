import { describe, expect, it } from 'vitest';
import { applyStrengthTopUp, MIN_TOP_UP_SETS, resolveStrengthTopUp, topUpTitleHe } from '../strength-top-up';

describe('resolveStrengthTopUp', () => {
  it('no strength today → none', () => {
    expect(resolveStrengthTopUp({ strengthDoneToday: false, targetSets: 18, completedSets: 0 })).toEqual({ mode: 'none' });
  });
  it('part of the daily goal → top-up with the remaining sets', () => {
    expect(resolveStrengthTopUp({ strengthDoneToday: true, targetSets: 18, completedSets: 12 })).toEqual({ mode: 'top-up', remainingSets: 6 });
  });
  it('goal reached (or over) → goal-met', () => {
    expect(resolveStrengthTopUp({ strengthDoneToday: true, targetSets: 18, completedSets: 18 })).toEqual({ mode: 'goal-met' });
    expect(resolveStrengthTopUp({ strengthDoneToday: true, targetSets: 18, completedSets: 25 })).toEqual({ mode: 'goal-met' });
  });
  it('a gap below the minimum is not a workout', () => {
    expect(resolveStrengthTopUp({ strengthDoneToday: true, targetSets: 18, completedSets: 18 - (MIN_TOP_UP_SETS - 1) })).toEqual({ mode: 'goal-met' });
  });
  it('a rest day (target 0) never asks for more strength', () => {
    expect(resolveStrengthTopUp({ strengthDoneToday: true, targetSets: 0, completedSets: 4 })).toEqual({ mode: 'goal-met' });
  });
});

describe('applyStrengthTopUp', () => {
  const items = [
    { id: 'f', generatorId: 'full-strength' },
    { id: 'p', generatorId: 'partial-completion' },
    { id: 'c', generatorId: 'complementary-short' },
    { id: 'r', generatorId: 'route' },
  ];
  const isStrength = (t: { generatorId: string }) => ['full-strength', 'partial-completion', 'complementary-short'].includes(t.generatorId);
  it('none → unchanged', () => {
    expect(applyStrengthTopUp(items, { mode: 'none' }, isStrength).map((t) => t.id)).toEqual(['f', 'p', 'c', 'r']);
  });
  it('goal met → no strength at all', () => {
    expect(applyStrengthTopUp(items, { mode: 'goal-met' }, isStrength).map((t) => t.id)).toEqual(['r']);
  });
  it('top-up → only the partial-completion card among the strength cards', () => {
    expect(applyStrengthTopUp(items, { mode: 'top-up', remainingSets: 6 }, isStrength).map((t) => t.id)).toEqual(['p', 'r']);
  });
});

describe('topUpTitleHe', () => {
  it('owner copy', () => {
    expect(topUpTitleHe(6)).toBe('השלמת סטים · נשארו 6 סטים להיום');
    expect(topUpTitleHe(1)).toBe('השלמת סטים · נשאר סט אחד להיום');
  });
});
