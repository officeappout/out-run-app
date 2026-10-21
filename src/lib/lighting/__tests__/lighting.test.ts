import { describe, expect, it } from 'vitest';
import {
  buildLampIndex,
  buildLitIndex,
  classifyLitPiece,
  hasLampWithin,
  lampDataset,
  lampShare,
  lightingObjectPath,
  makeLightingFile,
  measureRouteLighting,
  parseLightingFile,
  LAMP_DATASETS,
  LIT_LAMP_RADIUS_M,
  type LightingPiece,
} from '..';
import { measureLightingCoverage } from '../../city-inventory/lighting-coverage';
import type { LonLat } from '../../shade/types';

const LON0 = 34.78, LAT0 = 32.08;
const M_LON = 1 / (111_195 * Math.cos((LAT0 * Math.PI) / 180));
const at = (x: number, y: number): LonLat => [LON0 + x * M_LON, LAT0 + y / 111_195];

describe('lamp index', () => {
  const idx = buildLampIndex([at(0, 0), at(100, 0)]);
  it('25 m is the named default radius', () => {
    expect(LIT_LAMP_RADIUS_M).toBe(25);
  });
  it('finds a lamp within the radius, not beyond', () => {
    expect(hasLampWithin(idx, at(0, 24))).toBe(true);
    expect(hasLampWithin(idx, at(0, 26))).toBe(false);
    expect(hasLampWithin(idx, at(50, 0))).toBe(false);
    expect(hasLampWithin(idx, at(50, 0), 51)).toBe(true);
  });
  it('lampShare = share of sample points near a lamp', () => {
    // 0..100 m: lamps at both ends cover 0..25 and 75..100 → ~50%
    expect(lampShare(idx, [at(0, 0), at(100, 0)])).toBeCloseTo(0.5, 1);
    expect(lampShare(idx, [at(0, 300), at(100, 300)])).toBe(0);
    expect(lampShare(null, [at(0, 0), at(10, 0)])).toBe(0);
  });
});

describe('classifyLitPiece', () => {
  it('lit=no wins over lamps; lit=yes or lamps ⇒ lit; otherwise unknown (never unlit)', () => {
    expect(classifyLitPiece({ lit: 'no' }, 1)).toEqual({ lit: 'no', basis: 'osm_lit_no' });
    expect(classifyLitPiece({ lit: 'yes' }, 0)).toEqual({ lit: 'yes', basis: 'osm_lit_yes' });
    expect(classifyLitPiece({ lit: 'yes' }, 0.9)).toEqual({ lit: 'yes', basis: 'osm_lit_yes+lamps' });
    expect(classifyLitPiece({}, 0.6)).toEqual({ lit: 'yes', basis: 'lamps' });
    expect(classifyLitPiece({}, 0.59)).toEqual({ lit: 'unknown', basis: 'none' });
  });
});

describe('lighting file + route litShare', () => {
  const pieces: LightingPiece[] = [
    { id: 1000, lit: 'yes', basis: 'lamps', line: [at(0, 0), at(100, 0)] },
    { id: 2000, lit: 'no', basis: 'osm_lit_no', line: [at(100, 0), at(200, 0)] },
  ];
  const file = makeLightingFile({
    city: 'tel-aviv',
    builtAt: '2026-10-21T00:00:00Z',
    radiusM: 25,
    minShare: 0.6,
    sources: [],
    summary: { walkableM: 300, knownM: 200, litM: 100, byBasisM: {} },
    pieces,
  });
  it('round-trips through JSON and rejects foreign bodies', () => {
    const back = parseLightingFile(JSON.parse(JSON.stringify(file)));
    expect(back.pieces).toHaveLength(2);
    expect(() => parseLightingFile({ version: 9 })).toThrow(/lighting v1/);
    expect(lightingObjectPath('tel-aviv')).toBe('lighting/v1/tel-aviv.json.gz');
  });
  it('route over lit + unlit + unknown: litShare over known, litLengthShare over all', () => {
    const idx = buildLitIndex(file);
    const r = measureRouteLighting([at(0, 0), at(300, 0)], idx);
    expect(r.status).toBe('measured');
    expect(r.litShare).toBeCloseTo(0.5, 1);
    // 200 m known + the 15 m match buffer past the last piece's end
    expect(r.coverage).toBeGreaterThan(0.64);
    expect(r.coverage).toBeLessThan(0.75);
    expect(r.litLengthShare).toBeCloseTo(1 / 3, 1);
  });
  it('no data → status no_data, nothing rewarded', () => {
    expect(measureRouteLighting([at(0, 500), at(100, 500)], buildLitIndex(file))).toMatchObject({ status: 'no_data', litShare: null, litLengthShare: 0 });
    expect(measureRouteLighting([at(0, 0), at(10, 0)], null).status).toBe('no_data');
  });
  it('city coverage: known ÷ walkable and lit length', () => {
    const c = measureLightingCoverage([[at(0, 0), at(300, 0)]], buildLitIndex(file))!;
    expect(c.walkableM).toBeCloseTo(300, -1);
    expect(c.knownM / c.walkableM).toBeCloseTo(2 / 3, 1);
    expect(c.litM / c.walkableM).toBeCloseTo(1 / 3, 1);
  });
});

describe('lamp registry', () => {
  it("Be'er Sheva and Tel Aviv lamp layers are pending_licence, OSM is live", () => {
    expect(lampDataset('beer_sheva_street_lights')?.status).toBe('pending_licence');
    expect(lampDataset('tel_aviv_lamps')?.status).toBe('pending_licence');
    expect(lampDataset('osm_street_lamps')?.status).toBe('live');
    expect(new Set(LAMP_DATASETS.map((d) => d.key)).size).toBe(LAMP_DATASETS.length);
  });
});
