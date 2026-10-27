import { describe, it, expect } from 'vitest';
import { defaultProtocolWeightsForLevel, pickWeightedProtocol, resolveProtocolWeights } from '../protocol-weights';

const L = defaultProtocolWeightsForLevel;

describe('defaultProtocolWeightsForLevel', () => {
  it('the owner table', () => {
    expect(L(3)).toEqual({});
    expect(L(8)).toEqual({ antagonist_pair: 25 });
    expect(L(12)).toEqual({ antagonist_pair: 30, emom: 10, amrap: 5 });
    expect(L(20)).toEqual({ antagonist_pair: 30, emom: 15, amrap: 15 });
  });
});

describe('resolveProtocolWeights', () => {
  it('one program: its own weights (amrap is not buildable yet and is ignored)', () => {
    const r = resolveProtocolWeights([L(14)]);
    expect(r.shares).toEqual({ antagonist_pair: 0.3, emom: 0.15 });
    expect(r.probability).toBeCloseTo(0.45);
  });

  it('weakest link: legs at L8 blocks EMOM for the whole session', () => {
    const r = resolveProtocolWeights([L(12), L(14), L(8)]);
    expect(r.shares.emom).toBeUndefined();
    expect(r.shares.antagonist_pair).toBeCloseTo((30 + 30 + 25) / 3 / 100);
  });

  it('a program without weights (or below L6) allows straight sets only', () => {
    expect(resolveProtocolWeights([L(14), undefined]).probability).toBe(0);
    expect(resolveProtocolWeights([L(14), L(4)]).probability).toBe(0);
  });

  it('no pair partner available → no pairs; a short session → no EMOM', () => {
    expect(resolveProtocolWeights([L(14)], { canPair: false }).shares).toEqual({ emom: 0.15 });
    expect(resolveProtocolWeights([L(14)], { sessionMinutes: 15 }).shares).toEqual({ antagonist_pair: 0.3 });
  });

  it('no entries → nothing fires', () => {
    expect(resolveProtocolWeights([])).toEqual({ shares: {}, probability: 0 });
  });
});

describe('pickWeightedProtocol', () => {
  it('follows the weights', () => {
    const shares = { antagonist_pair: 0.3, emom: 0.15 };
    expect(pickWeightedProtocol(shares, () => 0.1)).toBe('antagonist_pair');
    expect(pickWeightedProtocol(shares, () => 0.9)).toBe('emom');
    let pair = 0;
    for (let i = 0; i < 3000; i++) if (pickWeightedProtocol(shares) === 'antagonist_pair') pair++;
    expect(pair / 3000).toBeGreaterThan(0.6);
    expect(pair / 3000).toBeLessThan(0.74);
  });
  it('nothing to pick', () => { expect(pickWeightedProtocol({})).toBeUndefined(); });
});
