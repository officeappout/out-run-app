import { describe, it, expect } from 'vitest';
import {
  computeElevationProfileSamples, downsampleEvenly, polylineLengthM, ROUTE_PROFILE_SAMPLES,
} from '../../dem-tile-cache/elevation-profile';
import type { ElevationProvider } from '../../dem-tile-cache/elevation-provider';
import { attachElevationProfiles } from '../route-elevation';
import { routeDocPayload } from '../firestore-docs';
import { buildValidatedDoc } from '../../route-collections';
import type { LngLat, TrailRoute } from '../types';

// 0.001° of longitude at lat 31.5 ≈ 94.9 m
const line = (lenDeg: number): LngLat[] => [[34.5, 31.5], [34.5 + lenDeg, 31.5]];
const provider = (f: (lng: number) => number | null, storable = true): ElevationProvider =>
  ({ id: storable ? 'copernicus-glo30' : 'mapbox-terrain-rgb', attribution: 'test', storable, sample: (_lat, lng) => f(lng) });
// 100 m at the start, +1 m per 0.0001° (≈ 9.5 m) → a steady ≈10 % climb.
const slope = provider((lng) => 100 + (lng - 34.5) * 10_000);

describe('downsampleEvenly', () => {
  it('n equally spaced, linearly interpolated, ends included', () => {
    const p = downsampleEvenly([0, 10, 20], [0, 50, 100], 5)!;
    expect(p).toEqual({ stepM: 25, elevationsM: [0, 5, 10, 15, 20] });
  });
  it('null for degenerate input', () => {
    expect(downsampleEvenly([1], [0], 5)).toBeNull();
    expect(downsampleEvenly([1, 1], [0, 0], 5)).toBeNull();
    expect(downsampleEvenly([1, 2], [0, 10], 1)).toBeNull();
  });
});

describe('computeElevationProfileSamples', () => {
  it(`stores ${ROUTE_PROFILE_SAMPLES} samples spanning the route`, () => {
    const geom = line(0.03); // ≈ 2.85 km
    const p = computeElevationProfileSamples(geom, slope)!;
    expect(p.elevationsM).toHaveLength(64);
    expect(p.stepM * 63).toBeCloseTo(polylineLengthM(geom), -1);
    expect(p.elevationsM[0]).toBeCloseTo(100, 0);
    expect(p.elevationsM[63]).toBeCloseTo(400, 0);
    for (let i = 1; i < 64; i++) expect(p.elevationsM[i]).toBeGreaterThanOrEqual(p.elevationsM[i - 1]);
  });
  it('null on any DEM coverage gap — never partial', () => {
    expect(computeElevationProfileSamples(line(0.01), provider((lng) => (lng > 34.505 ? null : 5)))).toBeNull();
  });
  it('refuses a display-only provider (Mapbox Terrain-RGB may never be stored)', () => {
    expect(() => computeElevationProfileSamples(line(0.01), provider(() => 5, false))).toThrow(/display-only/);
  });
});

const route = (over: Partial<TrailRoute> = {}): TrailRoute => ({
  id: 'osm_rel_1', kind: 'osm_relation', name: 'שביל', nameSource: 'osm_name', needsName: false,
  activity: 'walking', shape: 'loop', segmentIds: ['s1'], segmentForward: [true], geometry: line(0.03),
  stats: {
    lengthM: 2850, gainM: 300, lossM: 0, maxGrade50mPct: 10, maxGrade50mOpenPct: 10, minEleM: 100, maxEleM: 400,
    builtUpPct: 0, trailPct: 100, litPct: 0, litUnknownPct: 100, surfaceMix: { dirt: 1 },
  },
  difficulty: { npsScore: 10, base: 'medium', technicalReasons: [], urbanCapped: false, final: 'medium' },
  stars: { provenance: 1, scenery: 1, amenities: 0, composition: 1, total: 3 },
  settlement: null, license: 'ODbL', attribution: 'test',
  ...over,
} as TrailRoute);

describe('official_routes doc carries the profile through the validated write path', () => {
  const ctx = { authorityId: 'auth-1', city: 'שער הנגב', osmTimestamp: null, importBatchId: 'b1' };

  it('attachElevationProfiles sets it where DEM covers, drops it where it does not', () => {
    const covered = route();
    const gap = route({ id: 'gen_2', geometry: [[40, 40], [40.01, 40]] });
    const n = attachElevationProfiles([covered, gap], provider((lng) => (lng > 35 ? null : 50)));
    expect(n).toBe(1);
    expect(covered.elevationProfile?.elevationsM).toHaveLength(64);
    expect(gap.elevationProfile).toBeUndefined();
  });

  it('routeDocPayload → buildValidatedDoc(create) keeps elevationProfile', () => {
    const r = route();
    attachElevationProfiles([r], slope);
    const { raw } = routeDocPayload(r, ctx);
    const doc = buildValidatedDoc('official_routes', raw, { mode: 'create', knownAuthorityIds: new Set(['auth-1']) });
    expect(doc.elevationProfile).toEqual(r.elevationProfile);
  });

  it('no profile → no field (never an empty placeholder)', () => {
    const { raw } = routeDocPayload(route(), ctx);
    expect('elevationProfile' in raw).toBe(false);
  });

  it('the schema rejects a malformed profile', () => {
    const { raw } = routeDocPayload(route(), ctx);
    const bad = [
      { stepM: 0, elevationsM: [1, 2] },
      { stepM: 10, elevationsM: [1] },
      { stepM: 10, elevationsM: [1, Number.NaN] },
      { stepM: 10, elevationsM: Array.from({ length: 300 }, () => 1) },
    ];
    for (const elevationProfile of bad) {
      expect(() => buildValidatedDoc('official_routes', { ...raw, elevationProfile }, { mode: 'create', knownAuthorityIds: new Set(['auth-1']) })).toThrow();
    }
  });
});
