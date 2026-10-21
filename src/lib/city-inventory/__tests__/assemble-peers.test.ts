import { describe, expect, it } from 'vitest';
import { assembleLayers, type AssembleContext } from '../assemble';
import { peerMedians, MIN_PEERS } from '../peers';
import { measureShadeCoverage } from '../shade-coverage';
import { resolveShadeSource } from '../shade-source';
import type { OsmTallies } from '../measure';
import { buildShadeIndex } from '@/lib/shade/match';
import { at } from './geo-fixtures';

const tallies = (): OsmTallies => ({
  linear: {
    major_roads: { count: 3, lengthM: 2500, knownSurfaceM: 0 },
    bike_paved: { count: 2, lengthM: 1000, knownSurfaceM: 800 },
    bike_offroad: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    trails_paved: { count: 5, lengthM: 2000, knownSurfaceM: 200 },
    trails_offroad: { count: 1, lengthM: 500, knownSurfaceM: 500 },
    promenades: { count: 1, lengthM: 300, knownSurfaceM: 300 },
  },
  counts: { courts: 4, fitness_stations: 2, benches: 10, drinking_water: 1, toilets: 0 },
  crossings: { count: 4, detailed: 3 },
  lighting: { walkableM: 10_000, taggedM: 2_000, litM: 1_500 },
  streetM: 5_000,
  parks: { parks: 7, parksAreaM2: 250_000, bigParks: 1, bigParksAreaM2: 100_000, lapLoops: 2, lapLoopsAreaM2: 20_000 },
  walkableLines: [],
});

const ctx = (over: Partial<AssembleContext> = {}): AssembleContext => ({
  osmSnapshotDate: '2026-10-20',
  now: new Date('2026-10-21T08:00:00Z'),
  peerMedians: { benches: 1, drinking_water: 1, toilets: null },
  shade: null,
  licensePendingKeys: new Set(['technion_shade']),
  ...over,
});

describe('assembleLayers', () => {
  const L = assembleLayers(tallies(), ctx());

  it('counts and areas, OSM source with the snapshot date', () => {
    expect(L.parks).toMatchObject({ count: 7, areaKm2: 0.25, coveragePct: null, method: 'osm_count' });
    expect(L.big_parks).toMatchObject({ count: 1, areaKm2: 0.1 });
    expect(L.parks.sources[0]).toMatchObject({ key: 'osm', license: 'ODbL-1.0', snapshotDate: '2026-10-20', count: 7 });
    expect(L.major_roads).toMatchObject({ count: 3, lengthKm: 2.5, coveragePct: null });
  });

  it('point layers: density per street-km vs. peer median; null without a peer median', () => {
    expect(L.benches).toMatchObject({ density: 2, coveragePct: 100, method: 'osm_density_vs_peers' });
    expect(L.drinking_water.density).toBe(0.2);
    expect(L.drinking_water.quality).toContain('below_expected_density');
    expect(L.toilets).toMatchObject({ count: 0, density: 0, coveragePct: null });
    expect(L.toilets.quality).not.toContain('below_expected_density');
  });

  it('tag coverage layers', () => {
    expect(L.crossings.coveragePct).toBe(75);
    expect(L.bike_paved.coveragePct).toBe(80);
    expect(L.trails_paved.coveragePct).toBe(10);
    expect(L.trails_paved.quality).toContain('untagged_majority');
    expect(L.bike_offroad).toMatchObject({ count: 0, lengthKm: 0, coveragePct: null });
    expect(L.lighting).toMatchObject({ lengthKm: 1.5, coveragePct: 20 });
  });

  it('shade stays unmeasured without a layer; Technion carries method + licence flag', () => {
    expect(L.shade.method).toBeNull();
    expect(L.shade.coveragePct).toBeNull();
    const choice = resolveShadeSource({ technionCitySlug: 'tel-aviv', canopyAvailable: false })!;
    const S = assembleLayers(tallies(), ctx({
      shade: { coverage: { walkableM: 10_000, matchedM: 8_500, shadedM: 1_000, meanSI: 0.2 }, choice, snapshotDate: '2026-10-21', segmentCount: 99 },
    }));
    expect(S.shade).toMatchObject({ coveragePct: 85, lengthKm: 8.5, method: 'technion_si_daily' });
    expect(S.shade.sources[0]).toMatchObject({ key: 'technion_shade', count: 99, snapshotDate: '2026-10-21' });
    expect(S.shade.quality).toContain('license_pending');
  });
});

describe('peerMedians', () => {
  const row = (authorityId: string, benches: number | null, type: 'city' | 'regional_council' = 'city') => ({ authorityId, authorityType: type, densities: { benches } });

  it(`needs ≥ ${MIN_PEERS} peers of the same type, excluding self`, () => {
    const r = peerMedians('a', 'city', [row('a', 100), row('b', 1), row('c', 3), row('d', 2), row('e', 50, 'regional_council')]);
    expect(r.medians.benches).toBe(2);
    expect(r.peerIds).toEqual(['b', 'c', 'd']);
    expect(peerMedians('a', 'city', [row('b', 1), row('c', 3)]).medians.benches).toBeNull();
    expect(peerMedians('a', 'city', [row('b', 1), row('c', 3), row('d', null)]).medians.benches).toBeNull();
  });
});

describe('measureShadeCoverage', () => {
  it('matched ÷ walkable over all ways; null without an index', () => {
    const idx = buildShadeIndex({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [at(0, 0), at(100, 0)] }, properties: { shadeIndex: 0.4, indexType: 'SI_daily', city: 'tel-aviv', sourceLayer: 't', sourceFeatureId: 1, fetchedAt: '2026-10-21' } }],
    });
    const c = measureShadeCoverage([[at(0, 0), at(100, 0)], [at(0, 500), at(100, 500)]], idx)!;
    expect(c.matchedM / c.walkableM).toBeCloseTo(0.5, 1);
    expect(c.meanSI).toBeCloseTo(0.4, 2);
    expect(c.shadedM).toBeCloseTo(100, -1);
    expect(measureShadeCoverage([[at(0, 0), at(1, 0)]], null)).toBeNull();
  });
});
