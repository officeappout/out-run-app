import { describe, it, expect, vi } from 'vitest';
import {
  parseRoundTripPref, bucketTopology, walkLegMinutes, composeRoundTripLegs, displayTotalMin,
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

describe('walkLegMinutes', () => {
  it('is 0 (and does not fetch) when already at the point', async () => {
    const f = vi.fn();
    expect(await walkLegMinutes(NEAR, P(32.0 + (WALK_LEG_SKIP_M - 5) / 111_320, 34.0), f)).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });
  it('uses the real Mapbox duration, rounded, minimum 1 min', async () => {
    expect(await walkLegMinutes(NEAR, FAR, async () => 540)).toBe(9);
    expect(await walkLegMinutes(NEAR, FAR, async () => 10)).toBe(1);
  });
  it('falls back to a straight-line estimate on null or throw — never drops the leg', async () => {
    expect(await walkLegMinutes(NEAR, FAR, async () => null)).toBe(10); // 800m / 80
    expect(await walkLegMinutes(NEAR, FAR, async () => { throw new Error('net'); })).toBe(10);
  });
});

describe('composeRoundTripLegs + displayTotalMin', () => {
  it('there = user→entry, back = end→user; total is ADDED ON TOP', async () => {
    // user=NEAR, entry=FAR, end=FAR: "there" is called from NEAR, "back" from FAR.
    const legs = await composeRoundTripLegs(NEAR, FAR, FAR, async (from) =>
      from.lat === NEAR.lat ? 360 : 600);
    expect(legs).toEqual({ walkThereMin: 6, walkBackMin: 10 });
    expect(displayTotalMin(40, legs, true)).toBe(56);
    expect(displayTotalMin(40, legs, false)).toBe(40);
    expect(displayTotalMin(40, null, true)).toBe(40);
  });
  it('user standing on the route → both legs 0 → total unchanged', async () => {
    const legs = await composeRoundTripLegs(NEAR, NEAR, NEAR, async () => 999);
    expect(legs).toEqual({ walkThereMin: 0, walkBackMin: 0 });
    expect(displayTotalMin(30, legs, true)).toBe(30);
  });
});
