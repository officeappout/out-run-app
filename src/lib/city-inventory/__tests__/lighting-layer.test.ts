import { describe, expect, it } from 'vitest';
import { assembleLayers, type AssembleContext } from '../assemble';
import { buildCityInventoryDoc, readCityInventoryDoc } from '../doc';
import type { OsmTallies } from '../measure';

const tallies = (): OsmTallies => ({
  linear: {
    major_roads: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    bike_paved: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    bike_offroad: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    trails_paved: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    trails_offroad: { count: 0, lengthM: 0, knownSurfaceM: 0 },
    promenades: { count: 0, lengthM: 0, knownSurfaceM: 0 },
  },
  counts: { courts: 0, fitness_stations: 0, benches: 0, drinking_water: 0, toilets: 0 },
  crossings: { count: 0, detailed: 0 },
  lighting: { walkableM: 10_000, taggedM: 2_000, litM: 1_500 },
  streetM: 5_000,
  parks: { parks: 0, parksAreaM2: 0, bigParks: 0, bigParksAreaM2: 0, lapLoops: 0, lapLoopsAreaM2: 0 },
  walkableLines: [],
});

const ctx = (over: Partial<AssembleContext> = {}): AssembleContext => ({
  osmSnapshotDate: '2026-10-20',
  now: new Date('2026-10-21T08:00:00Z'),
  peerMedians: {},
  shade: null,
  licensePendingKeys: new Set(['beer_sheva_street_lights']),
  ...over,
});

describe('lighting layer', () => {
  it('without a lighting file: OSM lit-tag coverage, unchanged', () => {
    const L = assembleLayers(tallies(), ctx());
    expect(L.lighting).toMatchObject({ method: 'osm_tag_coverage', coveragePct: 20, lengthKm: 1.5 });
  });
  it('with a lighting file: lamp_proximity_merge, known ÷ walkable, every source listed, licence flag', () => {
    const L = assembleLayers(
      tallies(),
      ctx({
        lighting: {
          coverage: { walkableM: 10_000, knownM: 6_000, litM: 5_500 },
          sources: [
            { key: 'osm_street_lamps', license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', snapshotDate: '2026-10-20', count: 181 },
            { key: 'beer_sheva_street_lights', license: 'Other (Open)', attribution: 'עיריית באר שבע', snapshotDate: '2026-10-21', count: 29_856 },
          ],
        },
      }),
    );
    expect(L.lighting).toMatchObject({ method: 'lamp_proximity_merge', coveragePct: 60, lengthKm: 5.5 });
    expect(L.lighting.sources.map((s) => s.key)).toEqual(['osm_street_lamps', 'beer_sheva_street_lights']);
    expect(L.lighting.quality).toContain('license_pending');
    expect(L.lighting.quality).not.toContain('single_source');
  });
  it('the new method survives the Firestore doc round trip', () => {
    const L = assembleLayers(tallies(), ctx({ lighting: { coverage: { walkableM: 10, knownM: 5, litM: 5 }, sources: [] } }));
    const inv = {
      authorityId: 'a',
      city: 'x',
      authorityType: 'city' as const,
      areaKm2: 1,
      snapshot: { osmPbfDate: '2026-10-20', builtAt: new Date('2026-10-21T08:00:00Z'), builtBy: 't', runId: 'r' },
      layers: L,
      readiness: { score: 0, level: 'red' as const, missing: [], blockers: [] },
    };
    const back = readCityInventoryDoc('a', buildCityInventoryDoc(inv, new Date('2026-10-21T08:00:00Z')));
    expect(back?.layers.lighting.method).toBe('lamp_proximity_merge');
  });
});
