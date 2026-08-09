import { describe, it, expect } from 'vitest';
import { deriveAerobicTargetKm } from '../hybrid-aerobic.util';

describe('deriveAerobicTargetKm — pure aerobic target distance', () => {
  it('walking uses the fixed 12 min/km (pace ignored)', () => {
    // 35 min × share 1 / 12 min/km ≈ 2.92 km
    const km = deriveAerobicTargetKm({ timeBudgetMin: 35, aerobicShare: 1, aerobicKind: 'walking' }, 390);
    expect(km).toBeCloseTo(35 / 12, 5);
  });

  it('aerobicShare scales the aerobic minutes', () => {
    const full = deriveAerobicTargetKm({ timeBudgetMin: 40, aerobicShare: 1, aerobicKind: 'walking' }, 390);
    const half = deriveAerobicTargetKm({ timeBudgetMin: 40, aerobicShare: 0.5, aerobicKind: 'walking' }, 390);
    expect(half).toBeCloseTo(full / 2, 5);
  });

  it('running uses the runner pace (basePaceSecPerKm / 60)', () => {
    // 30 min / (360s ÷ 60 = 6 min/km) = 5 km
    const km = deriveAerobicTargetKm({ timeBudgetMin: 30, aerobicShare: 1, aerobicKind: 'running' }, 360);
    expect(km).toBeCloseTo(5, 5);
  });

  it('running with missing/zero pace falls back to 6.5 min/km (never Infinity)', () => {
    const km = deriveAerobicTargetKm({ timeBudgetMin: 39, aerobicShare: 1, aerobicKind: 'running' }, 0);
    expect(km).toBeCloseTo(39 / 6.5, 5);
    expect(Number.isFinite(km)).toBe(true);
  });

  it('clamps to [1, 20]', () => {
    const tiny = deriveAerobicTargetKm({ timeBudgetMin: 1, aerobicShare: 1, aerobicKind: 'walking' }, 390);
    const huge = deriveAerobicTargetKm({ timeBudgetMin: 600, aerobicShare: 1, aerobicKind: 'walking' }, 390);
    expect(tiny).toBe(1);
    expect(huge).toBe(20);
  });

  it('non-finite intermediate (0 share → 0 km) resolves to the 2.5 fallback → clamp floor 1... actually 2.5', () => {
    // aerobicMin = 0 → targetKm 0 → fallback 2.5 (then clamp keeps 2.5)
    const km = deriveAerobicTargetKm({ timeBudgetMin: 30, aerobicShare: 0, aerobicKind: 'walking' }, 390);
    expect(km).toBe(2.5);
  });
});

describe('deriveAerobicTargetKm — step-gap calibration (09.08.2026)', () => {
  const intent = { timeBudgetMin: 35, aerobicShare: 1, aerobicKind: 'walking' as const };
  const base = deriveAerobicTargetKm(intent, 390); // no 3rd arg → pre-calibration baseline

  it('omitted stepContext is byte-identical to the pre-calibration formula', () => {
    expect(deriveAerobicTargetKm(intent, 390)).toBe(base);
  });

  it('goal already met (stepsRemaining <= 0) → no boost', () => {
    const km = deriveAerobicTargetKm(intent, 390, { stepsRemaining: 0, stepGoal: 8000 });
    expect(km).toBeCloseTo(base, 5);
  });

  it('no stepGoal (0 or missing) → no boost, even with a real stepsRemaining', () => {
    expect(deriveAerobicTargetKm(intent, 390, { stepsRemaining: 5000, stepGoal: 0 })).toBeCloseTo(base, 5);
    expect(deriveAerobicTargetKm(intent, 390, { stepsRemaining: 5000 })).toBeCloseTo(base, 5);
  });

  it('full-day deficit (stepsRemaining === stepGoal) boosts by the max +30%', () => {
    const km = deriveAerobicTargetKm(intent, 390, { stepsRemaining: 8000, stepGoal: 8000 });
    expect(km).toBeCloseTo(base * 1.3, 5);
  });

  it('a partial gap boosts proportionally (half the goal remaining → +15%)', () => {
    const km = deriveAerobicTargetKm(intent, 390, { stepsRemaining: 4000, stepGoal: 8000 });
    expect(km).toBeCloseTo(base * 1.15, 5);
  });

  it('deficitRatio is clamped at 1 even if stepsRemaining somehow exceeds stepGoal', () => {
    const overGoal = deriveAerobicTargetKm(intent, 390, { stepsRemaining: 20000, stepGoal: 8000 });
    const atGoal = deriveAerobicTargetKm(intent, 390, { stepsRemaining: 8000, stepGoal: 8000 });
    expect(overGoal).toBeCloseTo(atGoal, 5);
  });

  it('the final [1, 20] clamp still applies after the boost', () => {
    const huge = deriveAerobicTargetKm(
      { timeBudgetMin: 600, aerobicShare: 1, aerobicKind: 'walking' },
      390,
      { stepsRemaining: 8000, stepGoal: 8000 },
    );
    expect(huge).toBe(20);
  });
});
