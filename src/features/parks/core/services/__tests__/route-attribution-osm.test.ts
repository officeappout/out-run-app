import { describe, it, expect } from 'vitest';
import { routeDataCredits, isOsmDerivedRoute, OSM_CREDIT } from '../route-attribution';

const keys = (r: Parameters<typeof routeDataCredits>[0]) => routeDataCredits(r).map((c) => c.key);

describe('OSM credit beyond trails provenance', () => {
  it("origin:'osm_import' (geo-discovery / trail-graph / approval-center writers)", () => {
    expect(keys({ origin: 'osm_import' })).toEqual(['osm']);
    expect(routeDataCredits({ origin: 'osm_import' })[0].text).toBe(OSM_CREDIT);
  });
  it('source.externalId with an osm: key', () => {
    for (const id of ['osm:rel/123', 'osm:way/456', 'osm:stitched/789']) {
      expect(isOsmDerivedRoute({ source: { externalId: id } })).toBe(true);
    }
    expect(isOsmDerivedRoute({ source: { externalId: 'mapbox:roundtrip/x' } })).toBe(false);
  });
  it('source.name naming OSM', () => {
    expect(isOsmDerivedRoute({ source: { name: 'OSM Geo-Discovery' } })).toBe(true);
    expect(isOsmDerivedRoute({ source: { name: 'OSM trails (Geofabrik)' } })).toBe(true);
    expect(isOsmDerivedRoute({ source: { name: 'OpenStreetMap import' } })).toBe(true);
    expect(isOsmDerivedRoute({ source: { name: 'Navigation' } })).toBe(false);
    expect(isOsmDerivedRoute({ source: { name: 'Cosmos park' } })).toBe(false);
  });
  it('stitched sourceWayIds and OSM-derived quality signals', () => {
    expect(isOsmDerivedRoute({ sourceWayIds: [1, 2] })).toBe(true);
    expect(isOsmDerivedRoute({ sourceWayIds: [] })).toBe(false);
    expect(isOsmDerivedRoute({ qualitySignals: { source: 'osm_overpass_v1' } })).toBe(true);
  });
  it('manual / user / nav routes get no credit; osm credit is not duplicated', () => {
    expect(keys({ origin: 'super_admin', source: { name: 'Admin', externalId: 'manual-1' } })).toEqual([]);
    expect(keys({ source: { name: 'Navigation' } })).toEqual([]);
    expect(keys(null)).toEqual([]);
    expect(keys({ origin: 'osm_import', provenance: { osm: { license: 'ODbL-1.0' }, elevation: { provider: 'copernicus-glo30' } }, sourceWayIds: [1] }))
      .toEqual(['osm', 'copernicus']);
  });
});
