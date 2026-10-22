/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));

import {
  computeAuthorityOverview,
  resolveAuthorityQuery,
  toAuthorityRow,
  type AuthorityOverview,
} from '@/lib/admin-analytics/authority-overview.server';
import { executeAdminTool, type AdminToolContext } from '../execute.server';
import { runAdminTurn } from '../turn';
import { adminToolDefinitions, ADMIN_TOOLS } from '../tools';
import { adminAssistantSystemPrompt } from '../prompt';
import { searchAdminPages } from '@/lib/admin-nav/fuzzy-search';
import { pagesVisibleTo } from '@/lib/admin-nav/page-map';

// ── a fake Admin SDK that stores what the real one RETURNS: Dates come back as Timestamps
//    (.toDate()/.toMillis(), deliberately no .getTime()) — axiom §31 ──
function ts(d: Date) {
  return { toDate: () => new Date(d.getTime()), toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
}
function wrapDates(v: any): any {
  if (v instanceof Date) return ts(v);
  if (Array.isArray(v)) return v.map(wrapDates);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wrapDates(x)]));
  return v;
}
const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);

type Store = Record<string, Record<string, any>>;
function fakeDb(raw: Store, opts: { failCounts?: string[] } = {}) {
  const store: Store = Object.fromEntries(Object.entries(raw).map(([c, docs]) => [c, Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, wrapDates(d)]))]));
  const reads = { counts: 0, docs: 0 };
  const query = (coll: string, wheres: Array<[string, unknown]>): any => ({
    where: (f: string, op: string, v: unknown) => {
      if (op !== '==') throw new Error(`unsupported op ${op}`);
      return query(coll, [...wheres, [f, v]]);
    },
    select: () => query(coll, wheres),
    count: () => ({
      get: async () => {
        reads.counts += 1;
        if (opts.failCounts?.includes(coll)) throw new Error('FAILED_PRECONDITION: index');
        const n = Object.values(store[coll] ?? {}).filter((d) => wheres.every(([f, v]) => get(d, f) === v)).length;
        return { data: () => ({ count: n }) };
      },
    }),
    get: async () => {
      reads.docs += 1;
      const docs = Object.entries(store[coll] ?? {})
        .filter(([, d]) => wheres.every(([f, v]) => get(d, f) === v))
        .map(([id, d]) => ({ id, exists: true, data: () => d }));
      return { docs, size: docs.length };
    },
  });
  const db: any = {
    collection: (coll: string) => ({
      ...query(coll, []),
      doc: (id: string) => ({
        get: async () => {
          reads.docs += 1;
          const d = store[coll]?.[id];
          return { id, exists: d !== undefined, data: () => d };
        },
      }),
    }),
  };
  return { db, reads };
}

const SHAAR = 'shaarHanegev01';
const DATA: Store = {
  authorities: {
    [SHAAR]: { name: 'מועצה אזורית שער הנגב', type: 'regional_council', pipelineStatus: 'meeting', isActiveClient: false, population: 8500, updatedAt: new Date('2026-10-01') },
    sderot: { name: { he: 'שדרות', en: 'Sderot' }, type: 'city', isActiveClient: true, population: 35000 },
    kfar1: { name: 'כפר סבא', type: 'city' },
    kfar2: { name: 'כפר יונה', type: 'city' },
    galboa: { name: 'הגלבוע', type: 'regional_council' },
  },
  city_inventory: {
    [SHAAR]: {
      authorityId: SHAAR,
      city: 'שער הנגב',
      authorityType: 'regional_council',
      areaKm2: 180.44,
      snapshot: { osmPbfDate: '2026-10-15', builtAt: new Date('2026-10-16T08:00:00Z'), builtBy: 'x', runId: 'r1' },
      layers: {
        parks: { count: 12, files: [{ path: 'a', bytes: 1, sha256: 'x' }], lastRefreshAt: new Date('2026-10-16T08:00:00Z') },
        bike_paved: { lengthKm: 4.26 },
        shade: { coveragePct: 23.4, method: 'canopy_estimate' },
      },
      readiness: { score: 61.6, level: 'yellow', missing: ['lighting'], blockers: ['lighting not measured'] },
      schemaVersion: 2,
      updatedAt: new Date('2026-10-16T08:01:00Z'),
    },
  },
  official_routes: {
    r1: { authorityId: SHAAR, published: true, status: 'published' },
    r2: { authorityId: SHAAR, published: true, displayRole: 'connector' },
    r3: { authorityId: SHAAR, published: false, status: 'pending' },
    r4: { authorityId: SHAAR, published: false, status: 'archived' },
    r5: { authorityId: SHAAR, published: false, status: 'rejected' },
    r6: { authorityId: SHAAR },
    other: { authorityId: 'sderot', published: false },
  },
  parks: {
    p1: { authorityId: SHAAR, published: true },
    p2: { authorityId: SHAAR, published: false, contentStatus: 'pending_review' },
    p3: { authorityId: SHAAR, published: false, contentStatus: 'draft' },
  },
  users: Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`u${i}`, { core: { authorityId: i < 6 ? SHAAR : 'sderot', email: `x${i}@y` } }])),
  system_config: { feature_flags: { enable_city_mapping_hub: true } },
};

