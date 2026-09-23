import { describe, it, expect, vi } from 'vitest';
import { isPointInPolygon, resolveAuthorityForPoint, parseBoundaryGeoJSON, type AuthorityBoundary } from '../authority-resolution';

// Regression coverage for the 23.09.2026 MultiPolygon bug (authority-boundary
// pipeline step): the original hand-rolled ray-casting in isPointInPolygon
// only ever read `polygon.geometry.coordinates[0]` — a single ring — so a
// MultiPolygon boundary silently resolved against only its first part.
// Regional councils (מועצה אזורית) are exactly the case most likely to be a
// MultiPolygon (non-contiguous jurisdiction, exclaves), which is exactly why
// this must be proven correct, not just type-checked.

describe('isPointInPolygon — MultiPolygon', () => {
  // Two disjoint unit squares ("exclaves"), like a regional council with a
  // non-contiguous second parcel.
  const multiPolygon: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        // Part A: a small square around (34.0, 30.0)
        [[[34.0, 30.0], [34.1, 30.0], [34.1, 30.1], [34.0, 30.1], [34.0, 30.0]]],
        // Part B (the "enclave"): a small square far away around (35.0, 31.0)
        [[[35.0, 31.0], [35.1, 31.0], [35.1, 31.1], [35.0, 31.1], [35.0, 31.0]]],
      ],
    },
  };

  it('correctly identifies a point inside the FIRST polygon part', () => {
    expect(isPointInPolygon({ lat: 30.05, lng: 34.05 }, multiPolygon)).toBe(true);
  });

  it('correctly identifies a point inside the SECOND polygon part (the enclave) — the exact case the old single-ring code got wrong', () => {
    expect(isPointInPolygon({ lat: 31.05, lng: 35.05 }, multiPolygon)).toBe(true);
  });

  it('correctly identifies a point outside both parts (including the gap between them)', () => {
    expect(isPointInPolygon({ lat: 30.5, lng: 34.5 }, multiPolygon)).toBe(false);
  });

  it('still handles a plain single Polygon (no regression for the existing LocationPicker.tsx caller)', () => {
    const polygon: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [[[34.0, 30.0], [34.1, 30.0], [34.1, 30.1], [34.0, 30.1], [34.0, 30.0]]],
      },
    };
    expect(isPointInPolygon({ lat: 30.05, lng: 34.05 }, polygon)).toBe(true);
    expect(isPointInPolygon({ lat: 32.0, lng: 36.0 }, polygon)).toBe(false);
  });
});

describe('resolveAuthorityForPoint — MultiPolygon authority', () => {
  const regionalCouncil: AuthorityBoundary = {
    id: 'regional-council-1',
    name: 'מועצה אזורית לדוגמה',
    boundaryGeoJSON: {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[34.0, 30.0], [34.1, 30.0], [34.1, 30.1], [34.0, 30.1], [34.0, 30.0]]],
          [[[35.0, 31.0], [35.1, 31.0], [35.1, 31.1], [35.0, 31.1], [35.0, 31.0]]],
        ],
      },
    },
  };

  it('resolves a point inside the enclave (second polygon part) to the regional council', () => {
    const result = resolveAuthorityForPoint({ lat: 31.05, lng: 35.05 }, [regionalCouncil]);
    expect(result).toEqual({ status: 'resolved', authorityId: 'regional-council-1', cityName: 'מועצה אזורית לדוגמה', method: 'polygon' });
  });

  it('does NOT resolve a point outside both polygon parts', () => {
    const result = resolveAuthorityForPoint({ lat: 30.5, lng: 34.5 }, [regionalCouncil]);
    expect(result).toEqual({ status: 'unresolved' });
  });
});

// Regression coverage for the 23.09.2026 storage-format decision: Firestore
// rejects boundaryGeoJSON as a raw object (nested-array restriction), so it's
// stored as a JSON string and parsed back by this function — the ONE place
// that parse happens (authority.service.ts's Authority mapper calls this).
// Must be defensive: a corrupt/malformed value degrades to "no boundary"
// (null), never throws — a broken boundary crashing the map or the approval
// flow would be worse than just falling back to radiusKm/no-match.
describe('parseBoundaryGeoJSON', () => {
  const validFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [[[34.0, 30.0], [34.1, 30.0], [34.1, 30.1], [34.0, 30.1], [34.0, 30.0]]] },
  };

  it('round-trips a valid JSON.stringify(feature) string back into the same object shape', () => {
    const result = parseBoundaryGeoJSON(JSON.stringify(validFeature));
    expect(result).toEqual(validFeature);
  });

  it('round-trips a valid MultiPolygon feature', () => {
    const multiPolygon: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: 'Feature',
      properties: {},
      geometry: { type: 'MultiPolygon', coordinates: [[[[34.0, 30.0], [34.1, 30.0], [34.1, 30.1], [34.0, 30.1], [34.0, 30.0]]]] },
    };
    expect(parseBoundaryGeoJSON(JSON.stringify(multiPolygon))).toEqual(multiPolygon);
  });

  it('returns null (not a throw) for malformed JSON', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => parseBoundaryGeoJSON('{not valid json')).not.toThrow();
    expect(parseBoundaryGeoJSON('{not valid json')).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null for well-formed JSON that is not a Polygon/MultiPolygon Feature', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBoundaryGeoJSON(JSON.stringify({ type: 'Feature', geometry: { type: 'Point', coordinates: [34, 30] } }))).toBeNull();
    expect(parseBoundaryGeoJSON(JSON.stringify({ hello: 'world' }))).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null for a Polygon/MultiPolygon Feature with missing/malformed coordinates', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBoundaryGeoJSON(JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon', coordinates: null } }))).toBeNull();
    expect(parseBoundaryGeoJSON(JSON.stringify({ type: 'Feature', geometry: { type: 'Polygon' } }))).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns null for absent/null/undefined/wrong-typed input without throwing', () => {
    expect(parseBoundaryGeoJSON(null)).toBeNull();
    expect(parseBoundaryGeoJSON(undefined)).toBeNull();
    expect(parseBoundaryGeoJSON('')).toBeNull();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBoundaryGeoJSON(validFeature as unknown as string)).toBeNull(); // a raw object, not a string
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
