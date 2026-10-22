import { describe, it, expect } from 'vitest';
import { buildVariationBonus } from '../selection-bonus';
import { DP_VARIATION_SCORE_BONUS } from '../adaptive.config';
import type { AdaptiveState } from '../double-progression';

const NOW = 1_800_000_000_000;
const ex = (id: string, level: number, mg = 'vertical_pull', programId = 'pull') =>
  ({ id, name: { he: id }, movementGroup: mg, targetPrograms: [{ programId, level }] }) as never;
const st = (variationStep: -1 | 0 | 1): AdaptiveState => ({
  v: 1, nextTarget: 6, topStreak: 3, missStreak: 0, extraSets: 1, variationStep, isHold: false,
  range: { min: 4, max: 6 }, updatedAtMs: NOW,
});

describe('buildVariationBonus (3a variation step)', () => {
  const pool = [ex('p6', 6), ex('p7', 7), ex('p5', 5), ex('row7', 7, 'horizontal_pull'), ex('other7', 7, 'vertical_pull', 'legs')];

  it('harder: same movement group + same program at level +1; the source gets the mirror penalty', () => {
    const m = buildVariationBonus({ p6: st(1) }, pool, NOW);
    expect(m.get('p7')!.delta).toBe(DP_VARIATION_SCORE_BONUS);
    expect(m.get('p6')!.delta).toBe(-DP_VARIATION_SCORE_BONUS);
    expect(m.has('row7')).toBe(false);
    expect(m.has('other7')).toBe(false);
    expect(m.has('p5')).toBe(false);
  });

  it('easier: level −1', () => {
    const m = buildVariationBonus({ p6: st(-1) }, pool, NOW);
    expect(m.get('p5')!.delta).toBe(DP_VARIATION_SCORE_BONUS);
  });

  it('no candidate / no step / stale → nothing (the source is not penalised alone)', () => {
    expect(buildVariationBonus({ p7: st(1) }, pool, NOW).size).toBe(0);
    expect(buildVariationBonus({ p6: st(0) }, pool, NOW).size).toBe(0);
    expect(buildVariationBonus({ p6: st(1) }, pool, NOW + 60 * 86_400_000).size).toBe(0);
    expect(buildVariationBonus(undefined, pool, NOW).size).toBe(0);
  });
});
