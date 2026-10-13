import { describe, it, expect, vi } from 'vitest';
import {
  parseRoundTripPref, bucketTopology, walkLeg, composeRoundTripLegs, displayTotalMin, buildWalkLegsGeoJSON, composedWorkoutMin, cardTotalFor,
  WALK_LEG_SKIP_M, ROUTE_STOPS_ROUND_TRIP_KEY,
} from '../round-trip';

const P = (lat: number, lng: number) => ({ lat, lng });
const NEAR = P(32.0, 34.0);
const FAR = P(32.0 + 800 / 111_320, 34.0); // ~800 m north

describe('round-trip pref', () => {
  it('defaults ON; only an explicit "0" turns it off', () => {
    expect(parseRoundTripPref(null)).toBe(true);
    expect(parseRoundTripPref(undefined)).toBe(true);
    expect(parseRoundTripPref('1')).toBe(true);
    expect(parseRoundTripPref('garbage')).toBe(true);
    expect(parseRoundTripPref('0')).toBe(false);
  });
  it('uses its own NEW key (not the duration key)', () => {
    expect(ROUTE_STOPS_ROUND_TRIP_KEY).toBe('route_stops_round_trip');
  });
});

describe('bucketTopology', () => {
  it('loop stays loop; one_way and out_and_back are LINEAR', () => {
    expect(bucketTopology('loop')).toBe('loop');
    expect(bucketTopology('one_way')).toBe('one_way');
    expect(bucketTopology('out_and_back')).toBe('one_way');
  });
});

const PATH: [number, number][] = [[34.0, 32.0], [34.0, 32.004], [34.0, 32.0072]];
const leg = (seconds: number) => async () => ({ seconds, path: PATH });

describe('walkLeg', () => {
  it('is 0 min, no path (and does not fetch) when already at the point', async () => {
    const f = vi.fn();
    expect(await walkLeg(NEAR, P(32.0 + (WALK_LEG_SKIP_M - 5) / 111_320, 34.0), f)).toEqual({ minutes: 0, path: null });
    expect(f).not.toHaveBeenCalled();
  });
  it('uses the real Mapbox duration (min 1) and keeps the street geometry', async () => {
    expect(await walkLeg(NEAR, FAR, leg(540))).toEqual({ minutes: 9, path: PATH });
    expect((await walkLeg(NEAR, FAR, leg(10))).minutes).toBe(1);
  });
  it('falls back to a straight-line time on null or throw — leg kept in the total, but NO guessed line', async () => {
    expect(await walkLeg(NEAR, FAR, async () => null)).toEqual({ minutes: 10, path: null }); // 800m / 80
    expect(await walkLeg(NEAR, FAR, async () => { throw new Error('net'); })).toEqual({ minutes: 10, path: null });
  });
});

describe('composeRoundTripLegs + displayTotalMin', () => {
  it('there = user→entry, back = end→user; total is ADDED ON TOP', async () => {
    // user=NEAR, entry=FAR, end=FAR: "there" is called from NEAR, "back" from FAR.
    const legs = await composeRoundTripLegs(NEAR, FAR, FAR, async (from) =>
      ({ seconds: from.lat === NEAR.lat ? 360 : 600, path: PATH }));
    expect(legs).toMatchObject({ walkThereMin: 6, walkBackMin: 10 });
    expect(displayTotalMin(40, legs, true)).toBe(56);
    expect(displayTotalMin(40, legs, false)).toBe(40);
    expect(displayTotalMin(40, null, true)).toBe(40);
  });
  it('user standing on the route → both legs 0 → total unchanged', async () => {
    const legs = await composeRoundTripLegs(NEAR, NEAR, NEAR, leg(999));
    expect(legs).toEqual({ walkThereMin: 0, walkBackMin: 0, walkTherePath: null, walkBackPath: null });
    expect(displayTotalMin(30, legs, true)).toBe(30);
  });
});

describe('buildWalkLegsGeoJSON', () => {
  const legs = { walkThereMin: 5, walkBackMin: 6, walkTherePath: PATH, walkBackPath: PATH };
  it('two LineStrings when on; null when off / no legs / nothing drawable', () => {
    const fc = buildWalkLegsGeoJSON(legs, true)!;
    expect(fc.features.map((f) => f.properties!.leg)).toEqual(['there', 'back']);
    expect(buildWalkLegsGeoJSON(legs, false)).toBeNull();
    expect(buildWalkLegsGeoJSON(null, true)).toBeNull();
    expect(buildWalkLegsGeoJSON({ ...legs, walkTherePath: null, walkBackPath: null }, true)).toBeNull();
  });
  it('draws only the leg that has geometry', () => {
    const fc = buildWalkLegsGeoJSON({ ...legs, walkBackPath: null }, true)!;
    expect(fc.features).toHaveLength(1);
  });
});

describe('card total (Phase 2c) — shows the overview\'s number, or nothing', () => {
  const seg = [{}];
  it('composedWorkoutMin = round(aerobic + strength), same as the overview', () => {
    expect(composedWorkoutMin({ segments: seg, totals: { aerobicMin: 21.4, strengthMin: 9.2 } })).toBe(31);
  });
  it('null for stub/gated plans (no segments) and zero totals — the card then shows NO time', () => {
    expect(composedWorkoutMin({ segments: [], totals: { aerobicMin: 20, strengthMin: 10 } })).toBeNull();
    expect(composedWorkoutMin({ segments: seg, totals: { aerobicMin: 0, strengthMin: 0 } })).toBeNull();
    expect(composedWorkoutMin({ segments: seg, totals: {} })).toBeNull();
  });
  const legs = { walkThereMin: 11, walkBackMin: 11, walkTherePath: null, walkBackPath: null };
  it('cardTotalFor adds both walk legs when round-trip is on, flags includesWalk', () => {
    expect(cardTotalFor(31, legs, true)).toEqual({ min: 53, includesWalk: true });
    expect(cardTotalFor(31, legs, false)).toEqual({ min: 31, includesWalk: false });
    expect(cardTotalFor(31, null, true)).toEqual({ min: 31, includesWalk: false });
    expect(cardTotalFor(31, { ...legs, walkThereMin: 0, walkBackMin: 0 }, true)).toEqual({ min: 31, includesWalk: false });
  });
  it('cardTotalFor(null) → null (no placeholder)', () => {
    expect(cardTotalFor(null, legs, true)).toBeNull();
  });
});
