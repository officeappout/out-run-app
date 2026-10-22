import { describe, expect, it } from 'vitest';
import { buildUrbanLayer } from '../layer';
import {
  isUrbanCandidate, measureAmenities, measureComposition, measureCrossings, measureLighting, measureSeparatedMajorShare, measureUrbanRoute, roadHasSidewalkTag, urbanScoreOptions,
} from '../measure';
import type { LngLat, UrbanLayerInput, UrbanWay } from '../types';

// Local metric helpers around Tel Aviv (1° lat ≈ 111.2 km, 1° lng ≈ 94.3 km at 32.08°).
const O: LngLat = [34.78, 32.08];
const at = (eM: number, nM: number): LngLat => [O[0] + eM / 94_300, O[1] + nM / 111_200];
const lineE = (n: number, fromE: number, toE: number, step = 20): LngLat[] => {
  const out: LngLat[] = [];
  for (let e = fromE; e <= toE; e += step) out.push(at(e, n));
  return out;
};
const way = (id: number, highway: string, coords: LngLat[], tags: Record<string, string> = {}): UrbanWay => ({ id, highway, coords, tags: { highway, ...tags } });

function layer(over: Partial<UrbanLayerInput> = {}) {
  return buildUrbanLayer({ ways: [], lamps: [], amenities: [], crossings: [], ...over });
}

describe('measureComposition', () => {
  it('a route on a park footway is all genuine path', () => {
    const l = layer({ ways: [way(1, 'footway', lineE(0, 0, 1000))] });
    const c = measureComposition(lineE(0, 0, 1000, 50), l)!;
    expect(c.genuinePct).toBeGreaterThan(95);
    expect(c.sidewalkPct).toBe(0);
  });
  it('a footway running beside a street is a sidewalk; the street itself is ordinary', () => {
    const l = layer({ ways: [way(1, 'residential', lineE(0, 0, 1000)), way(2, 'footway', lineE(8, 0, 1000))] });
    const side = measureComposition(lineE(9, 0, 1000, 50), l)!;
    expect(side.sidewalkPct).toBeGreaterThan(95);
    const street = measureComposition(lineE(-2, 0, 1000, 50), l)!;
    expect(street.ordinaryPct).toBeGreaterThan(95);
  });
  it('not measured when most of the line has no OSM way under it', () => {
    const l = layer({ ways: [way(1, 'footway', lineE(0, 0, 300))] });
    expect(measureComposition(lineE(0, 0, 1000, 50), l)).toBeNull();
  });
});

describe('measureLighting', () => {
  it('lamps along the way light it; lit=no wins over a lamp', () => {
    const lamps = lineE(5, 0, 1000, 40);
    const lit = layer({ ways: [way(1, 'footway', lineE(0, 0, 1000))], lamps });
    expect(measureLighting(lineE(0, 0, 1000), lit)).toEqual({ known: 1, litPct: 100 });
    const dark = layer({ ways: [way(1, 'footway', lineE(0, 0, 1000), { lit: 'no' })], lamps });
    expect(measureLighting(lineE(0, 0, 1000), dark)).toEqual({ known: 1, litPct: 0 });
  });
  it('unknown (no tag, no lamp) is never unlit — under half known ⇒ not measured', () => {
    const l = layer({ ways: [way(1, 'footway', lineE(0, 0, 1000))], lamps: lineE(5, 0, 300, 40) });
    expect(measureLighting(lineE(0, 0, 1000), l)).toBeNull();
  });
  it('no lighting data at all in the area ⇒ not measured', () => {
    expect(measureLighting(lineE(0, 0, 1000), layer({ ways: [way(1, 'footway', lineE(0, 0, 1000))] }))).toBeNull();
  });
});

describe('measureAmenities', () => {
  it('counts points within 50 m only, by kind', () => {
    const l = layer({ amenities: [
      { kind: 'bench', coord: at(200, 20) }, { kind: 'bench', coord: at(600, -40) },
      { kind: 'drinking_water', coord: at(500, 120) }, { kind: 'toilets', coord: at(900, 10) },
    ] });
    const a = measureAmenities(lineE(0, 0, 1000), l)!;
    expect(a.counts).toEqual({ bench: 2, drinking_water: 0, toilets: 1, fitness_station: 0 });
    expect(a.has.drinking_water).toBe(false);
  });
  it('no amenity points in the area ⇒ not measured (no coverage ≠ none)', () => {
    expect(measureAmenities(lineE(0, 0, 1000), layer())).toBeNull();
  });
});

describe('measureCrossings', () => {
  it('a route crossing a primary road at a marked crossing vs. an unmarked one', () => {
    const road = way(9, 'primary', [at(500, -300), at(500, 300)]);
    const marked = layer({ ways: [road], crossings: [{ id: 1, coord: at(500, 0), control: 'marked' }] });
    const m = measureCrossings(lineE(0, 0, 1000), marked)!;
    expect(m.total).toBe(1);
    expect(m.marked).toBe(1);
    expect(m.unmarked).toBe(0);
    const bare = measureCrossings(lineE(0, 0, 1000), layer({ ways: [road] }))!;
    expect(bare.unmarked).toBe(1);
    expect(bare.unmarkedPerKm).toBeCloseTo(1, 1);
  });
  it('a route walking ON a primary road has a high major-road share', () => {
    const l = layer({ ways: [way(9, 'primary', lineE(0, 0, 1000))] });
    const m = measureCrossings(lineE(0, 0, 1000), l)!;
    expect(m.majorRoadPct).toBeGreaterThan(0.9);
    expect(m.separatedMajorPct).toBe(0);
  });
});

