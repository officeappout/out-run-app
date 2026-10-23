import { describe, expect, it } from 'vitest';
import { routeMatchesSurfaceFilter, routeSurfaceClass, surfaceMatchesFilter } from '../route-surface';

describe('routeSurfaceClass', () => {
  it('returns the stored class when valid (incl. unknown), without re-deriving', () => {
    expect(routeSurfaceClass({ surfaceClass: 'hike_offroad', surfaceType: 'asphalt', type: 'walking' })).toBe('hike_offroad');
    expect(routeSurfaceClass({ surfaceClass: 'unknown', surfaceType: 'dirt', type: 'walking' })).toBe('unknown');
  });
  it('an invalid stored value falls back to deriving', () => {
    expect(routeSurfaceClass({ surfaceClass: 'moderate', surfaceType: 'dirt', type: 'running' })).toBe('hike_offroad');
  });
  it('derives from the doc own fields: trail stats > surfaceType > coarse features', () => {
    expect(routeSurfaceClass({ type: 'cycling', trail: { stats: { surfaceMix: { gravel: 80, asphalt: 20 } } }, surfaceType: 'asphalt' })).toBe('bike_offroad');
    expect(routeSurfaceClass({ activityType: 'cycling', surfaceType: 'asphalt' })).toBe('bike_road');
    expect(routeSurfaceClass({ type: 'running', surfaceType: 'concrete' })).toBe('walk_run_paved');
    expect(routeSurfaceClass({ type: 'walking', features: { surface: 'trail' } })).toBe('hike_offroad');
  });
  it('no data / garbage → unknown, never throws', () => {
    expect(routeSurfaceClass({ type: 'walking', surfaceType: 'unknown' })).toBe('unknown');
    for (const v of [null, undefined, 5, 'x', [], {}]) expect(routeSurfaceClass(v)).toBe('unknown');
  });
});

describe('surfaceMatchesFilter truth table', () => {
  const all = ['walk_run_paved', 'hike_offroad', 'bike_road', 'bike_offroad', 'unknown'] as const;
  const pass = (f: 'any' | 'paved' | 'offroad', o = {}) => all.filter((c) => surfaceMatchesFilter(c, f, o));
  it('any passes everything', () => expect(pass('any')).toEqual([...all]));
  it('paved / offroad, no activity: both families, unknown hidden by default', () => {
    expect(pass('paved')).toEqual(['walk_run_paved', 'bike_road']);
    expect(pass('offroad')).toEqual(['hike_offroad', 'bike_offroad']);
  });
  it('unknown policy "show" keeps unknown while a filter is active', () => {
    expect(pass('paved', { unknownPolicy: 'show' })).toEqual(['walk_run_paved', 'bike_road', 'unknown']);
    expect(pass('offroad', { unknownPolicy: 'show' })).toEqual(['hike_offroad', 'bike_offroad', 'unknown']);
  });
  it('activity restricts to its family', () => {
    for (const a of ['running', 'walking', 'workout'] as const) {
      expect(pass('paved', { activity: a })).toEqual(['walk_run_paved']);
      expect(pass('offroad', { activity: a })).toEqual(['hike_offroad']);
    }
    expect(pass('paved', { activity: 'cycling' })).toEqual(['bike_road']);
    expect(pass('offroad', { activity: 'cycling' })).toEqual(['bike_offroad']);
  });
  it('routeMatchesSurfaceFilter classifies then tests', () => {
    expect(routeMatchesSurfaceFilter({ type: 'cycling', surfaceType: 'dirt' }, 'offroad', { activity: 'cycling' })).toBe(true);
    expect(routeMatchesSurfaceFilter({ type: 'cycling' }, 'offroad')).toBe(false);
  });
});
