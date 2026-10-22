import { describe, it, expect } from 'vitest';
import {
  buildRingSteps,
  deltaText,
  formatGain,
  formatPercent,
  pickVariant,
  round1,
  visibleChips,
} from '../levelup-view-model';
import type { GainChip, LevelUpOutcome } from '@/features/user/progression/services/levelup-preview';

const chip = (id: string, gain: number, pushesRing = true): GainChip => ({
  id, kind: pushesRing ? 'completion' : 'linked', gain, pushesRing,
});

const leaf = (over: Partial<LevelUpOutcome> = {}): LevelUpOutcome => ({
  kind: 'leaf',
  programId: 'push',
  before: { level: 4, percent: 64 },
  after: { level: 4, percent: 73.04 },
  leveledUp: false,
  totalGain: 9.04,
  chips: [chip('completion', 6), chip('performance', 3.04)],
  isFirstWorkout: false,
  ...over,
});

describe('rounding — 0.1 inside, integers from 1, never "0%", never raw floats', () => {
  it('formatPercent', () => {
    expect(formatPercent(73.04)).toBe('73');
    expect(formatPercent(0.44)).toBe('0.4');
    expect(formatPercent(0.04)).toBe('0');
    expect(formatPercent(99.96)).toBe('99'); // a ring that did not level up never reads 100
    expect(formatPercent(100)).toBe('100');
    expect(formatPercent(12.3456789)).toBe('12');
  });
  it('formatGain hides zero chips', () => {
    expect(formatGain(0)).toBeNull();
    expect(formatGain(0.04)).toBeNull();
    expect(formatGain(0.06)).toBe('+0.1');
    expect(formatGain(3.04)).toBe('+3');
    expect(formatGain(17.5)).toBe('+18');
    expect(visibleChips([chip('a', 0.01), chip('b', 2)]).map((c) => c.id)).toEqual(['b']);
  });
  it('round1', () => {
    expect(round1(2.25)).toBe(2.3);
    expect(round1(0.04)).toBe(0);
  });
});

describe('variant', () => {
  it('recovery wins; null → unknown; level-up; first; zero', () => {
    expect(pickVariant(leaf(), true)).toBe('recovery');
    expect(pickVariant(null, false)).toBe('unknown');
    expect(pickVariant(leaf({ leveledUp: true }), false)).toBe('levelup');
    expect(pickVariant(leaf({ isFirstWorkout: true }), false)).toBe('first');
    expect(pickVariant(leaf(), false)).toBe('gain');
    expect(pickVariant(leaf({ chips: [], after: { level: 4, percent: 64 }, totalGain: 0 }), false)).toBe('zero');
  });
});

describe('ring steps', () => {
  it('each chip pushes; the last step lands exactly on the stored number', () => {
    const steps = buildRingSteps(leaf());
    expect(steps.map((s) => s.chipId)).toEqual(['completion', 'performance']);
    expect(steps[0].toPercent).toBeCloseTo(64 + 9.04 * (6 / 9.04), 9);
    expect(steps[steps.length - 1].toPercent).toBe(73.04);
  });

  it('level-up: fill to 100, then the new level with the carried-over percent', () => {
    const o = leaf({
      before: { level: 4, percent: 96 },
      after: { level: 5, percent: 6 },
      leveledUp: true,
      totalGain: 10,
      chips: [chip('completion', 8), chip('performance', 2)],
    });
    const steps = buildRingSteps(o);
    expect(steps.map((s) => [s.chipId, s.toPercent, !!s.levelUp])).toEqual([
      ['completion', 99.2, false],
      ['performance', 100, false],
      [null, 6, true],
    ]);
  });

  it('linked chips appear after, without moving the ring; zero chips are skipped', () => {
    const o = leaf({ chips: [chip('completion', 9.04), chip('zero', 0.01), chip('linked:planche', 2, false)] });
    const steps = buildRingSteps(o);
    expect(steps.map((s) => s.chipId)).toEqual(['completion', 'linked:planche']);
    expect(steps[1].toPercent).toBe(73.04);
  });

  it('master whose average drops (a child wrapped) never animates backwards mid-chips', () => {
    const o: LevelUpOutcome = {
      kind: 'master', programId: 'full_body', before: { level: 5, percent: 50 }, after: { level: 5, percent: 20 },
      leveledUp: false, totalGain: null, chips: [chip('domain:pull', 8)], isFirstWorkout: false,
    };
    const steps = buildRingSteps(o);
    expect(steps[0].toPercent).toBe(50);
    expect(steps[steps.length - 1].toPercent).toBe(20);
  });
});

describe('delta pill', () => {
  it('leaf = total gain; master = the average move; hidden when nothing', () => {
    expect(deltaText(leaf())).toBe('+9');
    const master: LevelUpOutcome = { ...leaf(), kind: 'master', totalGain: null, before: { level: 5, percent: 30 }, after: { level: 5, percent: 32.4 } };
    expect(deltaText(master)).toBe('+2');
    expect(deltaText({ ...master, after: master.before })).toBeNull();
  });
});
