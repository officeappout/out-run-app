import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import { buildShadeIndex, createShadeLoader, measureRouteShade, shadeObjectPath, technionCityForName, type LonLat, type ShadeSegmentFeature } from '..';
import { bucketShadeFetcher } from '../bucket-fetcher.node';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];
const seg = (a: LonLat, b: LonLat, shadeIndex: number): ShadeSegmentFeature => ({
  type: 'Feature',
  geometry: { type: 'LineString', coordinates: [a, b] },
  properties: { shadeIndex, indexType: 'SI_daily', city: 'tel-aviv', sourceLayer: 'fixture', sourceFeatureId: 1, fetchedAt: '2026-10-21' },
});
// 0..100 m SI 0.4 (shaded), 100..200 m SI 0.1 (not shaded).
const fc = { type: 'FeatureCollection' as const, features: [seg(at(0, 0), at(100, 0), 0.4), seg(at(100, 0), at(200, 0), 0.1)] };

describe('measureRouteShade', () => {
  const idx = buildShadeIndex(fc);
  it('measures shadeShare and shadedPct over the measured length', () => {
    const r = measureRouteShade([at(0, 0), at(200, 0)], idx);
    expect(r.status).toBe('measured');
    expect(r.shadeShare).toBeCloseTo(0.25, 2);
    expect(Math.abs(r.shadedPct! - 50)).toBeLessThan(3); // junction step may go either way
    expect(r.coverage).toBeCloseTo(1, 2);
    expect(r).toMatchObject({ source: 'technion_v1', indexType: 'SI_daily' });
  });
  it('is "not measured" below 50% coverage — no shade values, no penalty', () => {
    const r = measureRouteShade([at(150, 0), at(200, 0), at(200, 200)], idx); // 50 m on the layer, 200 m off it
    expect(r.status).toBe('low_coverage');
    expect(r.shadeShare).toBeNull();
    expect(r.shadedPct).toBeNull();
    expect(r.coverage).toBeLessThan(0.5);
  });
  it('no index / no match → no_data', () => {
    expect(measureRouteShade([at(0, 0), at(10, 0)], null).status).toBe('no_data');
    expect(measureRouteShade([at(0, 500), at(100, 500)], idx).status).toBe('no_data');
  });
});

describe('shade loader', () => {
  it('maps authority names to Technion city slugs', () => {
    expect(technionCityForName('תל אביב-יפו')).toBe('tel-aviv');
    expect(technionCityForName('תל אביב יפו')).toBe('tel-aviv');
    expect(technionCityForName('פתח תקוה')).toBe('petah-tikva');
    expect(technionCityForName('עיריית חיפה')).toBe('haifa');
    expect(technionCityForName('זכרון יעקב')).toBeNull();
    expect(technionCityForName(null)).toBeNull();
  });

  it('fetches a gzipped object once per city and caches the index', async () => {
    let downloads = 0;
    const objects = new Map([[shadeObjectPath('tel-aviv'), gzipSync(Buffer.from(JSON.stringify(fc)))]]);
    const bucket = {
      file: (p: string) => ({
        exists: async () => [objects.has(p)] as [boolean],
        download: async () => { downloads++; return [objects.get(p)!] as [Buffer]; },
      }),
    };
    const loader = createShadeLoader(bucketShadeFetcher(bucket));
    const a = await loader.indexForName('תל אביב-יפו');
    const b = await loader.indexFor('tel-aviv');
    expect(a?.city).toBe('tel-aviv');
    expect(a?.index.size).toBe(2);
    expect(b).toBe(a?.index);
    expect(downloads).toBe(1);
    expect(await loader.indexFor('haifa')).toBeNull(); // object missing → null, not a throw
    expect(await loader.indexForName('זכרון יעקב')).toBeNull();
  });

  it('accepts an already-decompressed body', async () => {
    const bucket = { file: () => ({ exists: async () => [true] as [boolean], download: async () => [Buffer.from(JSON.stringify(fc))] as [Buffer] }) };
    expect((await createShadeLoader(bucketShadeFetcher(bucket)).indexFor('tel-aviv'))?.size).toBe(2);
  });
});
