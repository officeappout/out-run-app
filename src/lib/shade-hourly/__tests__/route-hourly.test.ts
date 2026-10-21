import { gzipSync } from 'zlib';
import { describe, expect, it } from 'vitest';
import {
  buildHourlyCity,
  buildSunTable,
  cellIndex,
  createCityFileWriter,
  createHourlyShadeLoader,
  hourShadeForLine,
  hourlyProfileSummary,
  quantizeCell,
  Q_SUN_DOWN,
  type HourlySegment,
} from '..';
import { bucketBytesFetcher } from '../bucket-fetcher.node';
import { createLightingLoader, makeLightingFile } from '../../lighting';
import type { LonLat } from '../../shade/types';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];
const table = buildSunTable(LAT0, LON0, 2026);
const cells = (f: (cell: number) => number) => {
  const c = new Uint8Array(168);
  for (let k = 0; k < 168; k++) c[k] = table[k].elevationDeg <= 0 ? Q_SUN_DOWN : quantizeCell(f(k));
  return c;
};
// 0..100 m: shaded 0.8 at every hour; 100..200 m: 0.2.
const segs: HourlySegment[] = [
  { id: 1000, line: [at(0, 0), at(100, 0)], cells: cells(() => 0.8) },
  { id: 2000, line: [at(100, 0), at(200, 0)], cells: cells(() => 0.2) },
];
const city = buildHourlyCity('tel-aviv', segs, table);
const NOON_JULY = cellIndex(6, 13);

describe('hourShadeForLine', () => {
  it('length-weighted shade at the hour over the matched length', () => {
    const r = hourShadeForLine(city, [at(0, 0), at(200, 0)], NOON_JULY, 5);
    expect(r.status).toBe('measured');
    expect(r.shade!).toBeGreaterThan(0.45);
    expect(r.shade!).toBeLessThan(0.55);
  });
  it('mostly off the layer → low_coverage; off it → no_data; sun down → sunDown', () => {
    expect(hourShadeForLine(city, [at(150, 0), at(200, 0), at(200, 300)], NOON_JULY).status).toBe('low_coverage');
    expect(hourShadeForLine(city, [at(0, 500), at(100, 500)], NOON_JULY).status).toBe('no_data');
    expect(hourShadeForLine(city, [at(0, 0), at(100, 0)], cellIndex(0, 19))).toMatchObject({ sunDown: true, shade: null });
  });
});

describe('hourlyProfileSummary', () => {
  it('summer mean and the July curve', () => {
    const s = hourlyProfileSummary(city, [at(0, 0), at(100, 0)])!;
    expect(s.source).toBe('shade_hourly_v1');
    expect(s.summerMean!).toBeCloseTo(0.8, 2);
    expect(s.julyByHour).toHaveLength(14);
    expect(s.julyByHour[7]).toBeCloseTo(0.8, 2);
  });
  it('null when the route is mostly off the layer', () => {
    expect(hourlyProfileSummary(city, [at(0, 500), at(100, 500)])).toBeNull();
  });
});

describe('loaders (per-process cache, Storage-shaped fetchers)', () => {
  const w = createCityFileWriter(2026, [LON0, LAT0]);
  segs.forEach((s) => w.push(s));
  const gz = gzipSync(Buffer.from(w.finish()));
  const lightGz = gzipSync(Buffer.from(JSON.stringify(makeLightingFile({
    city: 'tel-aviv', builtAt: '', radiusM: 25, minShare: 0.6, sources: [], summary: { walkableM: 0, knownM: 0, litM: 0, byBasisM: {} },
    pieces: [{ id: 1, lit: 'yes', basis: 'lamps', line: [at(0, 0), at(100, 0)] }],
  }))));
  const objects: Record<string, Buffer> = { 'shade/hourly/v1/tel-aviv.bin.gz': gz, 'lighting/v1/tel-aviv.json.gz': lightGz };
  let downloads = 0;
  const bucket = {
    file: (p: string) => ({
      exists: async () => [p in objects] as [boolean],
      download: async () => { downloads++; return [objects[p]] as [Buffer]; },
    }),
  };
  it('hourly: decodes once per city, by Hebrew name; missing city → null', async () => {
    const l = createHourlyShadeLoader(bucketBytesFetcher(bucket));
    const a = await l.cityForName('תל אביב-יפו');
    const b = await l.cityFor('tel-aviv');
    expect(a).toBe(b);
    expect(a!.segments).toHaveLength(2);
    expect(downloads).toBe(1);
    expect(await l.cityForName('חיפה')).toBeNull();
    expect(hourShadeForLine(a!, [at(0, 0), at(100, 0)], NOON_JULY).shade!).toBeCloseTo(0.8, 2);
  });
  it('lighting: JSON gz via the shade fetcher', async () => {
    const { bucketShadeFetcher } = await import('../../shade/bucket-fetcher.node');
    const l = createLightingLoader(bucketShadeFetcher(bucket));
    const r = await l.indexForName('תל אביב-יפו');
    expect(r?.city).toBe('tel-aviv');
    expect(r?.index.size).toBeGreaterThan(0);
  });
});
