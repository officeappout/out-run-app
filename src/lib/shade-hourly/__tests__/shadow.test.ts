import { describe, expect, it } from 'vitest';
import {
  buildSunTable,
  cellIndex,
  createCityFileWriter,
  createObstacleIndexBuilder,
  decodeCityFile,
  dequantizeCell,
  quantizeCell,
  quantizeProfile,
  radiationWeightedMean,
  resolveBuildingHeight,
  segmentShadeProfile,
  shadeAtPoint,
  sunRay,
  sunRays,
  SUN_DOWN,
  Q_SUN_DOWN,
  TREE_CANOPY_OPACITY,
  type ObstacleIndex,
} from '..';
import { toXY } from '../../shade/geometry';
import type { LonLat } from '../../shade/types';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];
const rect = (x0: number, y0: number, x1: number, y1: number): LonLat[] => [at(x0, y0), at(x1, y0), at(x1, y1), at(x0, y1), at(x0, y0)];
const xy = (idx: ObstacleIndex, x: number, y: number) => toXY(idx.frame, at(x, y));
const shadeXY = (idx: ObstacleIndex, x: number, y: number, az: number, el: number) => {
  const [px, py] = xy(idx, x, y);
  return shadeAtPoint(idx, px, py, sunRay(az, el));
};

describe('shadeAtPoint', () => {
  // 10×10 m building, 10 m tall, at x 0..10, y 0..10.
  const b = createObstacleIndexBuilder([LON0, LAT0]);
  b.add(rect(0, 0, 10, 10), 10, 1, 'building');
  const idx = b.finish();

  it('sun from the south at 45°: shadow reaches 10 m north of the north wall', () => {
    expect(shadeXY(idx, 5, 15, 180, 45)).toBe(1);
    expect(shadeXY(idx, 5, 19, 180, 45)).toBe(1);
    expect(shadeXY(idx, 5, 21, 180, 45)).toBe(0);
    expect(shadeXY(idx, 5, -3, 180, 45)).toBe(0); // sunny side
    expect(shadeXY(idx, 5, 5, 180, 45)).toBe(1); // inside the footprint
  });
  it('lower sun → longer shadow', () => {
    expect(shadeXY(idx, 5, 25, 180, 30)).toBe(1); // 10 / tan 30° = 17.3 m
    expect(shadeXY(idx, 5, 28, 180, 30)).toBe(0);
  });
  it('sun from the west casts east', () => {
    expect(shadeXY(idx, 15, 5, 270, 45)).toBe(1);
    expect(shadeXY(idx, -5, 5, 270, 45)).toBe(0);
  });
  it('sun down → fully shaded; empty index → sunny', () => {
    expect(shadeXY(idx, 100, 100, 180, -5)).toBe(1);
    const empty = createObstacleIndexBuilder([LON0, LAT0]).finish();
    expect(shadeAtPoint(empty, 0, 0, sunRay(180, 45))).toBe(0);
  });
  it('long shadows across several grid cells', () => {
    const t = createObstacleIndexBuilder([LON0, LAT0], 50);
    t.add(rect(0, 0, 20, 20), 100, 1, 'building'); // 100 m shadow at 45°
    const ti = t.finish();
    expect(shadeXY(ti, 10, 110, 180, 45)).toBe(1);
    expect(shadeXY(ti, 10, 125, 180, 45)).toBe(0);
    // diagonal sun (SW → shadow to the NE)
    expect(shadeXY(ti, 60, 60, 225, 45)).toBe(1);
  });
  it('tree crowns block with their opacity; buildings win over trees', () => {
    const t = createObstacleIndexBuilder([LON0, LAT0]);
    t.add(rect(0, 0, 6, 6), 7, TREE_CANOPY_OPACITY, 'tree');
    const ti = t.finish();
    expect(shadeXY(ti, 3, 3, 180, 70)).toBeCloseTo(TREE_CANOPY_OPACITY, 5);
    t.add(rect(0, -20, 6, -14), 10, 1, 'building');
    const both = t.finish();
    expect(shadeXY(both, 3, -10, 180, 60)).toBe(1);
  });
  it('rejects degenerate rings and non-positive heights', () => {
    const t = createObstacleIndexBuilder([LON0, LAT0]);
    expect(t.add([at(0, 0), at(1, 0), at(0, 0)], 10, 1, 'building')).toBe(false);
    expect(t.add(rect(0, 0, 5, 5), 0, 1, 'building')).toBe(false);
    expect(t.size).toBe(0);
  });
});

