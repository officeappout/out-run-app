import { describe, it, expect } from 'vitest';
import { nextAdaptiveState, overshootOf, type SessionResultInput } from '../double-progression';
import { describeAdaptiveChange } from '../adaptive-change';

const NOW = 1_800_000_000_000;
const R = { min: 6, max: 10 };
const s = (values: number[], target: number, extra: Partial<SessionResultInput> = {}): SessionResultInput =>
  ({ values, target, range: R, isHold: false, ...extra });
const ids = { exerciseId: 'pushup', exerciseName: 'שכיבות סמיכה' };

describe('overshootOf (owner 30.10.2026)', () => {
  it('none / jump to top / harder variation', () => {
    expect(overshootOf(s([10, 10, 11], 7))).toBe('none');            // avg top + 0.33
    expect(overshootOf(s([12, 12, 12], 7))).toBe('jump_top');        // top + 2
    expect(overshootOf(s([15, 14, 13], 7))).toBe('harder_variation'); // top + 4
    expect(overshootOf(s([15, 14, 9], 7))).toBe('none');             // one set under the top
  });
  it('a default (untouched) save never counts as an overshoot', () => {
    expect(overshootOf(s([15, 15, 15], 7, { sources: ['edited', 'default', 'edited'] }))).toBe('none');
  });
  it('holds use seconds', () => {
    const h = (v: number[]) => ({ values: v, target: 30, range: { min: 20, max: 40 }, isHold: true });
    expect(overshootOf(h([50, 50]))).toBe('jump_top');
    expect(overshootOf(h([60, 60]))).toBe('harder_variation');
  });
});

describe('nextAdaptiveState with a big overshoot', () => {
  it('jumps straight to the range top, counts as the first top session', () => {
    const st = nextAdaptiveState(null, s([12, 12, 12], 7), NOW)!;
    expect(st.nextTarget).toBe(10);
    expect(st.topStreak).toBe(1);
    expect(st.variationStep).toBe(0);
  });
  it('way above → harder variation already next session', () => {
    const st = nextAdaptiveState(null, s([15, 14, 13], 7), NOW)!;
    expect(st.nextTarget).toBe(10);
    expect(st.variationStep).toBe(1);
  });
  it('a plain success still moves +1', () => {
    expect(nextAdaptiveState(null, s([7, 7, 7], 7), NOW)!.nextTarget).toBe(8);
  });
});

describe('describeAdaptiveChange', () => {
  const change = (values: number[], target: number, extra: Partial<SessionResultInput> = {}) => {
    const input = s(values, target, extra);
    return describeAdaptiveChange(null, nextAdaptiveState(null, input, NOW), input, ids, NOW);
  };
  it('kinds', () => {
    expect(change([15, 14, 13], 7)).toMatchObject({ kind: 'harder_variation', overshoot: true, doneMin: 13, doneMax: 15 });
    expect(change([12, 12, 12], 7)).toMatchObject({ kind: 'jump_top', from: 7, to: 10 });
    expect(change([8, 8, 8], 8)).toMatchObject({ kind: 'up', from: 8, to: 9 });
    expect(change([8, 8, 7], 8)).toBeNull(); // held target: nothing to say
    expect(change([8, 8, 8], 8, { skip: true })).toBeNull();
  });
  it('extra set and step back', () => {
    const atTop = s([10, 10, 10], 10);
    const first = nextAdaptiveState(null, atTop, NOW)!;
    const second = nextAdaptiveState(first, atTop, NOW + 1)!;
    expect(describeAdaptiveChange(first, second, atTop, ids, NOW + 1)).toMatchObject({ kind: 'extra_set' });
    const missIn = s([3, 4, 5], 8);
    const m1 = nextAdaptiveState(null, missIn, NOW)!;
    const m2 = nextAdaptiveState(m1, missIn, NOW + 1)!;
    expect(describeAdaptiveChange(m1, m2, missIn, ids, NOW + 1)).toMatchObject({ kind: 'down', from: 8, to: 6 });
  });
});
