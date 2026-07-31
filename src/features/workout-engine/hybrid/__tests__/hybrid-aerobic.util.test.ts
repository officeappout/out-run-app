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