describe('segmentShadeProfile', () => {
  // Tall 200 m wall (20 m high, 10 m deep) along the south side of an E-W street 15 m north of it.
  const b = createObstacleIndexBuilder([LON0, LAT0]);
  b.add(rect(-100, -10, 100, 0), 20, 1, 'building');
  const idx = b.finish();
  const table = buildSunTable(LAT0, LON0, 2026);
  const rays = sunRays(table);
  const street: LonLat[] = [at(-50, 15), at(50, 15)];
  const p = segmentShadeProfile(idx, street, rays);

  it('winter midday (low sun from the south) → shaded; summer midday (high sun) → sunny', () => {
    expect(p[cellIndex(11, 12)]).toBeGreaterThan(0.9);
    expect(p[cellIndex(5, 12)]).toBeLessThan(0.1);
  });
  it('sun-down cells are marked SUN_DOWN and quantize to 255', () => {
    expect(p[cellIndex(0, 19)]).toBe(SUN_DOWN);
    expect(quantizeProfile(p)[cellIndex(0, 19)]).toBe(Q_SUN_DOWN);
  });
  it('a street with nothing around is sunny whenever the sun is up', () => {
    const far = segmentShadeProfile(idx, [at(-50, 500), at(50, 500)], rays);
    expect(far[cellIndex(6, 12)]).toBe(0);
  });
  it('both-sidewalk offsets sample twice as many points', () => {
    const two = segmentShadeProfile(idx, street, rays, { offsetsM: [-6, 6] });
    expect(two[cellIndex(11, 12)]).toBeGreaterThan(0.9);
  });
});

describe('quantize + summaries', () => {
  it('round-trips within 0.005', () => {
    for (const v of [0, 0.123, 0.5, 0.999, 1]) expect(dequantizeCell(quantizeCell(v))!).toBeCloseTo(v, 2);
    expect(dequantizeCell(quantizeCell(SUN_DOWN))).toBeNull();
  });
  it('radiation-weighted mean is weighted toward high-sun hours', () => {
    const table = buildSunTable(LAT0, LON0, 2026);
    const cells = new Uint8Array(168);
    for (let h = 6; h <= 19; h++) cells[cellIndex(7, h)] = quantizeCell(h === 12 ? 1 : 0);
    const m = radiationWeightedMean(cells, table, [7])!;
    expect(m).toBeGreaterThan(1 / 14); // noon weighs more than an equal share
    expect(m).toBeLessThan(0.2);
  });
});

describe('city file', () => {
  it('round-trips header, ids, geometry (1e-6°) and cells', () => {
    const w = createCityFileWriter(2026, [LON0, LAT0]);
    const cells = new Uint8Array(168).map((_, i) => i % 201);
    w.push({ id: 123456789012 * 1000 + 3, line: [at(0, 0), at(30, 40)], cells });
    w.push({ id: 7, line: [at(5, 5), at(6, 6), at(7, 9)], cells: new Uint8Array(168).fill(255) });
    const bytes = w.finish();
    const { header, segments } = decodeCityFile(bytes);
    expect(header).toMatchObject({ version: 1, count: 2, year: 2026 });
    expect(header.origin[0]).toBeCloseTo(LON0, 4);
    expect(segments[0].id).toBe(123456789012 * 1000 + 3);
    expect(segments[0].line[1][0]).toBeCloseTo(at(30, 40)[0], 6);
    expect(Array.from(segments[0].cells)).toEqual(Array.from(cells));
    expect(segments[1].line).toHaveLength(3);
  });
  it('rejects a foreign file', () => {
    expect(() => decodeCityFile(new Uint8Array(30))).toThrow(/not an hourly shade file/);
  });
});

describe('resolveBuildingHeight', () => {
  it('prefers measured height, then levels, then type default, then the global default', () => {
    expect(resolveBuildingHeight({ heightM: '24 m', levels: 3 })).toEqual({ heightM: 24, source: 'height' });
    expect(resolveBuildingHeight({ levels: '5' })).toEqual({ heightM: 16, source: 'levels' });
    expect(resolveBuildingHeight({ buildingType: 'house' })).toEqual({ heightM: 6.5, source: 'type_default' });
    expect(resolveBuildingHeight({ buildingType: 'yes' }).source).toBe('default');
    expect(resolveBuildingHeight({ heightM: 'tall' }).source).toBe('default');
  });
});
