import { describe, expect, it } from 'vitest';
import { emptyLayer } from '../doc';
import { buildCityOverviewRows, countApprovedByAuthority, parseCityOverviewRow, sortCityOverviewRows, type CityOverviewRow } from '../overview';
import type { CityInventory } from '../types';
import { NOW, allMeasured, measuredLayer } from './fixtures';

function inv(id: string, city: string, score: number, over: Partial<CityInventory> = {}): CityInventory {
  const layers = allMeasured();
  return {
    authorityId: id, city, authorityType: 'city', areaKm2: 10,
    snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 't', runId: 'r' },
    layers, readiness: { score, level: score >= 75 ? 'green' : score >= 50 ? 'yellow' : 'red', missing: [], blockers: [] },
    schemaVersion: 2, updatedAt: null, ...over,
  };
}

describe('city overview rows', () => {
  it('counts approved routes by authorityId, and legacy docs by city name', () => {
    const m = countApprovedByAuthority([{ authorityId: 'a' }, { authorityId: 'a' }, { city: 'תל אביב - יפו' }, { city: 'nowhere' }], new Map([['תל אביב יפו', 't']]));
    expect(Object.fromEntries(m)).toEqual({ a: 2, t: 1 });
  });
  it('quota from type/population; shade/lighting not measured stay null', () => {
    const a = inv('a', 'באר שבע', 60);
    a.layers.shade = measuredLayer({ coveragePct: 40, method: 'technion_si_daily', sources: [{ key: 'technion_shade', license: 'x', attribution: 'x', snapshotDate: '2026-01-01', count: 1 }] });
    a.layers.lighting = measuredLayer({ coveragePct: 55 });
    const b = inv('b', 'ערד', 30);
    b.layers.shade = emptyLayer();
    b.layers.lighting = emptyLayer();
    const rows = buildCityOverviewRows([a, b], new Map([['a', { type: 'city', population: 215_000 }], ['b', { type: 'city', population: 29_000 }]]), new Map([['a', 26]]));
    expect(rows[0]).toMatchObject({ approvedRoutes: 26, quota: { min: 25, max: 40 }, shadeSource: 'technion_shade', shadeCoveragePct: 40, lightingCoveragePct: 55, lastRefreshAt: NOW.toISOString() });
    expect(rows[1]).toMatchObject({ approvedRoutes: 0, quota: { min: 8, max: 15 }, shadeSource: null, shadeCoveragePct: null, lightingCoveragePct: null });
  });
  it('sorts both ways with nulls last; routes sort by share of the quota', () => {
    const r = (id: string, score: number, light: number | null, approved: number, min: number): CityOverviewRow => ({ authorityId: id, city: id, authorityType: 'city', level: 'red', score, approvedRoutes: approved, quota: { min, max: min * 2 }, shadeSource: null, shadeCoveragePct: null, lightingCoveragePct: light, lastRefreshAt: null });
    const rows = [r('x', 50, null, 10, 25), r('y', 20, 80, 8, 8), r('z', 90, 10, 0, 8)];
    expect(sortCityOverviewRows(rows, 'score', 'asc').map((x) => x.authorityId)).toEqual(['y', 'x', 'z']);
    expect(sortCityOverviewRows(rows, 'lightingCoveragePct', 'desc').map((x) => x.authorityId)).toEqual(['y', 'z', 'x']);
    expect(sortCityOverviewRows(rows, 'lightingCoveragePct', 'asc').map((x) => x.authorityId)).toEqual(['z', 'y', 'x']);
    expect(sortCityOverviewRows(rows, 'approvedRoutes', 'desc').map((x) => x.authorityId)).toEqual(['y', 'x', 'z']);
  });
  it('parses the wire shape defensively', () => {
    expect(parseCityOverviewRow({})).toBeNull();
    expect(parseCityOverviewRow({ authorityId: 'a', level: 'purple', shadeCoveragePct: 'x' })).toMatchObject({ level: 'red', shadeCoveragePct: null, approvedRoutes: 0 });
  });
});
