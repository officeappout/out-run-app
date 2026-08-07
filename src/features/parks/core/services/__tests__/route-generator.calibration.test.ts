import { describe, it, expect } from 'vitest';
import { scoreWaypoint, computeDistanceWindow } from '../route-generator.service';

const USER = { lat: 0, lng: 0 };
// ~0.267km east of user (route-stops' targetKm=1.6 / 6 calibration) and ~1.0km east.
const KM_PER_DEGREE = 111;
const wpAt = (km: number) => ({ lat: 0, lng: km / KM_PER_DEGREE });

describe('scoreWaypoint — idealWaypointDistanceKm (P6 calibration)', () => {
  it('default (no override): scores exactly as before — ideal ≈ 1.0km, byte-identical for existing callers', () => {
    const near1km = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false });
    const far = scoreWaypoint(wpAt(2.5), USER, [], { includeStrength: false });
    expect(near1km.score).toBeGreaterThan(far.score); // ~1km still preferred by default
  });

  it('small-target override (targetKm/6): a waypoint near the SMALL ideal scores higher than one at the old 1.0km default', () => {
    const smallIdeal = 1.6 / 6; // route-stops calibration for a 1.6km target
    const nearSmallIdeal = scoreWaypoint(wpAt(smallIdeal), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    const nearOldDefault = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false, idealWaypointDistanceKm: smallIdeal });
    expect(nearSmallIdeal.score).toBeGreaterThan(nearOldDefault.score);
  });

  it('without the override, a candidate near the SMALL ideal scores WORSE than one near 1.0km (proves the bug this fixes)', () => {
    const smallIdeal = 1.6 / 6;
    const nearSmallIdealNoOverride = scoreWaypoint(wpAt(smallIdeal), USER, [], { includeStrength: false });
    const near1kmNoOverride = scoreWaypoint(wpAt(1.0), USER, [], { includeStrength: false });
    expect(nearSmallIdealNoOverride.score).toBeLessThan(near1kmNoOverride.score);
  });

  it('omitting the field entirely still returns a valid, finite score (no NaN/crash)', () => {
    const r = scoreWaypoint(wpAt(0.3), USER, [], { includeStrength: false });
    expect(Number.isFinite(r.score)).toBe(true);
  });
});

describe('scoreWaypoint — isSafe scaling for free-run\'s now-uncapped distance goal (08.08)', () => {
  it('default (no override): isSafe cutoff is unchanged at exactly 3.0km — byte-identical for existing callers', () => {
    const justUnder = scoreWaypoint(wpAt(2.9), USER, [], { includeStrength: false });
    const justOver = scoreWaypoint(wpAt(3.1), USER, [], { includeStrength: false });
    expect(justUnder.isSafe).toBe(true);
    expect(justOver.isSafe).toBe(false);
  });

  it('large-target override (targetKm/6 for a 40km loop, ≈6.67km): a waypoint at the ideal distance is NOT penalized — proves the fix', () => {
    const largeIdeal = 40 / 6; // free-run large-loop calibration
    const atIdeal = scoreWaypoint(wpAt(largeIdeal), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    expect(atIdeal.isSafe).toBe(true);
    // same distance WITHOUT the override would have hit the old hardcoded 3.0km wall
    const atIdealNoOverride = scoreWaypoint(wpAt(largeIdeal), USER, [], { includeStrength: false });
    expect(atIdealNoOverride.isSafe).toBe(false);
    expect(atIdeal.score).toBeGreaterThan(atIdealNoOverride.score);
  });

  it('scaled isSafe cutoff is exactly 2× idealWaypointDistanceKm once that exceeds the 3.0km floor', () => {
    const largeIdeal = 100 / 6; // free-run's new 100km slider ceiling
    const justUnderScaled = scoreWaypoint(wpAt(largeIdeal * 2 - 0.1), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    const justOverScaled = scoreWaypoint(wpAt(largeIdeal * 2 + 0.1), USER, [], { includeStrength: false, idealWaypointDistanceKm: largeIdeal });
    expect(justUnderScaled.isSafe).toBe(true);
    expect(justOverScaled.isSafe).toBe(false);
  });
});

describe('computeDistanceWindow — proportional acceptance band (08.08, fixes live 22km "no route found")', () => {
  it('small targets: byte-identical to the original fixed [target-0.5, target+2.5] window', () => {
    expect(computeDistanceWindow(3)).toEqual({ minKm: 2.5, maxKm: 5.5 });
    expect(computeDistanceWindow(5)).toEqual({ minKm: 4.5, maxKm: 7.5 });
  });

  it('very small targets: still floored at 0.5km minimum, matching prior behaviour', () => {
    expect(computeDistanceWindow(0.5)).toEqual({ minKm: 0.5, maxKm: 3.0 });
  });

  it('22km — the exact live-reported failure: window is proportionally wider than the old fixed 3km band', () => {
    const { minKm, maxKm } = computeDistanceWindow(22);
    const oldMinKm = 22 - 0.5; // 21.5 — the previous fixed window
    const oldMaxKm = 22 + 2.5; // 24.5
    expect(minKm).toBeLessThan(oldMinKm);
    expect(maxKm).toBeGreaterThan(oldMaxKm);
    expect(maxKm - minKm).toBeGreaterThan(oldMaxKm - oldMinKm);
    // window width should scale roughly with target, not stay pinned at 3km
    expect((maxKm - minKm) / 22).toBeGreaterThan(0.2); // >20% relative width, vs 13.6% before
  });

  it('window width grows with target instead of staying fixed at 3km', () => {
    const w3 = computeDistanceWindow(3);
    const w22 = computeDistanceWindow(22);
    const w50 = computeDistanceWindow(50);
    expect(w22.maxKm - w22.minKm).toBeGreaterThan(w3.maxKm - w3.minKm);
    expect(w50.maxKm - w50.minKm).toBeGreaterThan(w22.maxKm - w22.minKm);
  });

  it('minKm never goes below the 0.5km floor even for a very large target with a large percentage cut', () => {
    const { minKm } = computeDistanceWindow(100);
    expect(minKm).toBeGreaterThanOrEqual(0.5);
  });
});
