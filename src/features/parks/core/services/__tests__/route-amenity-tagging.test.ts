import { describe, it, expect } from 'vitest';
import {
  buildAmenitiesSignal,
  summarizeAmenityMatches,
  resolveAmenityPanelCount,
} from '../route-amenity-tagging.service';
import type { RouteAmenityRef } from '../../types/route.types';

function match(category: RouteAmenityRef['category'], overrides: Partial<RouteAmenityRef> = {}): RouteAmenityRef {
  return {
    amenityId: `${category}_1`,
    category,
    distanceFromPathMeters: 10,
    location: { lat: 32.8, lng: 34.99 },
    ...overrides,
  };
}

describe('buildAmenitiesSignal', () => {
  it("hasCityCoverage=false -> status 'no_coverage', zero amenity badges' data source (all counts 0, all has false)", () => {
    const result = buildAmenitiesSignal(false, [], ['pending', 'published']);
    expect(result.status).toBe('no_coverage');
    expect(result.counts).toEqual({ court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0 });
    expect(result.has).toEqual({ court: false, bench: false, drinking_water: false, fitness_station: false, dog_park: false });
  });

  it("hasCityCoverage=true with 0 matches -> status 'computed' with a REAL 0 count (not no_coverage, not absent)", () => {
    const result = buildAmenitiesSignal(true, [], ['pending', 'published']);
    expect(result.status).toBe('computed');
    expect(result.counts.bench).toBe(0);
    expect(result.has.bench).toBe(false);
  });

  it('hasCityCoverage=true with real matches -> counts/has reflect them', () => {
    const result = buildAmenitiesSignal(true, [match('bench'), match('bench'), match('drinking_water')], ['pending', 'published']);
    expect(result.status).toBe('computed');
    expect(result.counts).toEqual({ court: 0, bench: 2, drinking_water: 1, fitness_station: 0, crossing: 0, dog_park: 0 });
    expect(result.has.bench).toBe(true);
    expect(result.has.drinking_water).toBe(true);
    expect(result.has.court).toBe(false);
  });

  it('records sourceStatuses transparently on the signal (sourcing decision, David-approved 01.09.2026)', () => {
    const result = buildAmenitiesSignal(true, [], ['pending', 'published']);
    expect(result.sourceStatuses).toEqual(['pending', 'published']);
    expect(result.source).toBe('osm_amenities_join_v1');
  });
});

describe('summarizeAmenityMatches', () => {
  it('a large crossing count never appears in `has` at all (type-level exclusion, not a runtime filter)', () => {
    const matches = Array.from({ length: 500 }, () => match('crossing'));
    const { counts, has } = summarizeAmenityMatches(matches);
    expect(counts.crossing).toBe(500);
    expect(Object.keys(has)).not.toContain('crossing');
  });
});

describe('resolveAmenityPanelCount', () => {
  it("amenities undefined (never checked) -> null ('אין מידע')", () => {
    expect(resolveAmenityPanelCount(undefined, 'bench')).toBeNull();
  });

  it("status 'no_coverage' -> null ('אין מידע'), regardless of category", () => {
    const noCoverage = { status: 'no_coverage' as const, counts: { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 0, dog_park: 0 } };
    expect(resolveAmenityPanelCount(noCoverage, 'bench')).toBeNull();
    expect(resolveAmenityPanelCount(noCoverage, 'crossing')).toBeNull();
  });

  it("status 'computed' with a real 0 -> returns 0, NOT null (a route can genuinely have zero benches nearby)", () => {
    const computed = { status: 'computed' as const, counts: { court: 0, bench: 0, drinking_water: 3, fitness_station: 0, crossing: 12, dog_park: 0 } };
    expect(resolveAmenityPanelCount(computed, 'bench')).toBe(0);
    expect(resolveAmenityPanelCount(computed, 'bench')).not.toBeNull();
  });

  it("status 'computed' -> returns the real count for crossing too (panel is the uncapped, full-transparency surface)", () => {
    const computed = { status: 'computed' as const, counts: { court: 0, bench: 0, drinking_water: 0, fitness_station: 0, crossing: 2206, dog_park: 0 } };
    expect(resolveAmenityPanelCount(computed, 'crossing')).toBe(2206);
  });
});