describe('Q-D — separated walkway beside a major road (RC10)', () => {
  const road = way(9, 'primary', lineE(0, 0, 1000));
  it('OSM footway=sidewalk 7 m off the centerline: on the major road, but separated', () => {
    const l = layer({ ways: [road, way(2, 'footway', lineE(7, 0, 1000), { footway: 'sidewalk' })] });
    const m = measureCrossings(lineE(7, 0, 1000), l)!;
    expect(m.majorRoadPct).toBeGreaterThan(0.9);
    expect(m.separatedMajorPct).toBeGreaterThan(0.9);
    expect(m.separatedMajorPct).toBeLessThanOrEqual(m.majorRoadPct);
    expect(measureSeparatedMajorShare(lineE(7, 0, 1000), l)).toBeGreaterThan(0.9);
  });
  it('a road tagged sidewalk=both counts even when the route line sits on the centerline', () => {
    const l = layer({ ways: [way(9, 'primary', lineE(0, 0, 1000), { sidewalk: 'both' })] });
    expect(measureCrossings(lineE(0, 0, 1000), l)!.separatedMajorPct).toBeGreaterThan(0.9);
    expect(roadHasSidewalkTag({ 'sidewalk:right': 'yes' })).toBe(true);
    expect(roadHasSidewalkTag({ sidewalk: 'no' })).toBe(false);
    expect(roadHasSidewalkTag({ sidewalk: 'none' })).toBe(false);
  });
  it('an untagged parallel footway within 15 m counts; one 30 m away or crossing at right angles does not', () => {
    const near = layer({ ways: [road, way(2, 'footway', lineE(12, 0, 1000))] });
    expect(measureSeparatedMajorShare(lineE(0, 0, 1000), near)).toBeGreaterThan(0.9);
    const far = layer({ ways: [road, way(2, 'footway', lineE(30, 0, 1000))] });
    expect(measureSeparatedMajorShare(lineE(0, 0, 1000), far)).toBe(0);
    const across = layer({ ways: [road, way(2, 'footway', [at(500, -200), at(500, 200)])] });
    expect(measureSeparatedMajorShare(lineE(0, 0, 1000), across)).toBeLessThan(0.05);
  });
  it('foot=no walkways and residential roads never count; off a major road there is nothing to separate', () => {
    const noFoot = layer({ ways: [road, way(2, 'cycleway', lineE(6, 0, 1000), { foot: 'no' })] });
    expect(measureSeparatedMajorShare(lineE(0, 0, 1000), noFoot)).toBe(0);
    const quiet = layer({ ways: [way(9, 'residential', lineE(0, 0, 1000), { sidewalk: 'both' }), way(2, 'footway', lineE(7, 0, 1000))] });
    expect(measureCrossings(lineE(7, 0, 1000), quiet)!).toMatchObject({ majorRoadPct: 0, separatedMajorPct: 0 });
  });
});

describe('measureUrbanRoute + urbanScoreOptions', () => {
  it('fills only what was measured', () => {
    const l = layer({ ways: [way(1, 'footway', lineE(0, 0, 1000))] });
    const m = measureUrbanRoute(lineE(0, 0, 1000), l);
    const o = urbanScoreOptions(m);
    expect(o.composition?.genuinePct).toBeGreaterThan(95);
    expect(o.litCoveragePct).toBeUndefined();
    expect(o.amenitiesHas).toBeUndefined();
    expect(o.osmSafety).toEqual({ majorRoadPct: 0, unmarkedPerKm: 0, separatedMajorPct: 0 });
  });
});

describe('isUrbanCandidate', () => {
  it('urban stages only; never a trail-pipeline doc (marked trails keep their own trail measurements)', () => {
    expect(isUrbanCandidate('named_ways', {})).toBe(true);
    expect(isUrbanCandidate('neighbourhood', {})).toBe(true);
    expect(isUrbanCandidate('osm', {})).toBe(false);
    expect(isUrbanCandidate('generated', { trail: { stats: { builtUpPct: 80 } } })).toBe(false);
    expect(isUrbanCandidate('known_routes', { trail: { kind: 'osm_relation' } })).toBe(false);
    expect(isUrbanCandidate('known_routes', { origin: 'web_research' })).toBe(true);
  });
});

describe('urbanInputFromOsm', () => {
  it('keeps highway ways with tags, lamps, amenities (+ fitness), crossings', async () => {
    const { emptyOsmData } = await import('../../trail-graph/osm-opl');
    const { urbanInputFromOsm } = await import('../from-osm');
    const d = emptyOsmData();
    d.nodes.set(1, { id: 1, lon: 34.78, lat: 32.08, tags: {} });
    d.nodes.set(2, { id: 2, lon: 34.79, lat: 32.08, tags: { highway: 'crossing', crossing: 'unmarked' } });
    d.nodes.set(3, { id: 3, lon: 34.785, lat: 32.081, tags: { highway: 'street_lamp' } });
    d.nodes.set(4, { id: 4, lon: 34.785, lat: 32.082, tags: { amenity: 'bench' } });
    d.nodes.set(5, { id: 5, lon: 34.785, lat: 32.083, tags: { amenity: 'toilets' } });
    d.ways.set(10, { id: 10, nodes: [1, 2], tags: { highway: 'footway', lit: 'yes' } });
    d.ways.set(11, { id: 11, nodes: [1, 2], tags: { building: 'yes' } });
    const u = urbanInputFromOsm(d, [[34.7, 32.0]]);
    expect(u.ways.map((w) => w.id)).toEqual([10]);
    expect(u.ways[0].tags.lit).toBe('yes');
    expect(u.lamps).toHaveLength(1);
    expect(u.amenities.map((a) => a.kind).sort()).toEqual(['bench', 'fitness_station', 'toilets']);
    expect(u.crossings).toEqual([{ id: 2, coord: [34.79, 32.08], control: 'unmarked' }]);
  });
});