const rows = Object.entries(DATA.authorities).map(([id, d]) => toAuthorityRow(id, d));
const ctx = (db: any, role: 'root' | 'super' = 'super'): AdminToolContext => ({ uid: 'u1', role, db, now: new Date('2026-10-22T10:00:00Z') });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('resolveAuthorityQuery', () => {
  it('exact name — with or without the "מועצה אזורית" prefix, maqaf, spaces', () => {
    for (const q of ['שער הנגב', 'מועצה אזורית שער הנגב', 'שער-הנגב', ' שערהנגב ']) {
      const r = resolveAuthorityQuery(q, rows);
      expect(r.kind).toBe('resolved');
      if (r.kind === 'resolved') expect(r.row.id).toBe(SHAAR);
    }
  });
  it('by id, by an English name, and with/without a leading ה', () => {
    expect(resolveAuthorityQuery(SHAAR, rows)).toMatchObject({ kind: 'resolved', matchedBy: 'id' });
    expect(resolveAuthorityQuery('Sderot', rows)).toMatchObject({ kind: 'resolved', row: { id: 'sderot' } });
    expect(resolveAuthorityQuery('גלבוע', rows)).toMatchObject({ kind: 'resolved', row: { id: 'galboa' }, matchedBy: 'name' });
  });
  it('ambiguous → candidates (max 5), never a guess', () => {
    const r = resolveAuthorityQuery('כפר', rows);
    expect(r.kind).toBe('ambiguous');
    if (r.kind === 'ambiguous') expect(r.candidates.map((c) => c.id).sort()).toEqual(['kfar1', 'kfar2']);
    const many = Array.from({ length: 9 }, (_, i) => toAuthorityRow(`k${i}`, { name: 'קריית שמונה' }));
    const r2 = resolveAuthorityQuery('קריית שמונה', many);
    expect(r2.kind === 'ambiguous' && r2.candidates.length).toBe(5);
  });
  it('a unique partial name resolves and says so; nothing → none', () => {
    expect(resolveAuthorityQuery('יונה', rows)).toMatchObject({ kind: 'resolved', row: { id: 'kfar2' }, matchedBy: 'partial_name' });
    expect(resolveAuthorityQuery('תל אביב', rows)).toEqual({ kind: 'none' });
    expect(resolveAuthorityQuery('   ', rows)).toEqual({ kind: 'none' });
  });
});

describe('computeAuthorityOverview — Timestamp-shaped reads (axiom §31)', () => {
  it('returns the compact shape with counts, inventory and masked users', async () => {
    const { db } = fakeDb(DATA);
    const ov = (await computeAuthorityOverview(db, SHAAR)) as AuthorityOverview;
    expect(ov.authority).toEqual({
      id: SHAAR, name: 'מועצה אזורית שער הנגב', type: 'regional_council', tenantType: null,
      pipelineStatus: 'meeting', pipelineLabel: 'פגישה', isActiveClient: false, population: 8500, parentAuthorityId: null,
    });
    expect(ov.inventoryStatus).toBe('ok');
    expect(ov.inventory).toMatchObject({
      readinessLevel: 'yellow', readinessScore: 62, missingLayers: ['lighting'], areaKm2: 180.4,
      osmSnapshotDate: '2026-10-15', updatedAt: '2026-10-16',
      layers: { parks: { count: 12 }, bike_paved: { km: 4.3 }, shade: { pct: 23 } },
    });
    expect(Object.keys(ov.inventory!.layers)).toEqual(['parks', 'bike_paved', 'shade']);
    expect(ov.routes).toEqual({ total: 6, published: 2, pending: 1, archived: 1, rejected: 1, connectors: 1, noPublishField: 1 });
    expect(ov.parks).toEqual({ total: 3, published: 1, pending: 1 });
    expect(ov.users).toBe(6);
    expect(ov.failed).toEqual([]);
  });
  it('small user counts are masked; missing pipelineStatus reads as lead; no inventory = not_mapped', async () => {
    const { db } = fakeDb(DATA);
    const ov = (await computeAuthorityOverview(db, 'sderot')) as AuthorityOverview;
    expect(ov.users).toBe('<5');
    expect(ov.authority.pipelineStatus).toBe('lead');
    expect(ov.authority.isActiveClient).toBe(true);
    expect(ov.inventory).toBeNull();
    expect(ov.inventoryStatus).toBe('not_mapped');
  });
  it('a failing count is null + listed in failed, never 0', async () => {
    const { db } = fakeDb(DATA, { failCounts: ['official_routes'] });
    const ov = (await computeAuthorityOverview(db, SHAAR)) as AuthorityOverview;
    expect(ov.routes.total).toBeNull();
    expect(ov.routes.pending).toBeNull();
    expect(ov.failed).toContain('routes.total');
    expect(ov.parks.published).toBe(1);
  });
  it('an unknown id → null', async () => {
    expect(await computeAuthorityOverview(fakeDb(DATA).db, 'nope')).toBeNull();
  });
});

