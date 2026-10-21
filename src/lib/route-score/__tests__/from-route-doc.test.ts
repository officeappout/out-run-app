import { describe, expect, it } from 'vitest';
import { deriveShape, deriveSourceTier, parsePath, routeScoreInputFromDoc } from '../from-route-doc';
import { line, rectLoop } from './fixtures';

describe('parsePath', () => {
  it('accepts tuples and {lng,lat} objects, drops junk', () => {
    expect(parsePath([[1, 2], { lng: 3, lat: 4 }, { foo: 1 }, null, [NaN, 1]])).toEqual([[1, 2], [3, 4]]);
    expect(parsePath(undefined)).toEqual([]);
  });
});

describe('deriveShape', () => {
  it('prefers shapeType, then routeShape, then geometry', () => {
    expect(deriveShape({ shapeType: 'linear_corridor', routeShape: 'loop' }, [])).toBe('linear_corridor');
    expect(deriveShape({ routeShape: 'point_to_point' }, [])).toBe('point_to_point');
    expect(deriveShape({}, rectLoop(34.8, 32, 300, 300))).toBe('loop');
    expect(deriveShape({ name: 'טיילת הים' }, line(34.8, 32, 2000))).toBe('linear_corridor');
    expect(deriveShape({ name: 'רחוב' }, line(34.8, 32, 2000))).toBe('unclassified');
    expect(deriveShape({}, [])).toBeNull();
  });
});

describe('deriveSourceTier', () => {
  it('maps every known provenance', () => {
    expect(deriveSourceTier({ origin: 'dataset_import' })).toBe('official');
    expect(deriveSourceTier({ source: { type: 'mot_open_data' } })).toBe('official');
    expect(deriveSourceTier({ trail: { kind: 'osm_relation', starBreakdown: { provenance: 2 } } })).toBe('official');
    expect(deriveSourceTier({ trail: { kind: 'osm_relation', osm: { operator: 'KKL' } } })).toBe('official');
    expect(deriveSourceTier({ trail: { kind: 'osm_relation', starBreakdown: { provenance: 1 } } })).toBe('osm_named');
    expect(deriveSourceTier({ trail: { kind: 'generated' } })).toBe('generated');
    expect(deriveSourceTier({ origin: 'park_loop', parkLoopKind: 'perimeter' })).toBe('named_place');
    expect(deriveSourceTier({ origin: 'park_loop', parkLoopKind: 'inner' })).toBe('generated');
    expect(deriveSourceTier({ source: { externalId: 'mapbox:roundtrip/a/5km' } })).toBe('generated');
    expect(deriveSourceTier({ name: 'הקפת גן העיר', source: { externalId: 'osm:way/1' } })).toBe('named_place');
    expect(deriveSourceTier({ source: { externalId: 'osm:rel/9@haifa' } })).toBe('osm_named');
    expect(deriveSourceTier({ source: { externalId: 'osm:stitched/1+2' } })).toBe('stitched');
    expect(deriveSourceTier({ name: 'רחוב הרצל', source: { externalId: 'osm:way/1' } })).toBe('stitched');
    expect(deriveSourceTier({ origin: 'authority_admin' })).toBe('osm_named');
    expect(deriveSourceTier({})).toBe('unknown');
  });
});

describe('routeScoreInputFromDoc', () => {
  it('reads only computed lighting / amenities', () => {
    const i = routeScoreInputFromDoc('x', {
      path: rectLoop(34.8, 32, 400, 400),
      qualitySignals: { lighting: { status: 'unknown', litCoveragePct: 80 }, amenities: { status: 'no_coverage', has: { bench: true } } },
    });
    expect(i.litCoveragePct).toBeNull();
    expect(i.amenitiesHas).toBeNull();
    expect(i.certificate).toBeNull();
  });
  it('flags a fitness stop from nearbyAmenities', () => {
    const i = routeScoreInputFromDoc('x', { nearbyAmenities: [{ category: 'fitness_station' }] });
    expect(i.hasFitnessStop).toBe(true);
  });
  it('certificate becomes edit for a duplicate name below the convention threshold', () => {
    const doc = { distance: 3, path: rectLoop(34.8, 32, 400, 400), qualitySignals: { composition: { genuinePct: 90, sidewalkPct: 0, ordinaryPct: 10, otherPct: 0 } } };
    expect(routeScoreInputFromDoc('x', doc).certificate).toBe('approve');
    expect(routeScoreInputFromDoc('x', doc, { duplicateNameCount: 1 }).certificate).toBe('edit');
  });
  it('survives a completely empty doc', () => {
    const i = routeScoreInputFromDoc('x', {});
    expect(i).toMatchObject({ name: '', authorityId: null, path: [], shape: null, geometry: null });
  });
});
