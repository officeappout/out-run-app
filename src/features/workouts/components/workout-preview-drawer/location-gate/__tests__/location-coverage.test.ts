import { describe, it, expect } from 'vitest';
import { computeLocationCoverage, type CoverageSlot } from '../location-coverage.util';
import { LOCATION_GATE_DEFAULTS, resolveLocationGateConfig } from '../location-gate.config';

const m = (resolved: boolean, pinned = false): CoverageSlot => ({ kind: 'main', pinned, resolved });
const w = (resolved: boolean): CoverageSlot => ({ kind: 'warmup', pinned: false, resolved });
const c = (resolved: boolean): CoverageSlot => ({ kind: 'cooldown', pinned: false, resolved });

describe('computeLocationCoverage', () => {
  it('an empty workout is allowed', () => {
    expect(computeLocationCoverage([]).allowed).toBe(true);
  });

  it('everything resolved -> allowed, ratio 1', () => {
    const r = computeLocationCoverage([w(true), m(true), m(true), m(true), c(true)]);
    expect(r).toMatchObject({ allowed: true, reason: null, ratio: 1, uncoveredMains: 0 });
  });

  it('one uncovered main of five (8 counted, 7/8 = 87%) is still allowed', () => {
    const r = computeLocationCoverage([w(true), m(true), m(true), m(true), m(true), m(false), c(true)]);
    expect(r.allowed).toBe(true);
    expect(r.uncoveredMains).toBe(1);
  });

  it('two uncovered mains is disabled even when the ratio is above 80%', () => {
    const slots = [...Array(10).fill(0).map(() => m(true)), m(false), m(false)]; // 10/12 = 83%
    const r = computeLocationCoverage(slots);
    expect(r.ratio).toBeGreaterThan(0.8);
    expect(r).toMatchObject({ allowed: false, reason: 'notEnoughContent' });
  });

  it('uncovered warm-up / cool-down never block (home -> park: home-filmed stretches have no park media)', () => {
    // The owner's case 26.10: every main resolves at the park, the 3 cool-down stretches and a warm-up do not.
    const r = computeLocationCoverage([w(false), w(true), m(true), m(true), m(true), m(true), c(false), c(false), c(false)]);
    expect(r).toMatchObject({ allowed: true, reason: null, uncoveredMains: 0 });
    expect(r.resolved).toBe(5); // still reported
  });

  it('warm-up / cool-down count as buildable, so they only ever loosen the ratio', () => {
    // 1 uncovered of 4 mains = 75% on mains alone; with 2 supplementals it is 5/6 = 83% -> allowed
    expect(computeLocationCoverage([w(false), m(true), m(true), m(true), m(false), c(false)]).allowed).toBe(true);
  });

  it('ratio below 80% driven by the mains is still disabled', () => {
    const r = computeLocationCoverage([m(true), m(true), m(false)]); // 2/3 = 67%, one uncovered main
    expect(r.uncoveredMains).toBe(1);
    expect(r).toMatchObject({ allowed: false, reason: 'notEnoughContent' });
  });

  it('an uncovered pinned (goal/skill) main disables, reason pinnedUncovered', () => {
    const r = computeLocationCoverage([m(true), m(true), m(true), m(true), m(true), m(false, true)]);
    expect(r).toMatchObject({ allowed: false, reason: 'pinnedUncovered', pinnedUncovered: 1 });
  });

  it('too few resolvable mains disables, reason tooFewMains', () => {
    const r = computeLocationCoverage([m(true), m(false)]);
    expect(r).toMatchObject({ allowed: false, reason: 'tooFewMains' });
  });

  it('a one-main workout is not blocked by the minimum-mains rule when that main resolves', () => {
    expect(computeLocationCoverage([m(true), w(true)]).allowed).toBe(true);
  });

  it('the thresholds are tunable through the config', () => {
    const slots = [m(true), m(true), m(true), m(false), m(false)]; // 60%, 2 uncovered
    expect(computeLocationCoverage(slots).allowed).toBe(false);
    const loose = resolveLocationGateConfig({ minCoverageRatio: 0.6, maxUncoveredMains: 2 });
    expect(computeLocationCoverage(slots, loose).allowed).toBe(true);
    expect(LOCATION_GATE_DEFAULTS).toMatchObject({ minCoverageRatio: 0.8, maxUncoveredMains: 1 });
  });
});
