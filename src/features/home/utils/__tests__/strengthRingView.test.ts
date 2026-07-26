import { describe, it, expect } from 'vitest';
import { getStrengthRingView } from '../strengthRingView';

/**
 * Daily Strength Ring · Layer A — presentation math. Pins the edge states the
 * StrengthRing component renders: 0%, 50%, 100%, >100% (overflow), rest mode,
 * and the minutes-label derivation.
 */

const MPS = 2; // minutes per set (proxy)

describe('getStrengthRingView', () => {
  it('0% — no sets done', () => {
    const v = getStrengthRingView({ completedSets: 0, targetSets: 12, avgMinutesPerSet: MPS });
    expect(v.fillPct).toBe(0);
    expect(v.completedMinutes).toBe(0);
    expect(v.targetMinutes).toBe(24);
    expect(v.isRest).toBe(false);
    expect(v.overflow).toBe(false);
  });

  it('50% — half done', () => {
    const v = getStrengthRingView({ completedSets: 6, targetSets: 12, avgMinutesPerSet: MPS });
    expect(v.fillPct).toBeCloseTo(0.5, 5);
    expect(v.completedMinutes).toBe(12);
  });

  it('100% — exactly on target', () => {
    const v = getStrengthRingView({ completedSets: 12, targetSets: 12, avgMinutesPerSet: MPS });
    expect(v.fillPct).toBe(1);
    expect(v.overflow).toBe(false);
    expect(v.overflowSets).toBe(0);
  });

  it('>100% — overflow clamps fill, reports extra sets', () => {
    const v = getStrengthRingView({ completedSets: 15, targetSets: 12, avgMinutesPerSet: MPS });
    expect(v.fillPct).toBe(1); // clamped
    expect(v.overflow).toBe(true);
    expect(v.overflowSets).toBe(3);
  });

  it('rest mode via targetSets 0 — recovery, no division', () => {
    const v = getStrengthRingView({ completedSets: 0, targetSets: 0, avgMinutesPerSet: MPS });
    expect(v.isRest).toBe(true);
    expect(v.fillPct).toBe(0);
    expect(Number.isNaN(v.fillPct)).toBe(false); // no 0/0
    expect(v.overflow).toBe(false);
  });

  it('rest mode via mode flag — even with a target', () => {
    const v = getStrengthRingView({ completedSets: 4, targetSets: 8, avgMinutesPerSet: MPS, mode: 'rest' });
    expect(v.isRest).toBe(true);
    expect(v.fillPct).toBe(0);
  });

  it('minutes label scales with avgMinutesPerSet', () => {
    const v = getStrengthRingView({ completedSets: 4, targetSets: 8, avgMinutesPerSet: 1.5 });
    expect(v.completedMinutes).toBe(6); // 4 * 1.5
    expect(v.targetMinutes).toBe(12); // 8 * 1.5
  });
});
