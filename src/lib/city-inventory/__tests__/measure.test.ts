import { describe, expect, it } from 'vitest';
import { buildBoundaryIndex } from '../boundary';
import { areasInside, clipWay, measureOsm, type InventoryFeatures } from '../measure';
import { CITY, area, at, square } from './geo-fixtures';

const b = buildBoundaryIndex(CITY)!;
const node = (id: number, x: number, y: number, tags: Record<string, string>) => {
  const [lon, lat] = at(x, y);
  return { id, lon, lat, tags };
};
const way = (id: number, tags: Record<string, string>, pts: Array<[number, number]>) => ({ id, tags, coords: pts.map(([x, y]) => at(x, y)) });

describe('clipWay', () => {
  it('counts only segments whose midpoint is inside, and splits inside runs', () => {
    const r = clipWay([at(-500, 100), at(-100, 100), at(500, 100), at(1500, 100)], b);
    // (-500→-100) out, (-100→500) mid 200 in → 600 m, (500→1500) mid 1000 = edge → out
    expect(r.lengthM).toBeGreaterThan(590);
    expect(r.lengthM).toBeLessThan(610);
    expect(r.runs).toHaveLength(1);
  });
});

describe('measureOsm', () => {
  const f: InventoryFeatures = {
    nodes: [
      node(1, 100, 100, { amenity: 'bench' }),
      node(2, 200, 100, { amenity: 'bench' }),
      node(3, 2000, 100, { amenity: 'bench' }), // outside
      node(4, 300, 300, { amenity: 'drinking_water' }),
      node(5, 300, 310, { amenity: 'toilets', access: 'customers' }), // excluded
      node(6, 400, 400, { highway: 'crossing', crossing: 'traffic_signals' }),
      node(7, 410, 400, { highway: 'crossing' }),
      node(8, 500, 500, { leisure: 'fitness_station' }),
      node(9, 500, 520, {}), // untagged
    ],
    ways: [
      way(10, { highway: 'residential', lit: 'yes' }, [[0, 50], [1000, 50]]), // street, walkable, lit, ~1000 m
      way(11, { highway: 'footway' }, [[100, 200], [600, 200]]), // trail paved by default, 500 m
      way(12, { highway: 'cycleway', surface: 'asphalt' }, [[100, 600], [400, 600]]), // bike paved, known, 300 m
      way(13, { highway: 'primary', lit: 'no' }, [[50, 0], [50, 1000]]), // major road
      way(14, { highway: 'footway', footway: 'sidewalk' }, [[0, 900], [200, 900]]), // walkable but not a trail
      way(15, { highway: 'service' }, [[0, 800], [200, 800]]), // ignored
      way(16, { highway: 'path', bicycle: 'designated' }, [[700, 100], [900, 100]]), // bike, no surface ⇒ unknown, 200 m
      way(17, { highway: 'track', bicycle: 'designated', surface: 'gravel' }, [[700, 300], [800, 300]]), // bike off-road, known, 100 m
    ],
    areas: [
      area('way/20', { leisure: 'pitch' }, square(700, 700, 30)),
      area('way/21', { leisure: 'park', name: 'פארק' }, square(100, 300, 150)), // perimeter 600 ⇒ lap loop
      area('way/22', { leisure: 'park' }, square(3000, 3000, 100)), // outside
    ],
  };
  const t = measureOsm(f, b);

  it('counts point layers inside the boundary only', () => {
    expect(t.counts).toMatchObject({ benches: 2, drinking_water: 1, toilets: 0, fitness_stations: 1, courts: 1 });
    expect(t.crossings).toEqual({ count: 2, detailed: 1 });
  });

  it('measures linear layers by clipped length and known surface', () => {
    expect(t.linear.major_roads.count).toBe(1);
    expect(t.linear.trails_paved.lengthM).toBeCloseTo(500, -1);
    expect(t.linear.trails_paved.knownSurfaceM).toBe(0);
    expect(t.linear.bike_paved.knownSurfaceM).toBeCloseTo(300, -1);
  });

  it('bike ways with no surface tag go to bike_unknown, not bike_offroad (I1 review)', () => {
    expect(t.linear.bike_unknown.count).toBe(1);
    expect(t.linear.bike_unknown.lengthM).toBeCloseTo(200, -1);
    expect(t.linear.bike_offroad.count).toBe(1);
    expect(t.linear.bike_offroad.lengthM).toBeCloseTo(100, -1);
    expect(t.linear.bike_offroad.knownSurfaceM).toBeCloseTo(100, -1);
  });

  it('streets, walkable length and lit tagging', () => {
    expect(t.streetM).toBeCloseTo(2000, -1); // residential + primary
    expect(t.lighting.walkableM).toBeCloseTo(1000 + 500 + 300 + 1000 + 200 + 200 + 100, -1);
    expect(t.lighting.taggedM).toBeCloseTo(2000, -1); // lit=yes + lit=no
    expect(t.lighting.litM).toBeCloseTo(1000, -1);
    expect(t.walkableLines.length).toBe(7);
  });

  it('parks via measure-parks, only those inside', () => {
    expect(t.parks.parks).toBe(1);
    expect(t.parks.lapLoops).toBe(1);
    expect(t.parks.bigParks).toBe(0);
  });

  it('areasInside uses the ring centre', () => {
    expect(areasInside(f.areas, b).map((a) => a.id)).toEqual(['way/20', 'way/21']);
  });
});
