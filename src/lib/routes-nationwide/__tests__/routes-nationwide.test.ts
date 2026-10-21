import { describe, expect, it } from 'vitest';
import { checkpointMismatch, markDone, newCheckpoint, parseCheckpoint, remaining } from '../checkpoint';
import { filterAuthorities, orderAuthorities, type AuthorityRow } from '../order';
import { runAuthorityStages, type CandidateRoute, type StageProvider } from '../stages';
import { summarizeAuthority, summarizeNation } from '../summary';

const A = (o: Partial<AuthorityRow> & { id: string }): AuthorityRow => ({ name: o.id, type: 'city', population: null, isActiveClient: false, parentAuthorityId: null, ...o });

describe('orderAuthorities', () => {
  it('clients → big cities → regional councils → the rest; drops non-targets', () => {
    const rows = [
      A({ id: 'small', population: 20_000 }),
      A({ id: 'rc', type: 'regional_council' }),
      A({ id: 'jlm', population: 990_000 }),
      A({ id: 'client', population: 30_000, isActiveClient: true }),
      A({ id: 'kibbutz', type: 'settlement', parentAuthorityId: 'rc' }),
      A({ id: 'school', type: 'school' }),
      A({ id: 'mid', population: 100_000 }),
    ];
    expect(orderAuthorities(rows).map((r) => `${r.id}:${r.tier}`)).toEqual(['client:client', 'jlm:large_city', 'rc:regional_council', 'mid:other', 'small:other']);
  });
  it('filters by id, city name, kind and limit', () => {
    const rows = orderAuthorities([A({ id: 'a', name: 'חיפה' }), A({ id: 'b', type: 'regional_council' }), A({ id: 'c' })]);
    expect(filterAuthorities(rows, { cities: ['חיפה'] }).map((r) => r.id)).toEqual(['a']);
    expect(filterAuthorities(rows, { kind: 'regional' }).map((r) => r.id)).toEqual(['b']);
    expect(filterAuthorities(rows, { authorityIds: ['c', 'a'] }).map((r) => r.id).sort()).toEqual(['a', 'c']);
    expect(filterAuthorities(rows, { limit: 1 })).toHaveLength(1);
  });
});

describe('checkpoint', () => {
  it('resumes where it stopped and survives a round trip through JSON', () => {
    let c = newCheckpoint('run1', ['a', 'b', 'c'], false, new Date(0));
    c = markDone(c, { authorityId: 'a', name: 'a', finishedAt: 'x', status: 'done' });
    c = markDone(c, { authorityId: 'b', name: 'b', finishedAt: 'x', status: 'error', note: 'boom' });
    const back = parseCheckpoint(JSON.stringify(c))!;
    expect(remaining(back)).toEqual(['c']);
    expect(remaining(back, true)).toEqual(['b', 'c']);
    expect(parseCheckpoint('{')).toBeNull();
  });
  it('refuses to mix dry-run and apply', () => {
    const c = newCheckpoint('r', [], false);
    expect(checkpointMismatch(c, false)).toBeNull();
    expect(checkpointMismatch(c, true)).toMatch(/fresh/);
  });
});

// ── stages ──────────────────────────────────────────────────────────────

const mPerDegLng = 111_320 * Math.cos((32.1 * Math.PI) / 180);
function loopPath(lng: number, lat: number, sideM: number) {
  const dx = sideM / mPerDegLng, dy = sideM / 111_320, n = 12, pts: { lng: number; lat: number }[] = [];
  const corners = [[lng, lat], [lng + dx, lat], [lng + dx, lat + dy], [lng, lat + dy], [lng, lat]];
  for (let k = 0; k < 4; k++) for (let s = 0; s < n; s++) pts.push({ lng: corners[k][0] + (corners[k + 1][0] - corners[k][0]) * s / n, lat: corners[k][1] + (corners[k + 1][1] - corners[k][1]) * s / n });
  pts.push({ lng, lat });
  return pts;
}
/** A good route (scores ≥70): clean composition, lit, named park loop. */
function good(id: string, k: number, extra: Record<string, unknown> = {}): CandidateRoute {
  return {
    id, stage: 'existing', isNew: false,
    data: {
      name: `מסלול ${id}`, distance: [2.5, 5, 9][k % 3], routeShape: 'loop', activityType: 'running', surfaceType: 'asphalt',
      path: loopPath(34.7 + k * 0.03, 32.1, 600 + 100 * (k % 3)),
      source: { externalId: `osm:rel/${k}` },
      qualitySignals: { composition: { genuinePct: 95, sidewalkPct: 0, ordinaryPct: 5, otherPct: 0 }, lighting: { status: 'computed', litCoveragePct: 90, isLit: true } },
      ...extra,
    },
  };
}
const provider = (key: StageProvider['key'], routes: CandidateRoute[], calls: string[]): StageProvider => ({
  key, run: async () => { calls.push(key); return { routes: routes.map((r) => ({ ...r, stage: key, isNew: key !== 'existing' })) }; },
});
const small = { id: 'x', type: 'local_council', population: 20_000 }; // quota 8-15

