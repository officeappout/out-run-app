import { describe, expect, it } from 'vitest';
import { classifyFeature, hasCrossingDetail, hasLitTag, isPromenade, isWalkableWay, surfaceBucket, bikeLayer } from '../classify';

describe('classifyFeature — points', () => {
  it.each([
    [{ amenity: 'bench' }, 'benches'],
    [{ amenity: 'drinking_water' }, 'drinking_water'],
    [{ man_made: 'water_tap', drinking_water: 'yes' }, 'drinking_water'],
    [{ amenity: 'toilets' }, 'toilets'],
    [{ leisure: 'fitness_station' }, 'fitness_stations'],
    [{ leisure: 'pitch', sport: 'basketball' }, 'courts'],
  ])('%o ⇒ %s', (tags, layer) => {
    expect(classifyFeature({ kind: 'node', tags })).toEqual([layer]);
  });
  it('excludes private/customer toilets and non-drinking taps', () => {
    expect(classifyFeature({ kind: 'node', tags: { amenity: 'toilets', access: 'customers' } })).toEqual([]);
    expect(classifyFeature({ kind: 'node', tags: { amenity: 'toilets', access: 'private' } })).toEqual([]);
    expect(classifyFeature({ kind: 'node', tags: { man_made: 'water_tap' } })).toEqual([]);
  });
  it('crossings are highway=crossing nodes only', () => {
    expect(classifyFeature({ kind: 'node', tags: { highway: 'crossing' } })).toEqual(['crossings']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'crossing' } })).toEqual([]);
  });
  it('a pitch mapped as an area is still a court', () => {
    expect(classifyFeature({ kind: 'area', tags: { leisure: 'pitch' } })).toEqual(['courts']);
  });
});

describe('classifyFeature — ways', () => {
  it('major roads', () => {
    for (const hw of ['trunk', 'primary', 'secondary']) expect(classifyFeature({ kind: 'way', tags: { highway: hw } })).toEqual(['major_roads']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'tertiary' } })).toEqual([]);
  });
  it('bike: cycleway or designated path, paved vs offroad', () => {
    expect(classifyFeature({ kind: 'way', tags: { highway: 'cycleway' } })).toEqual(['bike_paved']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path', bicycle: 'designated', surface: 'dirt' } })).toEqual(['bike_offroad']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'track', bicycle: 'designated', tracktype: 'grade4' } })).toEqual(['bike_offroad']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path', bicycle: 'designated', surface: 'unpaved' } })).toEqual(['bike_offroad']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'cycleway', surface: 'paving_stones' } })).toEqual(['bike_paved']);
  });
  it('bike with no surface evidence is unknown, never off-road (I1 review)', () => {
    // Outside built-up areas resolveSurface defaults a track to dirt — still a guess.
    expect(classifyFeature({ kind: 'way', tags: { highway: 'track', bicycle: 'designated' }, inBuiltUp: false })).toEqual(['bike_unknown']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path', bicycle: 'designated' } })).toEqual(['bike_unknown']);
    expect(bikeLayer({ highway: 'path', bicycle: 'designated' })).toBe('bike_unknown');
    expect(bikeLayer({ highway: 'cycleway' })).toBe('bike_paved');
  });
  it('trails: paved vs offroad by surface, falling back to highway class', () => {
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway' } })).toEqual(['trails_paved']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path' } })).toEqual(['trails_offroad']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path', surface: 'asphalt' } })).toEqual(['trails_paved']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'track', tracktype: 'grade3' } })).toEqual(['trails_offroad']);
  });
  it('sidewalks and crossings-as-footway are street, not trail', () => {
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway', footway: 'sidewalk' } })).toEqual([]);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway', footway: 'crossing' } })).toEqual([]);
  });
  it('excludes unusable ways', () => {
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway', access: 'private' } })).toEqual([]);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'path', foot: 'no' } })).toEqual([]);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway', area: 'yes' } })).toEqual([]);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'construction', construction: 'footway' } })).toEqual([]);
  });
  it('promenade is also a trail', () => {
    expect(classifyFeature({ kind: 'way', tags: { highway: 'footway', name: 'טיילת לואי' } })).toEqual(['trails_paved', 'promenades']);
    expect(classifyFeature({ kind: 'way', tags: { highway: 'pedestrian', 'name:en': 'Haifa Promenade' } })).toEqual(['trails_paved', 'promenades']);
  });
  it('untagged ways are not inventoried', () => {
    expect(classifyFeature({ kind: 'way', tags: {} })).toEqual([]);
  });
});

describe('classifyFeature — areas', () => {
  it('park + size class', () => {
    const tags = { leisure: 'park', name: 'פארק' };
    expect(classifyFeature({ kind: 'area', tags })).toEqual(['parks']);
    expect(classifyFeature({ kind: 'area', tags, park: { areaM2: 90_000, perimeterM: 1300, named: true } })).toEqual(['parks', 'big_parks']);
    expect(classifyFeature({ kind: 'area', tags, park: { areaM2: 20_000, perimeterM: 600, named: true } })).toEqual(['parks', 'lap_loops']);
    expect(classifyFeature({ kind: 'area', tags, park: { areaM2: 2_000, perimeterM: 200, named: true } })).toEqual(['parks']);
  });
  it('pedestrian-area promenade', () => {
    expect(classifyFeature({ kind: 'area', tags: { highway: 'pedestrian', name: 'הטיילת' } })).toEqual(['promenades']);
  });
});

describe('helpers', () => {
  it('surfaceBucket marks only real tags as known', () => {
    expect(surfaceBucket({ highway: 'footway', surface: 'asphalt' })).toEqual({ bucket: 'paved', known: true });
    expect(surfaceBucket({ highway: 'footway' })).toEqual({ bucket: 'paved', known: false });
    expect(surfaceBucket({ highway: 'path' }, true)).toEqual({ bucket: 'offroad', known: false });
    expect(surfaceBucket({ highway: 'track', tracktype: 'grade1' })).toEqual({ bucket: 'paved', known: true });
  });
  it('isWalkableWay', () => {
    expect(isWalkableWay({ highway: 'residential' })).toBe(true);
    expect(isWalkableWay({ highway: 'motorway' })).toBe(false);
    expect(isWalkableWay({ highway: 'footway', foot: 'no' })).toBe(false);
  });
  it('hasLitTag: yes/no are tagged, absent/odd are not', () => {
    expect(hasLitTag({ lit: 'yes' })).toBe(true);
    expect(hasLitTag({ lit: 'no' })).toBe(true);
    expect(hasLitTag({})).toBe(false);
    expect(hasLitTag({ lit: 'maybe' })).toBe(false);
  });
  it('hasCrossingDetail', () => {
    expect(hasCrossingDetail({ highway: 'crossing', crossing: 'marked' })).toBe(true);
    expect(hasCrossingDetail({ highway: 'crossing', 'crossing:markings': 'zebra' })).toBe(true);
    expect(hasCrossingDetail({ highway: 'crossing', crossing: 'yes' })).toBe(false);
    expect(hasCrossingDetail({ highway: 'crossing' })).toBe(false);
  });
  it('isPromenade', () => {
    expect(isPromenade({ leisure: 'promenade' })).toBe(true);
    expect(isPromenade({ 'name:he': 'טיילת חוף' })).toBe(true);
    expect(isPromenade({ name: 'רחוב הרצל' })).toBe(false);
  });
});