describe('get_authority_overview tool', () => {
  it('resolved: evidence card, links to the hub (focused) and the CRM page, compact result', async () => {
    const { db } = fakeDb(DATA);
    const r = await executeAdminTool(ctx(db), 'get_authority_overview', { query: 'שער הנגב' });
    expect(r.isError).toBe(false);
    expect(r.truncated).toBe(false);
    expect(r.content).toContain('"definitionId":"authority_overview"');
    expect(r.evidence?.tool).toBe('get_authority_overview');
    expect(r.evidence?.numbers).toEqual(expect.arrayContaining([8500, 6, 12]));
    expect(r.links).toEqual([
      { href: `/admin/city-mapping/hub?authority=${SHAAR}`, title: 'מרכז מיפוי · מועצה אזורית שער הנגב', pageId: 'admin/city-mapping/hub' },
      { href: `/admin/authorities/${SHAAR}`, title: 'ניהול רשות · מועצה אזורית שער הנגב', pageId: 'admin/authorities/[id]' },
    ]);
  });
  it('hub flag off → the plain city-mapping page', async () => {
    const { db } = fakeDb({ ...DATA, system_config: { feature_flags: { enable_city_mapping_hub: false } } });
    const r = await executeAdminTool(ctx(db), 'get_authority_overview', { query: SHAAR });
    expect(r.links?.[0]).toMatchObject({ href: '/admin/city-mapping', pageId: 'admin/city-mapping' });
  });
  it('ambiguous / unknown: candidates only, no overview counts read, no links', async () => {
    const { db, reads } = fakeDb(DATA);
    const r = await executeAdminTool(ctx(db), 'get_authority_overview', { query: 'כפר' });
    expect(r.isError).toBe(false);
    expect(JSON.parse(r.content.replace(/^<tool_data>|<\/tool_data>$/g, ''))).toMatchObject({ resolved: false, candidates: [{}, {}] });
    expect(r.links).toBeUndefined();
    expect(reads.counts).toBe(0);
    const none = await executeAdminTool(ctx(db), 'get_authority_overview', { query: 'zzzz-unknown' });
    expect(none.content).toContain('"resolved":false');
  });
  it('strict input: extra keys / empty query rejected before any read', async () => {
    const { db, reads } = fakeDb(DATA);
    expect((await executeAdminTool(ctx(db), 'get_authority_overview', { query: 'x', authorityId: 'y' })).isError).toBe(true);
    expect((await executeAdminTool(ctx(db), 'get_authority_overview', { query: '  ' })).isError).toBe(true);
    expect(reads.counts + reads.docs).toBe(0);
  });
  it('the turn loop forwards every link of a tool as a link event', async () => {
    const { db } = fakeDb(DATA);
    const events: any[] = [];
    let call = 0;
    const out = await runAdminTurn(
      { model: 'm', system: [], tools: adminToolDefinitions(), messages: [{ role: 'user', content: 'מה מידע על שער הנגב?' }] },
      {
        callModel: async () => {
          call += 1;
          const content = call === 1
            ? [{ type: 'tool_use', id: 't1', name: 'get_authority_overview', input: { query: 'שער הנגב' } }]
            : [{ type: 'text', text: 'ok' }];
          return { message: { content, stop_reason: call === 1 ? 'tool_use' : 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } } as any, costUsd: 0 };
        },
        executeTool: (n, i) => executeAdminTool(ctx(db), n, i),
        emit: (e) => events.push(e),
      },
    );
    expect(out.links.map((l) => l.pageId)).toEqual(['admin/city-mapping/hub', 'admin/authorities/[id]']);
    expect(events.filter((e) => e.type === 'link')).toHaveLength(2);
  });
});

describe('prompt + nav registry', () => {
  it('the tool is in the fixed list (appended last) and the prompt points to it', () => {
    expect(ADMIN_TOOLS[ADMIN_TOOLS.length - 1].name).toBe('get_authority_overview');
    expect(adminAssistantSystemPrompt()).toContain('get_authority_overview');
    expect(adminAssistantSystemPrompt()).toContain('authority_overview —');
  });
  it('the city-mapping hub is findable by navigation words', () => {
    const top = searchAdminPages('מרכז מיפוי ערים', pagesVisibleTo('super'), 3).map((r) => r.page.id);
    expect(top[0]).toBe('admin/city-mapping/hub');
    expect(searchAdminPages('מיפוי רשות', pagesVisibleTo('super'), 3).map((r) => r.page.id)).toContain('admin/city-mapping/hub');
  });
});