describe('runAuthorityStages', () => {
  it('stops before generating once the quota minimum is met', async () => {
    const calls: string[] = [];
    const existing = Array.from({ length: 9 }, (_, k) => good(`e${k}`, k));
    const r = await runAuthorityStages(small, [
      provider('existing', existing, calls), provider('dataset', [good('d1', 20)], calls), provider('generated', [good('g1', 30)], calls),
    ]);
    expect(r.score.selection.counts.selected).toBeGreaterThanOrEqual(8);
    expect(r.quotaMetAfter).toBe('existing');
    expect(calls).toEqual(['existing']);
    expect(r.stages.find((s) => s.key === 'generated')?.note).toMatch(/quota minimum met/);
  });
  it('keeps adding sources in order while the quota is not met, and generates last', async () => {
    const calls: string[] = [];
    const r = await runAuthorityStages(small, [
      provider('generated', [good('g1', 3)], calls), provider('existing', [good('e1', 1)], calls), provider('osm', [good('o1', 2)], calls),
    ]);
    expect(calls).toEqual(['existing', 'osm', 'generated']);
    expect(r.quotaMetAfter).toBeNull();
    expect(r.pool.map((p) => `${p.id}:${p.stage}:${p.isNew}`)).toEqual(['e1:existing:false', 'o1:osm:true', 'g1:generated:true']);
  });
  it('drops a new route that duplicates an earlier-stage one — the earlier stage wins', async () => {
    const calls: string[] = [];
    const e = good('e1', 1);
    const dup = { ...good('d1', 1), id: 'd1' };
    const r = await runAuthorityStages(small, [provider('existing', [e], calls), provider('dataset', [dup], calls)]);
    expect(r.pool.map((p) => p.id)).toEqual(['e1']);
    expect(r.stages.find((s) => s.key === 'dataset')).toMatchObject({ offered: 1, added: 0, droppedDuplicate: 1 });
  });
  it('summaries count selected by source and surface, and roll up nationally', async () => {
    const r = await runAuthorityStages(small, [provider('existing', [good('e1', 1)], []), provider('dataset', [good('d1', 5, { activityType: 'cycling' })], [])]);
    const s = summarizeAuthority(r, { name: 'X', tier: 'other' });
    expect(s.selected).toEqual({ total: 2, existing: 1, new: 1 });
    expect(s.selectedBySource).toEqual({ existing: 1, dataset: 1 });
    expect(s.surface.selected.bike_road).toBe(1);
    const n = summarizeNation([s, s]);
    expect(n).toMatchObject({ authorities: 2, selected: 4, selectedNew: 2 });
    expect(n.surfaceSelected.walk_run_paved).toBe(2);
  });
});

import { buildAdminNameIndex, matchAdminRelation, normalizeAuthorityName } from '../admin-match';

describe('admin-match', () => {
  it('normalises council prefixes, hyphens and quotes', () => {
    expect(normalizeAuthorityName('מועצה אזורית שער הנגב')).toBe(normalizeAuthorityName('שער-הנגב'));
    expect(normalizeAuthorityName('תל אביב-יפו')).toBe('תלאביביפו');
    expect(normalizeAuthorityName('קרית אונו')).toBe(normalizeAuthorityName("קרית-אונו"));
  });
  it('unique match, level preference, and no guessing when ambiguous', () => {
    const idx = buildAdminNameIndex([
      { relationId: 1, names: ['חיפה', 'Haifa'], adminLevel: '8' },
      { relationId: 2, names: ['שדרות'], adminLevel: '8' },
      { relationId: 3, names: ['שדרות'], adminLevel: '9' },
      { relationId: 4, names: ['גבעה'], adminLevel: '8' },
      { relationId: 5, names: ['גבעה'], adminLevel: '8' },
    ]);
    expect(matchAdminRelation('חיפה', idx).relationId).toBe(1);
    expect(matchAdminRelation('שדרות', idx).relationId).toBe(2);
    expect(matchAdminRelation('גבעה', idx)).toMatchObject({ relationId: null });
    expect(matchAdminRelation('אין כזה', idx).relationId).toBeNull();
  });
  it('real OSM spellings: maqaf + en dash + ;-separated names, and a leading ה', () => {
    const idx = buildAdminNameIndex([
      { relationId: 1382494, names: ['תל־אביב–יפו', 'תֵּל־אָבִיב–יָפוֹ;תל אביב'], adminLevel: '8' },
      { relationId: 1380232, names: ['מועצה אזורית גלבוע'], adminLevel: '8' },
      { relationId: 1378948, names: ['מועצה אזורית גליל עליון'], adminLevel: '8' },
    ]);
    expect(matchAdminRelation('תל אביב-יפו', idx).relationId).toBe(1382494);
    expect(matchAdminRelation('הגלבוע', idx).relationId).toBe(1380232);
    expect(matchAdminRelation('הגליל העליון', idx).relationId).toBeNull(); // "הגליל העליון" ≠ "גליל עליון" — two ה's; reported, not guessed
  });
});
