import { describe, expect, it } from 'vitest';
import { haversineM, lineLengthM } from '../../shade/geometry';
import type { LonLat } from '../../shade/types';
import { crownRadiusFromTags, crownRing, pointsAlong, DEFAULT_CROWN_RADIUS_M } from '../crowns';
import { hourlyShadeCity, hourlyShadeObjectPath } from '../cities';
import { isWalkableHighway, pieceId, splitLine } from '../segments';
import { SHADE_SOURCES, shadeSource } from '../sources';
import { pearson, quantile, ranks, spearman } from '../stats';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];

describe('splitLine', () => {
  it('splits a 250 m line into 3 equal pieces of ≤100 m that join end to start', () => {
    const parts = splitLine([at(0, 0), at(250, 0)], 100);
    expect(parts).toHaveLength(3);
    for (const p of parts) expect(lineLengthM(p)).toBeCloseTo(250 / 3, 0);
    expect(parts[0][parts[0].length - 1]).toEqual(parts[1][0]);
  });
  it('keeps intermediate vertices and total length', () => {
    const line = [at(0, 0), at(60, 0), at(60, 80), at(0, 80)];
    const parts = splitLine(line, 100);
    expect(parts).toHaveLength(2);
    expect(parts.reduce((s, p) => s + lineLengthM(p), 0)).toBeCloseTo(lineLengthM(line), 3);
  });
  it('short line → one piece; degenerate → none', () => {
    expect(splitLine([at(0, 0), at(30, 0)], 100)).toHaveLength(1);
    expect(splitLine([at(0, 0)], 100)).toHaveLength(0);
    expect(splitLine([at(0, 0), at(0, 0)], 100)).toHaveLength(0);
  });
  it('piece ids are unique per way and exact in float64', () => {
    expect(pieceId(12_345_678_901, 7)).toBe(12_345_678_901_007);
  });
});

describe('isWalkableHighway', () => {
  it('keeps streets and paths, drops motorways / private / areas', () => {
    expect(isWalkableHighway({ highway: 'residential' })).toBe(true);
    expect(isWalkableHighway({ highway: 'footway' })).toBe(true);
    expect(isWalkableHighway({ highway: 'motorway' })).toBe(false);
    expect(isWalkableHighway({ highway: 'service', access: 'private' })).toBe(false);
    expect(isWalkableHighway({ highway: 'pedestrian', area: 'yes' })).toBe(false);
  });
});

describe('crowns', () => {
  it('crown ring has the requested radius', () => {
    const r = crownRing(at(0, 0), 4);
    expect(r).toHaveLength(8);
    expect(haversineM(at(0, 0), r[0])).toBeCloseTo(4, 1);
  });
  it('diameter_crown tag → radius, else default', () => {
    expect(crownRadiusFromTags({ diameter_crown: '10' })).toBe(5);
    expect(crownRadiusFromTags({})).toBe(DEFAULT_CROWN_RADIUS_M);
  });
  it('points along a tree row every 8 m', () => {
    expect(pointsAlong([at(0, 0), at(40, 0)], 8)).toHaveLength(5);
  });
});

describe('stats', () => {
  it('pearson / spearman', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
    expect(spearman([1, 2, 3, 4], [1, 4, 9, 16])).toBeCloseTo(1, 6);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
    expect(ranks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
    expect(quantile([0, 1, 2, 3, 4], 0.5)).toBe(2);
  });
});

describe('sources + cities', () => {
  it('municipal layers are pending_licence; OSM / SOI canopy are live', () => {
    expect(shadeSource('tlv_buildings_iview2')?.status).toBe('pending_licence');
    expect(shadeSource('tlv_canopy_2024')?.status).toBe('pending_licence');
    expect(shadeSource('beer_sheva_buildings')?.status).toBe('pending_licence');
    expect(shadeSource('osm')?.status).toBe('live');
    expect(shadeSource('soi_canopy_otb')?.status).toBe('live');
    expect(new Set(SHADE_SOURCES.map((s) => s.id)).size).toBe(SHADE_SOURCES.length);
  });
  it('city presets and object path', () => {
    expect(hourlyShadeCity('tel-aviv')?.technionCity).toBe('tel-aviv');
    expect(hourlyShadeObjectPath('tel-aviv')).toBe('shade/hourly/v1/tel-aviv.bin.gz');
  });
});
