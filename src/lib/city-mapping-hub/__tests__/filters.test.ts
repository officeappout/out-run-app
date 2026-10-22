import { describe, expect, it } from 'vitest';
import { DEFAULT_HUB_FILTERS, filterHubRows, hubKpis, quotaBand, sortHubRows } from '../filters';
import { DEFAULT_HUB_URL_STATE, parseHubUrlState, serializeHubUrlState, validAuthorityId } from '../url-state';
import type { HubRow } from '../rows';

const row = (id: string, over: Partial<HubRow> = {}): HubRow => ({
  authorityId: id, name: id, authorityType: 'city', measured: true, level: 'yellow', score: 50, approvedRoutes: 5, pendingRoutes: 0, pendingParks: 0, pendingContributions: 0,
  quota: { min: 8, max: 15 }, shadeCoveragePct: null, lightingCoveragePct: null, benchesDensity: null, waterDensity: null, toiletsDensity: null,
  gaps: [], isActiveClient: false, population: null, center: null, lastRefreshAt: null, ...over,
});

const rows = [
  row('תל אביב-יפו', { level: 'green', score: 82, approvedRoutes: 30, isActiveClient: true }),
  row('ערד', { level: 'red', score: 20, gaps: ['quota', 'shade'], pendingRoutes: 3 }),
  row('שדרות', { measured: false, level: null, score: null, gaps: ['not_measured'], authorityType: 'local_council', pendingContributions: 1 }),
];

describe('filterHubRows', () => {
  const f = (p: Partial<typeof DEFAULT_HUB_FILTERS>) => filterHubRows(rows, { ...DEFAULT_HUB_FILTERS, ...p }).map((r) => r.authorityId);
  it('search is normalized (dash / spaces)', () => expect(f({ q: 'תל אביב יפו' })).toEqual(['תל אביב-יפו']));
  it('level red returns only red; unmeasured only unmeasured', () => {
    expect(f({ level: 'red' })).toEqual(['ערד']);
    expect(f({ level: 'unmeasured' })).toEqual(['שדרות']);
  });
  it('type, gap, pending, contributions, quota, paying', () => {
    expect(f({ type: 'local_council' })).toEqual(['שדרות']);
    expect(f({ gap: 'shade' })).toEqual(['ערד']);
    expect(f({ gap: 'pending' })).toEqual(['ערד']);
    expect(f({ gap: 'contributions' })).toEqual(['שדרות']);
    expect(f({ quota: 'above' })).toEqual(['תל אביב-יפו']);
    expect(f({ paying: true })).toEqual(['תל אביב-יפו']);
  });
});

describe('sortHubRows', () => {
  it('"not measured" sorts last in both directions', () => {
    expect(sortHubRows(rows, 'score', 'asc').map((r) => r.authorityId)).toEqual(['ערד', 'תל אביב-יפו', 'שדרות']);
    expect(sortHubRows(rows, 'score', 'desc').map((r) => r.authorityId)).toEqual(['תל אביב-יפו', 'ערד', 'שדרות']);
  });
});

describe('hubKpis / quotaBand', () => {
  it('counts levels, unmeasured and pending', () => {
    expect(hubKpis(rows)).toEqual({ total: 3, red: 1, yellow: 0, green: 1, unmeasured: 1, pendingRoutes: 3, pendingContributions: 1 });
    expect(quotaBand(row('x', { approvedRoutes: 8 }))).toBe('within');
  });
});

describe('URL state', () => {
  it('round-trips and writes only non-defaults', () => {
    const s = { ...DEFAULT_HUB_URL_STATE, authority: 'bsv', level: 'red' as const, paying: true, sort: 'name' as const };
    const qs = serializeHubUrlState(s);
    expect(qs).toBe('authority=bsv&level=red&paying=1&sort=name');
    expect(parseHubUrlState(new URLSearchParams(qs))).toEqual(s);
    expect(serializeHubUrlState(DEFAULT_HUB_URL_STATE)).toBe('');
  });
  it('rejects unknown values and bad ids', () => {
    const s = parseHubUrlState(new URLSearchParams('level=purple&sort=evil&authority=a/b&type=military_unit'));
    expect(s).toMatchObject({ level: 'all', sort: 'score', authority: null, type: 'all' });
    expect(validAuthorityId('x'.repeat(129))).toBeNull();
  });
});
