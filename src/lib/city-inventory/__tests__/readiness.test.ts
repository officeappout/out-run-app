import { describe, expect, it } from 'vitest';
import {
  GREEN_MIN_SHADE_COVERAGE_PCT,
  READINESS_WEIGHTS,
  RED_MIN_APPROVED_ROUTES,
  computeReadiness,
  isLayerMeasured,
  routeQuotaMin,
  type ReadinessInput,
} from '../readiness';
import { emptyLayer } from '../doc';
import { allMeasured, measuredLayer } from './fixtures';

const base = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  hasBoundary: true,
  osmSnapshotDate: '2026-10-01',
  approvedRoutes: 30,
  authorityType: 'city',
  population: 215_000,
  layers: allMeasured(),
  ...over,
});

describe('constants', () => {
  it('weights sum to 100', () => {
    expect(Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('plan §6.2 thresholds', () => {
    expect(RED_MIN_APPROVED_ROUTES).toBe(3);
    expect(GREEN_MIN_SHADE_COVERAGE_PCT).toBe(80);
  });
});

describe('routeQuotaMin (RC3 §3.7 lower bounds)', () => {
  it.each([
    ['city', 250_000, 25],
    ['city', 200_000, 25],
    ['city', 100_000, 15],
    ['local_council', 20_000, 8],
    ['city', null, 8],
    ['regional_council', 500_000, 10],
  ] as const)('%s pop %s ⇒ %d', (type, pop, q) => {
    expect(routeQuotaMin(type, pop)).toBe(q);
  });
});

describe('isLayerMeasured', () => {
  it('any non-null metric counts; count 0 counts (measured zero)', () => {
    expect(isLayerMeasured(emptyLayer())).toBe(false);
    expect(isLayerMeasured(undefined)).toBe(false);
    expect(isLayerMeasured({ ...emptyLayer(), count: 0 })).toBe(true);
    expect(isLayerMeasured({ ...emptyLayer(), lengthKm: 3 })).toBe(true);
  });
});

describe('computeReadiness', () => {
  it('green when everything holds', () => {
    const r = computeReadiness(base());
    expect(r).toEqual({ score: 100, level: 'green', missing: [], blockers: [] });
  });

  it('red without boundary / snapshot / 3 routes', () => {
    expect(computeReadiness(base({ hasBoundary: false })).level).toBe('red');
    expect(computeReadiness(base({ osmSnapshotDate: null })).level).toBe('red');
    expect(computeReadiness(base({ osmSnapshotDate: 'garbage' })).level).toBe('red');
    expect(computeReadiness(base({ approvedRoutes: 2 })).level).toBe('red');
  });

  it('red when an OSM layer is unmeasured, and lists it as missing', () => {
    const layers = allMeasured();
    layers.toilets = emptyLayer();
    const r = computeReadiness(base({ layers }));
    expect(r.level).toBe('red');
    expect(r.missing).toContain('toilets');
  });

  it('red below the route quota; score scales with routes', () => {
    const r = computeReadiness(base({ approvedRoutes: 10 }));
    expect(r.level).toBe('red');
    expect(r.blockers.some((b) => b.includes('quota minimum 25'))).toBe(true);
    expect(r.score).toBe(100 - READINESS_WEIGHTS.routeQuota + Math.round(READINESS_WEIGHTS.routeQuota * (10 / 25)));
  });

  it('yellow when shade is short of 80 %', () => {
    const layers = allMeasured();
    layers.shade = measuredLayer({ coveragePct: 79.9, method: 'canopy_estimate' });
    const r = computeReadiness(base({ layers }));
    expect(r.level).toBe('yellow');
    expect(r.missing).toEqual(['shade']);
    expect(r.score).toBe(100 - READINESS_WEIGHTS.shade);
  });

  it('yellow when shade is not measured at all (shade is not an OSM layer)', () => {
    const layers = allMeasured();
    layers.shade = emptyLayer();
    const r = computeReadiness(base({ layers }));
    expect(r.level).toBe('yellow');
    expect(r.blockers).toContain('shade not measured');
  });

  it('yellow when a point layer is below expected density', () => {
    const layers = allMeasured();
    layers.drinking_water = measuredLayer({ quality: ['below_expected_density'] });
    const r = computeReadiness(base({ layers }));
    expect(r.level).toBe('yellow');
    expect(r.missing).toEqual(['drinking_water']);
  });

  it('yellow when a licence is pending or a source has no date', () => {
    const a = allMeasured();
    a.bike_paved = measuredLayer({ quality: ['license_pending'] });
    expect(computeReadiness(base({ layers: a })).level).toBe('yellow');
    const b = allMeasured();
    b.benches = measuredLayer({ sources: [{ key: 'osm', license: 'ODbL', attribution: 'x', snapshotDate: '', count: 1 }] });
    expect(computeReadiness(base({ layers: b })).level).toBe('yellow');
  });

  it('a regional council needs 10 routes', () => {
    expect(computeReadiness(base({ authorityType: 'regional_council', approvedRoutes: 10 })).level).toBe('green');
    expect(computeReadiness(base({ authorityType: 'regional_council', approvedRoutes: 9 })).level).toBe('red');
  });

  it('empty input is red with score 0 and does not throw', () => {
    const r = computeReadiness({ hasBoundary: false, osmSnapshotDate: null, approvedRoutes: NaN, authorityType: 'city', population: null, layers: {} });
    expect(r.level).toBe('red');
    expect(r.score).toBe(READINESS_WEIGHTS.pointDensity + READINESS_WEIGHTS.sourcesClean);
  });
});
