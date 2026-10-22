import { describe, expect, it } from 'vitest';
import { computeReadiness } from '@/lib/city-inventory/readiness';
import type { CityInventory } from '@/lib/city-inventory/types';
import { NOW, allMeasured } from '@/lib/city-inventory/__tests__/fixtures';
import {
  buildCityToAuthority, buildHubRows, countByAuthority, hubGaps, isHubAuthority, isPendingPark, isPendingRoute, parseHubRow,
  type HubAuthority,
} from '../rows';

function inv(id: string, city: string, approved = 30): CityInventory {
  const layers = allMeasured();
  const readiness = computeReadiness({ hasBoundary: true, osmSnapshotDate: '2026-10-01', approvedRoutes: approved, authorityType: 'city', population: 215_000, layers });
  return { authorityId: id, city, authorityType: 'city', areaKm2: 100, snapshot: { osmPbfDate: '2026-10-01', builtAt: NOW, builtBy: 't', runId: 'r' }, layers, readiness, schemaVersion: 2, updatedAt: NOW };
}

const auth = (id: string, over: Partial<HubAuthority> = {}): HubAuthority => ({ id, name: id, type: 'city', population: 50_000, ...over });

describe('isHubAuthority', () => {
  it('keeps top-level municipal authorities; parentAuthorityId absent and null are both top-level (axioms §33)', () => {
    expect(isHubAuthority(auth('a'))).toBe(true);
    expect(isHubAuthority(auth('a', { parentAuthorityId: null }))).toBe(true);
    expect(isHubAuthority(auth('a', { parentAuthorityId: '' }))).toBe(true);
    expect(isHubAuthority(auth('a', { parentAuthorityId: 'rc1' }))).toBe(false);
  });
  it('drops units, schools, neighborhoods and non-municipal tenants stored as type=city', () => {
    expect(isHubAuthority(auth('a', { type: 'military_unit' }))).toBe(false);
    expect(isHubAuthority(auth('a', { type: 'neighborhood' }))).toBe(false);
    expect(isHubAuthority(auth('a', { type: 'city', tenantType: 'company' }))).toBe(false);
    expect(isHubAuthority(auth('a', { type: 'regional_council', tenantType: 'municipal' }))).toBe(true);
  });
});

describe('buildHubRows', () => {
  const authorities = [auth('bsv', { name: 'באר שבע', population: 215_000, isActiveClient: true, coordinates: { lat: 31.25, lng: 34.79 } }), auth('arad', { name: 'ערד' }), auth('unit', { type: 'military_unit' })];
  const cityToAuthority = buildCityToAuthority(authorities, []);
  const rows = buildHubRows({
    authorities,
    inventories: [inv('bsv', 'באר שבע')],
    approved: countByAuthority([{ authorityId: 'bsv' }, { city: 'באר-שבע' }], cityToAuthority),
    pendingRoutes: countByAuthority([{ city: 'ערד' }, { authorityId: 'arad' }], cityToAuthority),
    pendingParks: new Map([['arad', 1]]),
    pendingContributions: new Map([['bsv', 2]]),
  });
  const byId = Object.fromEntries(rows.map((r) => [r.authorityId, r]));

  it('one row per municipal authority — measured or not', () => {
    expect(rows.map((r) => r.authorityId).sort()).toEqual(['arad', 'bsv']);
  });
  it('an authority with no inventory is "not measured", never zeros', () => {
    expect(byId.arad).toMatchObject({ measured: false, level: null, score: null, shadeCoveragePct: null, benchesDensity: null, gaps: ['not_measured'] });
  });
  it('legacy docs with only a city name count for the authority (approved and pending)', () => {
    expect(byId.bsv.approvedRoutes).toBe(2);
    expect(byId.arad.pendingRoutes).toBe(2);
    expect(byId.arad.pendingParks).toBe(1);
    expect(byId.bsv.pendingContributions).toBe(2);
  });
  it('carries quota, paying flag (read only) and a validated center', () => {
    expect(byId.bsv).toMatchObject({ measured: true, isActiveClient: true, quota: { min: 25, max: 40 }, center: { lat: 31.25, lng: 34.79 } });
    expect(byId.arad.center).toBeNull();
    expect(byId.bsv.gaps).toContain('quota'); // 2 approved < 25
  });
  it('an inventory doc keeps its row even if its authority doc is missing', () => {
    const r = buildHubRows({ authorities: [], inventories: [inv('x', 'אילת')], approved: new Map(), pendingRoutes: new Map(), pendingParks: new Map(), pendingContributions: new Map() });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ authorityId: 'x', name: 'אילת', measured: true });
  });
});

describe('status rules (same as the approval center)', () => {
  it('pending route = unpublished, not archived / rejected', () => {
    expect(isPendingRoute({ published: false, status: 'pending' })).toBe(true);
    expect(isPendingRoute({ published: false })).toBe(true);
    expect(isPendingRoute({ published: false, status: 'archived' })).toBe(false);
    expect(isPendingRoute({ published: true })).toBe(false);
  });
  it('pending park = unpublished, not draft / rejected', () => {
    expect(isPendingPark({ published: false, contentStatus: 'pending_review' })).toBe(true);
    expect(isPendingPark({ published: false, contentStatus: 'draft' })).toBe(false);
  });
});

describe('hubGaps', () => {
  it('weight order, live quota', () => {
    const i = inv('a', 'a');
    i.layers.lighting = { ...i.layers.lighting, coveragePct: null };
    expect(hubGaps(i, 3, 8)).toEqual(['quota', 'lighting']);
    expect(hubGaps(null, 0, 8)).toEqual(['not_measured']);
  });
});

describe('parseHubRow', () => {
  it('re-guards the wire shape; unmeasured rows never carry a level', () => {
    expect(parseHubRow({ authorityId: 'a', measured: false, level: 'red', score: 0, gaps: ['nope', 'quota'] })).toMatchObject({ level: null, score: null, gaps: ['quota'] });
    expect(parseHubRow({})).toBeNull();
  });
});
