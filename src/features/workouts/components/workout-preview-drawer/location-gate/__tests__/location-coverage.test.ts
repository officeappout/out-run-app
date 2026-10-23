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

  it('ratio below 80% with one uncovered main is disabled (warm-up and cool-down count)', () => {
    // 3 of 5 counted resolved = 60%; only ONE main uncovered but the unresolved warm-up/cool-down pull the ratio down
    const r = computeLocationCoverage([w(false), m(true), m(true), m(false), c(false)]);
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
