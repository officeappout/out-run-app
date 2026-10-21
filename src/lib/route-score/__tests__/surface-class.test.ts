import { describe, expect, it } from 'vitest';
import { buildSegmentIndex, classifySurface, sharesFromMix, surfaceMixFromSegments, surfaceSharesFromDoc } from '../surface-class';
import { routeScoreInputFromDoc } from '../from-route-doc';
import { line } from './fixtures';

describe('sharesFromMix', () => {
  it('splits paved / unpaved and keeps unknown as the remainder', () => {
    expect(sharesFromMix({ asphalt: 50, dirt: 25, unknown: 25 }, 'trail_stats')).toEqual({ pavedShare: 0.5, unpavedShare: 0.25, knownShare: 0.75, source: 'trail_stats' });
    expect(sharesFromMix({}, 'trail_stats').source).toBe('none');
  });
});

describe('surfaceSharesFromDoc', () => {
  it('prefers a street_segments join, then trail stats, then surfaceType, then coarse features', () => {
    const d = { trail: { stats: { surfaceMix: { dirt: 100 } } }, surfaceType: 'asphalt', features: { surface: 'road' } };
    expect(surfaceSharesFromDoc(d, { asphalt: 10 }).source).toBe('street_segments');
    expect(surfaceSharesFromDoc(d).source).toBe('trail_stats');
    expect(surfaceSharesFromDoc({ surfaceType: 'gravel' })).toMatchObject({ unpavedShare: 1, source: 'route_surface_type' });
    expect(surfaceSharesFromDoc({ surfaceType: 'unknown', features: { surface: 'trail' } })).toMatchObject({ unpavedShare: 1, source: 'coarse_features' });
    expect(surfaceSharesFromDoc({}).source).toBe('none');
  });
});

describe('classifySurface', () => {
  const paved = sharesFromMix({ asphalt: 1 }, 'trail_stats');
  const dirt = sharesFromMix({ dirt: 1 }, 'trail_stats');
  it('four classes by activity + majority surface', () => {
    expect(classifySurface('cycling', paved)).toBe('bike_road');
    expect(classifySurface('cycling', dirt)).toBe('bike_offroad');
    expect(classifySurface('running', paved)).toBe('walk_run_paved');
    expect(classifySurface('walking', dirt)).toBe('hike_offroad');
    expect(classifySurface('walking', sharesFromMix({}, 'none'))).toBe('unknown');
  });
  it('the adapter sets the class', () => {
    expect(routeScoreInputFromDoc('x', { activityType: 'cycling', surfaceType: 'dirt' }).surfaceClass).toBe('bike_offroad');
  });
});

describe('surfaceMixFromSegments', () => {
  it('gives each stretch of the route the surface of the nearest segment within the buffer', () => {
    const route = line(34.8, 32.1, 1000);
    const asphaltHalf = line(34.8, 32.1, 500);
    const dirtHalf = line(34.8 + 500 / (111320 * Math.cos((32.1 * Math.PI) / 180)), 32.1, 500);
    const idx = buildSegmentIndex([{ coords: asphaltHalf, surfaceType: 'asphalt' }, { coords: dirtHalf, surfaceType: 'dirt' }]);
    const s = sharesFromMix(surfaceMixFromSegments(route, idx), 'street_segments');
    expect(s.pavedShare).toBeCloseTo(0.5, 1);
    expect(s.unpavedShare).toBeCloseTo(0.5, 1);
  });
  it('a route far from every segment is all unknown', () => {
    const idx = buildSegmentIndex([{ coords: line(34.9, 32.3, 300), surfaceType: 'asphalt' }]);
    expect(sharesFromMix(surfaceMixFromSegments(line(34.8, 32.1, 300), idx), 'street_segments').knownShare).toBe(0);
  });
});
