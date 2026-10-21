import { describe, expect, it } from 'vitest';
import {
  buildCityInventoryDoc,
  buildCityInventoryRunDoc,
  cityInventoryDocPath,
  cityInventoryRunDocPath,
  completeLayers,
  emptyLayer,
  readCityInventoryDoc,
  readCityInventoryRunDoc,
  type CityInventoryInput,
} from '../doc';
import { CITY_INVENTORY_SCHEMA_VERSION, INVENTORY_LAYER_KEYS } from '../types';
import { NOW, allMeasured, measuredLayer } from './fixtures';

const SENTINEL = { __sentinel: 'serverTimestamp' };
const has = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

function input(over: Partial<CityInventoryInput> = {}): CityInventoryInput {
  return {
    authorityId: 'auth_bsv',
    city: 'באר שבע',
    authorityType: 'city',
    areaKm2: 117.5,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 'agent', runId: 'run_20261021' },
    layers: allMeasured(),
    readiness: { score: 62, level: 'yellow', missing: ['shade'], blockers: ['shade not measured'] },
    ...over,
  };
}

describe('paths', () => {
  it('summary + run', () => {
    expect(cityInventoryDocPath('a1')).toBe('city_inventory/a1');
    expect(cityInventoryRunDocPath('a1', 'r1')).toBe('city_inventory/a1/runs/r1');
  });
});

describe('buildCityInventoryDoc', () => {
  it('writes identity, schema version and the server-timestamp sentinel', () => {
    const d = buildCityInventoryDoc(input(), SENTINEL);
    expect(d.authorityId).toBe('auth_bsv');
    expect(d.schemaVersion).toBe(CITY_INVENTORY_SCHEMA_VERSION);
    expect(d.updatedAt).toBe(SENTINEL);
  });

  it('writes every layer, with explicit nulls (no absent keys, no undefined)', () => {
    const d = buildCityInventoryDoc(input({ layers: { benches: measuredLayer() } as never, areaKm2: null }), SENTINEL);
    const layers = d.layers as Record<string, Record<string, unknown>>;
    expect(Object.keys(layers)).toEqual([...INVENTORY_LAYER_KEYS]);
    const toilets = layers.toilets;
    for (const k of ['count', 'lengthKm', 'areaKm2', 'density', 'coveragePct', 'method', 'lastRefreshAt']) {
      expect(has(toilets, k)).toBe(true);
      expect(toilets[k]).toBeNull();
    }
    expect(has(d, 'areaKm2') && d.areaKm2 === null).toBe(true);
    expect(JSON.stringify(d, (_k, v) => (v === undefined ? '__UNDEFINED__' : v))).not.toContain('__UNDEFINED__');
  });

  it('turns NaN metrics into null', () => {
    const d = buildCityInventoryDoc(input({ layers: completeLayers({ benches: measuredLayer({ density: NaN }) }) }), SENTINEL);
    expect((d.layers as any).benches.density).toBeNull();
  });

  it('summary keeps files; run drops them', () => {
    const layers = allMeasured();
    layers.big_parks = measuredLayer({ files: [{ path: 'city-inventory/a/2026-10-01/osm/big_parks.geojson.gz', bytes: 10, sha256: 'abc' }] });
    const s = buildCityInventoryDoc(input({ layers }), SENTINEL);
    const r = buildCityInventoryRunDoc(input({ layers }), SENTINEL);
    expect((s.layers as any).big_parks.files).toHaveLength(1);
    expect(has((r.layers as any).big_parks, 'files')).toBe(false);
    expect(r.createdAt).toBe(SENTINEL);
    expect(r.runId).toBe('run_20261021');
  });

  it('refuses a doc without authority, city or runId', () => {
    expect(() => buildCityInventoryDoc(input({ authorityId: '' }), SENTINEL)).toThrow(/authorityId/);
    expect(() => buildCityInventoryDoc(input({ authorityId: 'a/b' }), SENTINEL)).toThrow(/authorityId/);
    expect(() => buildCityInventoryDoc(input({ city: '  ' }), SENTINEL)).toThrow(/city/);
    expect(() => buildCityInventoryRunDoc(input({ snapshot: { ...input().snapshot, runId: '' } }), SENTINEL)).toThrow(/runId/);
  });
});

describe('readCityInventoryDoc', () => {
  it('null for missing docs', () => {
    expect(readCityInventoryDoc('a', undefined)).toBeNull();
    expect(readCityInventoryDoc('a', null)).toBeNull();
    expect(readCityInventoryDoc('', {})).toBeNull();
  });

  it('guards every field on a sparse / malformed doc', () => {
    const inv = readCityInventoryDoc('auth_x', {
      authorityType: 'galaxy',
      layers: { benches: { count: '7', quality: ['single_source', 'bogus'], method: 'magic', sources: [{ key: '' }, { key: 'osm' }] }, unknown_layer: {} },
      readiness: { level: 'purple', missing: ['shade', 'nope'] },
    })!;
    expect(inv.authorityId).toBe('auth_x');
    expect(inv.authorityType).toBe('city');
    expect(inv.layers.benches.count).toBeNull();
    expect(inv.layers.benches.method).toBeNull();
    expect(inv.layers.benches.quality).toEqual(['single_source']);
    expect(inv.layers.benches.sources.map((s) => s.key)).toEqual(['osm']);
    expect(inv.layers.toilets).toEqual(emptyLayer());
    expect(Object.keys(inv.layers)).toEqual([...INVENTORY_LAYER_KEYS]);
    expect(inv.readiness.level).toBe('red');
    expect(inv.readiness.missing).toEqual(['shade']);
    expect(inv.snapshot.builtAt.getTime()).toBe(0);
    expect(inv.updatedAt).toBeNull();
  });

  it('run reader drops files and falls back to docId', () => {
    const run = readCityInventoryRunDoc('r9', { layers: { parks: { count: 3, files: [{ path: 'x' }] } } })!;
    expect(run.runId).toBe('r9');
    expect(run.layers.parks.count).toBe(3);
    expect(has(run.layers.parks, 'files')).toBe(false);
  });
});
