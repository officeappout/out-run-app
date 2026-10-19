import { describe, expect, it } from 'vitest';
import type { OurRouteLine } from '@/lib/route-quality';
import { buildOurRoutesArea, clipLineToRadius, OUR_ROUTES_AREA_ID, parseWireOurRoutes, simplifyLineM, toWireOurRoutes, WIRE_MAX_ROUTES } from '../our-routes';
import { buildCustomModel, PARKS_AREA_ID } from '../graphhopper/custom-model';
import { DEFAULT_TAGS, type GeoJsonPolygonFeature } from '../graphhopper/types';
import { parseGenerateRequest } from '../api-contract';

const S = { lat: 32.0779, lng: 34.774 };
const KM_LAT = 111.32, KM_LNG = 94.4;
/** A wiggly east–west line `northKm` north of S, one vertex every 10 m. */
const line = (id: string, northKm: number, lenKm = 2, wiggleM = 0): OurRouteLine => ({
  id,
  path: Array.from({ length: lenKm * 100 + 1 }, (_, k) => [
    S.lng + (-lenKm / 2 + k / 100) / KM_LNG,
    S.lat + (northKm + (k % 2 ? wiggleM / 1000 : 0)) / KM_LAT,
  ] as [number, number]),
});

describe('simplify / clip', () => {
  it('drops collinear vertices but keeps real bends', () => {
    expect(simplifyLineM(line('a', 0.3).path, 3)).toHaveLength(2);
    expect(simplifyLineM(line('b', 0.3, 2, 10).path, 3).length).toBeGreaterThan(100);
  });
  it('keeps only stretches near the centre', () => {
    const parts = clipLineToRadius(line('a', 0.3, 6).path, [S.lng, S.lat], 1000);
    expect(parts).toHaveLength(1);
    expect(parts[0].length).toBeLessThan(250);
  });
});

describe('buildOurRoutesArea', () => {
  it('one MultiPolygon of closed rectangles around the routes in the radius', () => {
    const r = buildOurRoutesArea([line('a', 0.3), line('far', 30)], S, 1.5)!;
    expect(r.feature.id).toBe(OUR_ROUTES_AREA_ID);
    expect(r.feature.geometry.type).toBe('MultiPolygon');
    const polys = r.feature.geometry.coordinates as number[][][][];
    expect(polys.length).toBe(r.rectangles);
    for (const [ring] of polys) {
      expect(ring).toHaveLength(5);
      expect(ring[0]).toEqual(ring[4]);
    }
  });

  it('stays under the byte budget by simplifying harder, then dropping the farthest stretches', () => {
    const many = Array.from({ length: 30 }, (_, i) => line(`w${i}`, -1.2 + i * 0.08, 3, 12));
    const r = buildOurRoutesArea(many, S, 1.5, { maxBytes: 20_000 })!;
    expect(r.bytes).toBeLessThanOrEqual(20_000);
    expect(JSON.stringify(r.feature).length).toBe(r.bytes);
    expect(r.toleranceM).toBeGreaterThan(3);
  });

  it('null when nothing is near', () => {
    expect(buildOurRoutesArea([line('far', 30)], S, 1.5)).toBeNull();
  });
});

describe('custom model with our routes', () => {
  const area = buildOurRoutesArea([line('a', 0.3)], S, 1.5)!.feature;
  const park: GeoJsonPolygonFeature = { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[34.77, 32.07], [34.78, 32.07], [34.78, 32.08], [34.77, 32.07]]] } };

  it('without our routes the model is unchanged', () => {
    expect(buildCustomModel('foot', DEFAULT_TAGS)).toEqual(buildCustomModel('foot', { ...DEFAULT_TAGS, preferOurRoutes: undefined }));
    expect(JSON.stringify(buildCustomModel('foot', { ...DEFAULT_TAGS, preferParks: [park] }))).toContain(PARKS_AREA_ID);
    expect(JSON.stringify(buildCustomModel('foot', DEFAULT_TAGS))).not.toContain(OUR_ROUTES_AREA_ID);
  });

  it('adds an off-our-routes priority (<= 1) and the area, beside parks', () => {
    const cm = buildCustomModel('foot', { ...DEFAULT_TAGS, preferParks: [park], preferOurRoutes: area })!;
    const st = cm.priority.find(s => s.if === `!in_${OUR_ROUTES_AREA_ID}`)!;
    expect(Number(st.multiply_by)).toBeLessThan(1);
    expect(cm.areas!.features.map(f => f.id)).toEqual([PARKS_AREA_ID, OUR_ROUTES_AREA_ID]);
    // out_run already has the quiet rules server-side; our routes still apply.
    expect(buildCustomModel('out_run', { preferOurRoutes: area })!.areas!.features.map(f => f.id)).toEqual([OUR_ROUTES_AREA_ID]);
  });
});

describe('wire format', () => {
  it('round-trips through the request parser', () => {
    const wire = toWireOurRoutes([line('a', 0.3), line('far', 30)], S, 1.5);
    expect(wire.map(w => w.id)).toEqual(['a']);
    const parsed = parseGenerateRequest({ mode: 'loop', start: S, targetKm: 5, activity: 'running', ourRoutes: wire });
    expect('error' in parsed).toBe(false);
    expect((parsed as { ourRoutes?: unknown[] }).ourRoutes).toHaveLength(1);
  });

  it('malformed / oversized ourRoutes is dropped, the request itself stays valid', () => {
    for (const bad of [[{ id: 'x', path: [[0, 0], [1, 1]] }], 'nope', Array.from({ length: WIRE_MAX_ROUTES + 1 }, (_, i) => ({ id: `r${i}`, path: [[34.77, 32.07], [34.78, 32.07]] }))]) {
      const p = parseGenerateRequest({ mode: 'loop', start: S, targetKm: 5, activity: 'running', ourRoutes: bad });
      expect('error' in p).toBe(false);
      expect('ourRoutes' in p).toBe(false);
    }
    expect(parseWireOurRoutes(undefined)).toBeUndefined();
  });

  it('a request without ourRoutes parses exactly as before', () => {
    expect(parseGenerateRequest({ mode: 'loop', start: S, targetKm: 5, activity: 'running' }))
      .toEqual({ mode: 'loop', start: S, targetKm: 5, activity: 'running', seed: 0, maxResults: 3 });
  });
});
