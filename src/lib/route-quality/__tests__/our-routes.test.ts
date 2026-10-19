import { describe, expect, it } from 'vitest';
import { buildOurRoutesIndex, ourRoutesNear, ourRoutesShare, type OurRouteLine } from '../our-routes';
import { ORIGIN, SQUARE, dense, m } from './fixtures';

const southSide: OurRouteLine = { id: 'south', path: m(dense([[-100, 3], [600, 3]])) };
const eastSideReversed: OurRouteLine = { id: 'east', path: m(dense([[497, 600], [497, -100]])) };
const farAway: OurRouteLine = { id: 'far', path: m(dense([[3000, 3000], [4000, 3000]])) };
const crossingNorthSouth: OurRouteLine = { id: 'cross', path: m(dense([[250, -300], [250, 300]])) };

describe('ourRoutesShare', () => {
  it('is 0 without an index or with no nearby routes', () => {
    expect(ourRoutesShare(SQUARE, null).share).toBe(0);
    const r = ourRoutesShare(SQUARE, buildOurRoutesIndex([farAway], ORIGIN));
    expect(r.share).toBe(0);
    expect(r.routesUsed).toBe(0);
  });

  it('counts one side of a 2 km square as ~25%, either direction of travel', () => {
    const one = ourRoutesShare(SQUARE, buildOurRoutesIndex([southSide], ORIGIN));
    expect(one.share).toBeGreaterThan(0.23);
    expect(one.share).toBeLessThan(0.27);
    expect(one.routeIds).toEqual(['south']);

    const two = ourRoutesShare(SQUARE, buildOurRoutesIndex([southSide, eastSideReversed, farAway], ORIGIN));
    expect(two.share).toBeGreaterThan(0.48);
    expect(two.share).toBeLessThan(0.52);
    expect(two.routesUsed).toBe(2);
  });

  it('does not count a perpendicular crossing, nor a parallel street outside the buffer', () => {
    // The square's north side (y=500) never meets the crossing route; its south side crosses it at x=250.
    const r = ourRoutesShare(SQUARE, buildOurRoutesIndex([crossingNorthSouth], ORIGIN));
    expect(r.share).toBe(0);
    const parallel40m: OurRouteLine = { id: 'p', path: m(dense([[-100, 40], [600, 40]])) };
    expect(ourRoutesShare(SQUARE, buildOurRoutesIndex([parallel40m], ORIGIN)).share).toBe(0);
  });

  it('ignores routes used for less than the minimum stretch', () => {
    const shortBit: OurRouteLine = { id: 'short', path: m(dense([[0, 2], [60, 2]])) };
    const r = ourRoutesShare(SQUARE, buildOurRoutesIndex([shortBit], ORIGIN));
    expect(r.share).toBeGreaterThan(0);
    expect(r.routesUsed).toBe(0);
  });
});

describe('ourRoutesNear', () => {
  it('keeps only routes with a vertex inside the radius', () => {
    const near = ourRoutesNear([southSide, farAway], ORIGIN, 1500);
    expect(near.map(r => r.id)).toEqual(['south']);
  });
});
