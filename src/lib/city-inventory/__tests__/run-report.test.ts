import { describe, expect, it } from 'vitest';
import { buildBoundaryIndex } from '../boundary';
import { buildCityInventoryDoc, readCityInventoryDoc } from '../doc';
import { formatCityReport, formatLayerTable, layerGaps } from '../report';
import { buildCityInventory, licensePendingKeys, type BuildInventoryInput } from '../run';
import { emptyLayer } from '../doc';
import { INVENTORY_LAYER_KEYS } from '../types';
import { CITY, area, at, square } from './geo-fixtures';

const input = (over: Partial<BuildInventoryInput> = {}): BuildInventoryInput => ({
  authority: { id: 'auth1', name: 'עיר בדיקה', type: 'city', population: 50_000 },
  boundary: buildBoundaryIndex(CITY)!,
  features: {
    nodes: [{ id: 1, lon: at(100, 100)[0], lat: at(100, 100)[1], tags: { amenity: 'bench' } }],
    ways: [{ id: 2, tags: { highway: 'residential' }, coords: [at(0, 50), at(1000, 50)] }],
    areas: [area('way/3', { leisure: 'park' }, square(200, 200, 100))],
  },
  osmSnapshotDate: '2026-10-20',
  approvedRoutes: 9,
  shade: null,
  peers: [],
  licensePendingKeys: new Set(),
  now: new Date('2026-10-21T08:00:00Z'),
  runId: 'ci-20261021T080000Z',
  builtBy: 'test',
  ...over,
});

describe('buildCityInventory', () => {
  it('builds a complete inventory with readiness, round-trippable through the I0 doc', () => {
    const { inventory, extras } = buildCityInventory(input());
    expect(Object.keys(inventory.layers).sort()).toEqual([...INVENTORY_LAYER_KEYS].sort());
    expect(inventory.layers.benches.count).toBe(1);
    expect(inventory.areaKm2).toBeCloseTo(1, 1);
    expect(extras.streetKm).toBe(1);
    expect(extras.peerMedians.benches).toBeNull();
    // every OSM layer measured, quota met for a small city, but no shade ⇒ yellow
    expect(inventory.readiness.level).toBe('yellow');
    expect(inventory.readiness.missing).toContain('shade');
    const doc = buildCityInventoryDoc(inventory, null);
    expect(readCityInventoryDoc('auth1', doc)?.layers.benches.count).toBe(1);
  });

  it('refuses an empty extract instead of reporting zeros (the 0 that is not 0)', () => {
    expect(() => buildCityInventory(input({ features: { nodes: [], ways: [], areas: [] } }))).toThrow(/no walkable ways/);
  });

  it('licensePendingKeys follows the Technion permission string', () => {
    expect(licensePendingKeys('verbal — written confirmation pending').has('technion_shade')).toBe(true);
    expect(licensePendingKeys('written, 01.11.2026').size).toBe(0);
  });
});

describe('report', () => {
  it('layerGaps: unmeasured, zero, quality flags (single_source omitted)', () => {
    expect(layerGaps('shade', emptyLayer())[0]).toMatch(/not measured/);
    const l = { ...emptyLayer(), count: 0, method: 'osm_count' as const, quality: ['single_source' as const, 'stale_source' as const] };
    expect(layerGaps('courts', l)).toEqual(['none in OSM', 'stale source']);
  });

  it('table has one row per layer and the readiness block', () => {
    const { inventory, extras } = buildCityInventory(input());
    expect(formatLayerTable(inventory, extras).split('\n')).toHaveLength(2 + INVENTORY_LAYER_KEYS.length);
    const md = formatCityReport(inventory, extras, 9);
    expect(md).toContain('Readiness: YELLOW');
    expect(md).toContain('osm (ODbL-1.0, 2026-10-20)');
  });
});
