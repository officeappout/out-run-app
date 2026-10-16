import { describe, it, expect } from 'vitest';
import { levelRingModel, ringDashOffset } from '../utils/level-ring.util';

describe('levelRingModel', () => {
  it('matches ProgramProgressCard copy: level/max and remaining % to next', () => {
    expect(levelRingModel(7, 25, 64)).toEqual({ percent: 64, levelLabel: 'רמה 7/25', nextLabel: 'עוד 36% לרמה 8' });
  });

  it('hides the next-level line at the top level', () => {
    expect(levelRingModel(25, 25, 80).nextLabel).toBeNull();
  });

  it('clamps and rounds bad percents', () => {
    expect(levelRingModel(3, 25, 140.6).percent).toBe(100);
    expect(levelRingModel(3, 25, -4).percent).toBe(0);
    expect(levelRingModel(3, 25, Number.NaN).percent).toBe(0);
  });

  it('falls back to max 25 when maxLevel is missing', () => {
    expect(levelRingModel(2, 0, 10).levelLabel).toBe('רמה 2/25');
  });
});

describe('ringDashOffset', () => {
  it('full circle at 0%, zero at 100%', () => {
    const c = 2 * Math.PI * 40;
    expect(ringDashOffset(40, 0)).toBeCloseTo(c);
    expect(ringDashOffset(40, 100)).toBeCloseTo(0);
    expect(ringDashOffset(40, 50)).toBeCloseTo(c / 2);
  });
});
