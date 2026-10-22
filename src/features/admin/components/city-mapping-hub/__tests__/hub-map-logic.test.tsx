import { describe, expect, it } from 'vitest';
import { authorityPointsFC, dotRadius, filterRoutesFC, LEVEL_COLORS } from '../hub-map.logic';
import type { HubRow } from '@/lib/city-mapping-hub/rows';

const row = (id: string, over: Partial<HubRow>): HubRow => ({
  authorityId: id, name: id, authorityType: 'city', measured: true, level: 'red', score: 1, approvedRoutes: 0, pendingRoutes: 0, pendingParks: 0, pendingContributions: 0,
  quota: { min: 8, max: 15 }, shadeCoveragePct: null, lightingCoveragePct: null, benchesDensity: null, waterDensity: null, toiletsDensity: null,
  gaps: [], isActiveClient: false, population: null, center: null, lastRefreshAt: null, ...over,
});

describe('hub-map.logic', () => {
  it('one dot per authority with a center; unmeasured grey; filtered-out dimmed', () => {
    const fc = authorityPointsFC([row('a', { center: { lat: 31, lng: 34.8 } }), row('b', { level: null, measured: false, center: { lat: 32, lng: 35 } }), row('c', {})], new Set(['a']));
    expect(fc.features.map((f) => f.properties?.id)).toEqual(['a', 'b']);
    expect(fc.features[0].geometry).toEqual({ type: 'Point', coordinates: [34.8, 31] }); // [lng, lat] — never mirrored
    expect(fc.features[1].properties).toMatchObject({ color: LEVEL_COLORS.none, dim: 1 });
  });
  it('radius grows with population, bounded', () => {
    expect(dotRadius(null)).toBe(5);
    expect(dotRadius(1_000_000)).toBe(18);
    expect(dotRadius(50_000)).toBeGreaterThan(5);
  });
  it('a chip off hides its routes', () => {
    const fc = { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, properties: { status: 'approved' }, geometry: { type: 'Point' as const, coordinates: [0, 0] } }, { type: 'Feature' as const, properties: { status: 'pending' }, geometry: { type: 'Point' as const, coordinates: [0, 0] } }] };
    expect(filterRoutesFC(fc, new Set(['pending'])).features).toHaveLength(1);
  });
});
