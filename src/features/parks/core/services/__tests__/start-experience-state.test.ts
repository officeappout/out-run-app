import { describe, it, expect } from 'vitest';
import {
  computeStartExperienceState,
  estimateWalkMinutesFromKm,
  ARRIVAL_RADIUS_M,
  ON_ROUTE_CROSS_TRACK_M,
  WALK_TO_ROUTE_THRESHOLD_MIN,
} from '../start-experience-state';

/**
 * Regression — "start experience" state map (field feedback, 11.10.2026).
 * At start / on route / off-route-walkable / off-route-too-far, keyed on a
 * real walking-TIME threshold (15 min), shared by every entry point that
 * can start a route or hybrid session.
 *
 * CRITICAL: this function gates a live, shared start path. Every "missing
 * data" case MUST fail open ('on_route' — never blocks) — see the
 * dedicated regression-guard describe block below.
 */

// A short straight route: [34.0,32.0] -> [34.01,32.0] (~930m east, roughly
// 0.00901 deg lng at this latitude).
const ROUTE_PATH: number[][] = [[34.0, 32.0], [34.01, 32.0]];

describe('computeStartExperienceState — the 4 branches', () => {
  it('at_start: user within ARRIVAL_RADIUS_M of the route start', () => {
    // ~5m east of the start point — well inside the 30m arrival radius.
    const pos = { lat: 32.0, lng: 34.0 + 5 / 111_320 };
    expect(computeStartExperienceState(pos, ROUTE_PATH, null)).toBe('at_start');
  });

  it('on_route: user within ON_ROUTE_CROSS_TRACK_M of the route path, not at the start', () => {
    // ~10m perpendicular off a midpoint of the route, further than ARRIVAL_RADIUS_M
    // from the start point but well inside the 40m on-route threshold.
    const pos = { lat: 32.0 + 10 / 111_320, lng: 34.005 };
    const state = computeStartExperienceState(pos, ROUTE_PATH, null);
    expect(state).toBe('on_route');
  });

  it('off_route_walkable: off the route, walk time at/under the 15-min threshold', () => {
    const farPos = { lat: 32.01, lng: 34.0 }; // ~1.1km north, off the path
    expect(computeStartExperienceState(farPos, ROUTE_PATH, 15)).toBe('off_route_walkable');
    expect(computeStartExperienceState(farPos, ROUTE_PATH, 1)).toBe('off_route_walkable');
  });

  it('off_route_too_far: off the route, walk time over the 15-min threshold', () => {
    const farPos = { lat: 32.01, lng: 34.0 };
    expect(computeStartExperienceState(farPos, ROUTE_PATH, 16)).toBe('off_route_too_far');
    expect(computeStartExperienceState(farPos, ROUTE_PATH, 45)).toBe('off_route_too_far');
  });
});

describe('computeStartExperienceState — REGRESSION GUARD: fail-open on missing data', () => {
  it('no live position -> on_route (never blocks)', () => {
    expect(computeStartExperienceState(null, ROUTE_PATH, 999)).toBe('on_route');
    expect(computeStartExperienceState(undefined, ROUTE_PATH, 999)).toBe('on_route');
  });

  it('no route path (routeless workout, e.g. plain strength) -> on_route (never blocks)', () => {
    const pos = { lat: 32.01, lng: 34.0 };
    expect(computeStartExperienceState(pos, null, 999)).toBe('on_route');
    expect(computeStartExperienceState(pos, undefined, 999)).toBe('on_route');
    expect(computeStartExperienceState(pos, [], 999)).toBe('on_route');
    expect(computeStartExperienceState(pos, [[34, 32]], 999)).toBe('on_route'); // single-point path
  });

  it('off route but walk-minutes not yet computed -> on_route (never blocks a start that works today)', () => {
    const farPos = { lat: 32.01, lng: 34.0 };
    expect(computeStartExperienceState(farPos, ROUTE_PATH, null)).toBe('on_route');
    expect(computeStartExperienceState(farPos, ROUTE_PATH, undefined)).toBe('on_route');
  });

  it('non-finite position coordinates -> on_route (never blocks)', () => {
    expect(computeStartExperienceState({ lat: NaN, lng: 34.0 }, ROUTE_PATH, 999)).toBe('on_route');
    expect(computeStartExperienceState({ lat: 32.0, lng: Infinity }, ROUTE_PATH, 999)).toBe('on_route');
  });

  it('non-finite walk-minutes -> on_route (never blocks)', () => {
    const farPos = { lat: 32.01, lng: 34.0 };
    expect(computeStartExperienceState(farPos, ROUTE_PATH, NaN)).toBe('on_route');
  });
});

describe('estimateWalkMinutesFromKm — fallback estimate for non-focused carousel cards', () => {
  it('converts km to minutes at 80 m/min, minimum 1', () => {
    expect(estimateWalkMinutesFromKm(0.08)).toBe(1); // 80m -> 1 min floor
    expect(estimateWalkMinutesFromKm(1.2)).toBe(15); // 1200m / 80 = 15
  });

  it('returns null for missing/invalid input rather than a fabricated number', () => {
    expect(estimateWalkMinutesFromKm(null)).toBeNull();
    expect(estimateWalkMinutesFromKm(undefined)).toBeNull();
    expect(estimateWalkMinutesFromKm(NaN)).toBeNull();
    expect(estimateWalkMinutesFromKm(-1)).toBeNull();
  });
});

describe('exported constants match the documented values', () => {
  it('ARRIVAL_RADIUS_M is 30 (re-exported from useWalkToRoute.ts, not duplicated)', () => {
    expect(ARRIVAL_RADIUS_M).toBe(30);
  });
  it('ON_ROUTE_CROSS_TRACK_M mirrors useRunningPlayer.ts\'s ROUTE_DEVIATION_THRESHOLD_M (40)', () => {
    expect(ON_ROUTE_CROSS_TRACK_M).toBe(40);
  });
  it('WALK_TO_ROUTE_THRESHOLD_MIN is the core ask\'s 15 minutes', () => {
    expect(WALK_TO_ROUTE_THRESHOLD_MIN).toBe(15);
  });
});
