/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));

import { resolveContentQuery, routeStatusOf, parkStatusOf, type ContentRow } from '@/lib/admin-analytics/content-resolve';
import { clearAnalyticsCache } from '@/lib/admin-analytics/cache.server';
import { executeAdminTool, type AdminToolContext } from '../execute.server';
import { ADMIN_TOOLS, adminToolDefinitions } from '../tools';
import { adminAssistantSystemPrompt } from '../prompt';

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
const cmpVal = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v);

type Store = Record<string, Record<string, any>>;
function fakeDb(raw: Store, opts: { failCounts?: string[]; failDocs?: string[] } = {}) {
  const store: Store = Object.fromEntries(Object.entries(raw).map(([c, docs]) => [c, Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, wrapDates(d)]))]));
  const reads = { counts: 0, docs: 0 };
  const make = (coll: string) => {
    const build = (wheres: Array<[string, string, unknown]>, order: [string, 'asc' | 'desc'] | null, lim: number | null): any => {
      const matchHere = (): Array<[string, any]> => {
        let rows = Object.entries(store[coll] ?? {}).filter(([, d]) =>
          wheres.every(([f, op, v]) => {
            const x = cmpVal(get(d, f));
            if (op === '==') return x === v;
            if (op === '>') return typeof x === 'number' && x > (v as number);
            throw new Error(`unsupported op ${op}`);
          }),
        );
        if (order) {
          const [f, dir] = order;
          rows = rows.filter(([, d]) => get(d, f) !== undefined).sort((a, b) => (dir === 'desc' ? -1 : 1) * (cmpVal(get(a[1], f)) - cmpVal(get(b[1], f))));
        }
        return rows;
      };
      return {
        where: (f: string, op: string, v: unknown) => build([...wheres, [f, op, v]], order, lim),
        select: () => build(wheres, order, lim),
        orderBy: (f: string, dir: 'asc' | 'desc' = 'asc') => build(wheres, [f, dir], lim),
        limit: (n: number) => build(wheres, order, n),
        count: () => ({
          get: async () => {
            reads.counts += 1;
            if (opts.failCounts?.includes(coll)) throw new Error('FAILED_PRECONDITION: index');
            return { data: () => ({ count: matchHere().length }) };
          },
        }),
        get: async () => {
          reads.docs += 1;
          if (opts.failDocs?.includes(coll)) throw new Error('UNAVAILABLE');
          let docs = matchHere().map(([id, d]) => ({ id, exists: true, data: () => d }));
          if (lim !== null) docs = docs.slice(0, lim);
          return { docs, size: docs.length };
        },
      };
    };
    return build([], null, null);
  };
  const db: any = {
    collection: (coll: string) => ({
      ...make(coll),
      doc: (id: string) => ({
        get: async () => {
          reads.docs += 1;
          if (opts.failDocs?.includes(coll)) throw new Error('UNAVAILABLE');
          const d = store[coll]?.[id];
          return { id, exists: d !== undefined, data: () => d };
        },
      }),
    }),
  };
  return { db, reads };
}

const NOW = new Date('2026-10-22T10:00:00Z');
const SDEROT = 'sderotAuth';
const ARAD = 'aradAuth';
const DATA: Store = {
  authorities: { [SDEROT]: { name: 'שדרות', type: 'city' }, [ARAD]: { name: { he: 'ערד' }, type: 'city' } },
  official_routes: {
    r1: { name: 'תוספת א שכונת בן גוריון', authorityId: SDEROT, city: 'שדרות', published: true, status: 'published', distance: 0.453, duration: 5.2, activityType: 'running', difficulty: 'easy', createdAt: new Date('2026-03-30'), publishedAt: new Date('2026-04-01'), analytics: { usageCount: 48, lastUsed: new Date('2026-05-21T10:00:00Z'), rating: 4.5, heatMapScore: 0.8 } },
    r2: { name: 'שדרות בפארק קלאסי', authorityId: SDEROT, city: 'שדרות', published: true, status: 'published', distance: 3, createdAt: new Date('2026-04-02'), analytics: { usageCount: 82, lastUsed: new Date('2026-06-01T10:00:00Z') } },
    r3: { name: 'לולאת מתחם מזרחי', authorityId: ARAD, city: 'ערד', published: false, status: 'pending', distance: 4.8, activityType: 'walking', createdAt: new Date('2026-10-20') },
    r4: { name: 'לולאה ירוקה', authorityId: ARAD, city: 'ערד', published: false, status: 'archived', createdAt: new Date('2026-09-01') },
    r5: { name: 'לולאה ירוקה', authorityId: SDEROT, city: 'שדרות', published: true, createdAt: new Date('2026-08-01') },
    r6: { name: 'מסלול בלי נתונים', authorityId: ARAD, createdAt: new Date('2026-10-21') },
  },
  curated_routes: { c1: { name: 'סיבוב קצר – תל אביב-יפו', authorityId: 'tlv', city: 'תל אביב-יפו', distance: 13.42, type: 'cycling' } },
  route_scores: { r3: { routeId: 'r3', score: 66.6, confidence: 0.731, band: 'yellow', surfaceClass: 'walk_run_paved', sourceTier: 'osm_named', selection: 'keep', selectionReason: 'top of quota', computedAt: new Date('2026-10-21T08:00:00Z') } },
  parks: {
    p1: { name: 'גינת כושר המגרש האדום', authorityId: SDEROT, city: 'שדרות', published: true, contentStatus: 'published', facilityType: 'gym_park', sportTypes: ['calisthenics'], primaryBrand: 'Urbanics', gymEquipment: [{ equipmentId: 'a' }, { equipmentId: 'b' }], facilities: [{ name: 'מתח', type: 'static' }], hasWaterFountain: true, isShaded: false, ratingAvg: 4.5, reviewCount: 2, createdByUser: 'uid-secret', origin: 'super_admin', createdAt: new Date('2026-01-10') },
    p2: { name: 'גן כושר החשמל', authorityId: ARAD, city: 'ערד', published: true, contentStatus: 'published', ratingAvg: 5, reviewCount: 1, createdAt: new Date('2026-05-01') },
    p3: { name: 'גן כושר החשמל', authorityId: SDEROT, city: 'שדרות', published: false, contentStatus: 'pending_review', createdAt: new Date('2026-10-19') },
    p4: { name: 'פארק בלי כלום', authorityId: SDEROT, published: false, contentStatus: 'draft' },
  },
  sessions: {
    s1: { parkId: 'p1', userId: 'u1', authorityId: SDEROT, date: new Date('2026-10-20T10:00:00Z') },
    s2: { parkId: 'p1', userId: 'u2', authorityId: SDEROT, date: new Date('2026-10-01T10:00:00Z') },
    s3: { parkId: 'p1', userId: 'u1', authorityId: SDEROT, date: new Date('2026-06-01T10:00:00Z') },
    s4: { parkId: 'p2', userId: 'u3', authorityId: ARAD, date: new Date('2026-10-10T10:00:00Z') },
    s5: { parkId: 'p2', userId: 'u3', authorityId: SDEROT, date: new Date('2026-10-11T10:00:00Z') },
    s6: { parkId: 'gone', userId: 'u3', authorityId: ARAD, date: new Date('2026-10-11T10:00:00Z') },
  },
  system_config: { feature_flags: { enable_city_mapping_hub: true } },
};

const ctx = (db: any, role: 'root' | 'super' = 'super'): AdminToolContext => ({ uid: 'u1', role, db, now: NOW });
const payload = (r: { content: string }) => JSON.parse(r.content.replace(/^<tool_data>|<\/tool_data>$/g, ''));

beforeEach(() => {
  clearAnalyticsCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const R = (id: string, name: string, extra: Partial<ContentRow> = {}): ContentRow => ({ id, collection: 'official_routes', name, authorityId: null, city: null, status: 'published', ...extra });

describe('resolveContentQuery', () => {
  const rows = [R('a', 'לולאת מתחם מזרחי'), R('b', 'לולאה ירוקה'), R('c', 'לולאה ירוקה'), R('d', 'הגלבוע')];
  it('by id, by exact normalized name (quotes, spaces, leading ה)', () => {
    expect(resolveContentQuery('a', rows)).toMatchObject({ kind: 'resolved', matchedBy: 'id', row: { id: 'a' } });
    expect(resolveContentQuery(' לולאת  מתחם-מזרחי ', rows)).toMatchObject({ kind: 'resolved', matchedBy: 'name', row: { id: 'a' } });
    expect(resolveContentQuery('גלבוע', rows)).toMatchObject({ kind: 'resolved', row: { id: 'd' } });
  });
  it('same name twice → ambiguous candidates, never a guess (max 5)', () => {
    const r = resolveContentQuery('לולאה ירוקה', rows);
    expect(r.kind === 'ambiguous' && r.candidates.map((c) => c.id)).toEqual(['b', 'c']);
    const many = Array.from({ length: 9 }, (_, i) => R(`m${i}`, 'מסלול זהה'));
    const r2 = resolveContentQuery('מסלול זהה', many);
    expect(r2.kind === 'ambiguous' && r2.candidates.length).toBe(5);
  });
  it('a unique partial name resolves and says so; a weak reverse match does not; nothing → none', () => {
    expect(resolveContentQuery('מתחם מזרחי', rows)).toMatchObject({ kind: 'resolved', matchedBy: 'partial_name', row: { id: 'a' } });
    expect(resolveContentQuery('לולאה', rows).kind).toBe('ambiguous');
    expect(resolveContentQuery('מסלול לולאת מתחם מזרחי בערד', rows)).toMatchObject({ kind: 'resolved', row: { id: 'a' } });
    expect(resolveContentQuery('xxx', [R('z', 'abc')])).toEqual({ kind: 'none' });
    expect(resolveContentQuery('פארק הירקון הגדול', [R('z', 'פארק')])).toEqual({ kind: 'none' });
    expect(resolveContentQuery('   ', rows)).toEqual({ kind: 'none' });
  });
  it('status labels never turn a missing field into a status', () => {
    expect(routeStatusOf({})).toBe('no_publish_field');
    expect(routeStatusOf({ published: false })).toBe('pending');
    expect(routeStatusOf({ published: false, status: 'archived' })).toBe('archived');
    expect(parkStatusOf({})).toBe('no_published_field');
    expect(parkStatusOf({ published: false, contentStatus: 'draft' })).toBe('draft');
    expect(parkStatusOf({ published: false, contentStatus: 'pending_review' })).toBe('pending');
  });
});

describe('get_route_overview', () => {
  it('resolved: shape, score + band from route_scores (Timestamp reads), links, evidence', async () => {
    const { db } = fakeDb(DATA);
    const r = await executeAdminTool(ctx(db), 'get_route_overview', { query: 'לולאת מתחם מזרחי' });
    expect(r.isError).toBe(false);
    const v = payload(r).value;
    expect(v.route).toMatchObject({ id: 'r3', collection: 'official_routes', authority: 'ערד', status: 'pending', distanceKm: 4.8, activityType: 'walking', createdAt: '2026-10-20' });
    expect(v.score).toMatchObject({ score: 67, band: 'yellow', confidence: 0.73, surfaceClass: 'walk_run_paved', computedAt: '2026-10-21' });
    expect(v.scoreStatus).toBe('ok');
    expect(payload(r).meta.definitionId).toBe('route_overview');
    expect(r.evidence?.tool).toBe('get_route_overview');
    expect(r.links).toEqual([
      { href: '/admin/approval-center', title: 'מרכז אישורים', pageId: 'admin/approval-center' },
      { href: `/admin/city-mapping/hub?authority=${ARAD}`, title: 'מרכז מיפוי · ערד', pageId: 'admin/city-mapping/hub' },
    ]);
  });
  it('usage: a counter is reported as stored; an absent counter is null, never 0; no score doc → not_scored', async () => {
    const { db } = fakeDb(DATA);
    const used = payload(await executeAdminTool(ctx(db), 'get_route_overview', { query: 'שדרות בפארק קלאסי' })).value;
    expect(used.usage).toEqual({ completions: 82, lastUsed: '2026-06-01' });
    expect(used.score).toBeNull();
    expect(used.scoreStatus).toBe('not_scored');
    const none = payload(await executeAdminTool(ctx(db), 'get_route_overview', { query: 'מסלול בלי נתונים' })).value;
    expect(none.usage).toEqual({ completions: null, lastUsed: null });
    expect(none.route.status).toBe('no_publish_field');
    expect(none.route.distanceKm).toBeNull();
  });
  it('a curated route resolves too (no publish workflow, no usage counter)', async () => {
    const { db } = fakeDb(DATA);
    const v = payload(await executeAdminTool(ctx(db), 'get_route_overview', { query: 'סיבוב קצר תל אביב-יפו' })).value;
    expect(v.route).toMatchObject({ collection: 'curated_routes', status: 'no_publish_workflow', distanceKm: 13.42, activityType: 'cycling' });
    expect(v.usage.completions).toBeNull();
  });
  it('caveats say starts/views are not recorded', async () => {
    const { db } = fakeDb(DATA);
    const p = payload(await executeAdminTool(ctx(db), 'get_route_overview', { query: 'r1' }));
    expect(p.meta.caveats.join(' ')).toMatch(/starts and views are not recorded/);
  });
  it('ambiguous (same name in two authorities): candidates only, no overview reads, no links', async () => {
    const { db, reads } = fakeDb(DATA);
    const r = await executeAdminTool(ctx(db), 'get_route_overview', { query: 'לולאה ירוקה' });
    const p = payload(r);
    expect(p.resolved).toBe(false);
    expect(p.candidates.map((c: any) => [c.id, c.authority, c.status]).sort()).toEqual([['r4', 'ערד', 'archived'], ['r5', 'שדרות', 'published']]);
    expect(r.links).toBeUndefined();
    expect(r.evidence).toBeUndefined();
    expect(reads.counts).toBe(0);
  });
  it('unknown name → resolved:false with no candidates; a failing list read → error result (not empty)', async () => {
    const { db } = fakeDb(DATA);
    expect(payload(await executeAdminTool(ctx(db), 'get_route_overview', { query: 'zzzz' }))).toMatchObject({ resolved: false, candidates: [] });
    clearAnalyticsCache();
    const bad = fakeDb(DATA, { failDocs: ['official_routes'] });
    const r = await executeAdminTool(ctx(bad.db), 'get_route_overview', { query: 'zzzz' });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('NOT zero');
  });
  it('a failing route_scores read keeps the overview, score null + listed in caveats', async () => {
    const { db } = fakeDb(DATA, { failDocs: ['route_scores'] });
    const r = await executeAdminTool(ctx(db), 'get_route_overview', { query: 'r3' });
    const p = payload(r);
    expect(p.value.scoreStatus).toBe('unreadable');
    expect(p.value.score).toBeNull();
    expect(p.meta.caveats.join(' ')).toContain('score: could not be read');
  });
  it('strict input: extra keys / empty query rejected before any read', async () => {
    const { db, reads } = fakeDb(DATA);
    expect((await executeAdminTool(ctx(db), 'get_route_overview', { query: 'x', collection: 'parks' })).isError).toBe(true);
    expect((await executeAdminTool(ctx(db), 'get_route_overview', { query: '  ' })).isError).toBe(true);
    expect(reads.counts + reads.docs).toBe(0);
  });
});

describe('get_park_overview', () => {
  it('resolved: equipment, ratings, credit (uid never shown), visits from sessions', async () => {
    const { db } = fakeDb(DATA);
    const r = await executeAdminTool(ctx(db), 'get_park_overview', { query: 'גינת כושר המגרש האדום' });
    expect(r.isError).toBe(false);
    expect(r.content).not.toContain('uid-secret');
    const v = payload(r).value;
    expect(v.park).toMatchObject({ id: 'p1', authority: 'שדרות', status: 'published', facilityType: 'gym_park', primaryBrand: 'Urbanics' });
    expect(v.equipment).toEqual({ gymEquipmentCount: 2, facilitiesCount: 1, facilityNames: ['מתח'], amenities: ['hasWaterFountain'] });
    expect(v.ratings).toEqual({ ratingAvg: 4.5, reviewCount: 2, adminRating: null });
    expect(v.credit).toEqual({ creatorRecorded: true, origin: 'super_admin', importedFrom: null });
    expect(v.visits).toEqual({ total: 3, last30Days: 2, distinctUsers: '<5', lastVisit: '2026-10-20' });
    expect(r.links?.map((l) => l.pageId)).toEqual(['admin/parks/[id]/edit', 'admin/city-mapping/hub']);
    expect(r.links?.[0].href).toBe('/admin/parks/p1/edit');
  });
  it('no ratings / no equipment recorded stay null; visits 0 only when the count succeeded', async () => {
    const { db } = fakeDb(DATA);
    const v = payload(await executeAdminTool(ctx(db), 'get_park_overview', { query: 'p4' })).value;
    expect(v.ratings).toEqual({ ratingAvg: null, reviewCount: null, adminRating: null });
    expect(v.equipment.gymEquipmentCount).toBeNull();
    expect(v.park.status).toBe('draft');
    expect(v.visits.total).toBe(0);
    expect(v.credit.creatorRecorded).toBe(false);
  });
  it('a failing sessions count is null + a caveat, never 0', async () => {
    const { db } = fakeDb(DATA, { failCounts: ['sessions'] });
    const p = payload(await executeAdminTool(ctx(db), 'get_park_overview', { query: 'p1' }));
    expect(p.value.visits.total).toBeNull();
    expect(p.value.visits.last30Days).toBe(2);
    expect(p.meta.caveats.join(' ')).toContain('visits.total: could not be counted');
  });
  it('same park name in two authorities → candidates with authority + status', async () => {
    const { db } = fakeDb(DATA);
    const p = payload(await executeAdminTool(ctx(db), 'get_park_overview', { query: 'גן כושר החשמל' }));
    expect(p.resolved).toBe(false);
    expect(p.candidates.map((c: any) => [c.id, c.authority, c.status]).sort()).toEqual([['p2', 'ערד', 'published'], ['p3', 'שדרות', 'pending']]);
  });
  it('strict input', async () => {
    const { db } = fakeDb(DATA);
    expect((await executeAdminTool(ctx(db), 'get_park_overview', { query: 'x', extra: 1 })).isError).toBe(true);
  });
});

describe('get_content_leaderboard', () => {
  const run = (db: any, input: any) => executeAdminTool(ctx(db), 'get_content_leaderboard', input);
  it('routes by usage: only routes that carry the counter, highest first', async () => {
    const { db } = fakeDb(DATA);
    const p = payload(await run(db, { kind: 'routes', by: 'usage', authorityId: null, limit: null }));
    expect(p.value.supported).toBe(true);
    expect(p.value.entries.map((e: any) => [e.rank, e.id, e.value])).toEqual([[1, 'r2', 82], [2, 'r1', 48]]);
    expect(p.meta.caveats.join(' ')).toContain('not measured');
  });
  it('routes by rating: unsupported with a reason — no fabricated ranking', async () => {
    const { db } = fakeDb(DATA);
    const p = payload(await run(db, { kind: 'routes', by: 'rating', authorityId: null, limit: 3 }));
    expect(p.value).toMatchObject({ supported: false, entries: [], ranked: null });
    expect(p.value.reason).toMatch(/no user ratings/);
  });
  it('routes by recent: newest added first, authority filter by id', async () => {
    const { db } = fakeDb(DATA);
    const all = payload(await run(db, { kind: 'routes', by: 'recent', authorityId: null, limit: 2 })).value.entries.map((e: any) => e.id);
    expect(all).toEqual(['r6', 'r3']);
    const arad = payload(await run(db, { kind: 'routes', by: 'recent', authorityId: ARAD, limit: 5 })).value.entries.map((e: any) => [e.id, e.value]);
    expect(arad).toEqual([['r6', '2026-10-21'], ['r3', '2026-10-20'], ['r4', '2026-09-01']]);
  });
  it('parks by usage: sessions grouped per park (park authority filters, not the user authority)', async () => {
    const { db } = fakeDb(DATA);
    const all = payload(await run(db, { kind: 'parks', by: 'usage', authorityId: null, limit: 5 })).value;
    expect(all.entries.map((e: any) => [e.id, e.value, e.authority])).toEqual([['p1', 3, 'שדרות'], ['p2', 2, 'ערד'], ['gone', 1, null]]);
    expect(all.entries[2].status).toBe('park_doc_missing');
    const arad = payload(await run(db, { kind: 'parks', by: 'usage', authorityId: ARAD, limit: 5 })).value.entries.map((e: any) => [e.id, e.value]);
    expect(arad).toEqual([['p2', 2]]);
  });
  it('parks by rating: only parks with reviews, review count shown, small-sample caveat', async () => {
    const { db } = fakeDb(DATA);
    const p = payload(await run(db, { kind: 'parks', by: 'rating', authorityId: null, limit: 5 }));
    expect(p.value.entries.map((e: any) => [e.id, e.value, e.reviewCount])).toEqual([['p2', 5, 1], ['p1', 4.5, 2]]);
    expect(p.meta.caveats.join(' ')).toMatch(/small samples/);
  });
  it('parks by recent', async () => {
    const { db } = fakeDb(DATA);
    const e = payload(await run(db, { kind: 'parks', by: 'recent', authorityId: null, limit: 2 })).value.entries.map((x: any) => x.id);
    expect(e).toEqual(['p3', 'p2']);
  });
  it('a failing read is an error result, never an empty board', async () => {
    const { db } = fakeDb(DATA, { failDocs: ['sessions'] });
    const r = await run(db, { kind: 'parks', by: 'usage', authorityId: null, limit: null });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('NOT zero');
  });
  it('strict input: bad enum / limit / extra key rejected before any read', async () => {
    const { db, reads } = fakeDb(DATA);
    for (const bad of [
      { kind: 'cities', by: 'usage', authorityId: null, limit: null },
      { kind: 'routes', by: 'usage', authorityId: null, limit: 50 },
      { kind: 'routes', by: 'usage', authorityId: null, limit: null, x: 1 },
      { kind: 'routes', by: 'usage' },
    ]) expect((await run(db, bad)).isError).toBe(true);
    expect(reads.counts + reads.docs).toBe(0);
  });
});

describe('registration', () => {
  it('tools are in the fixed list with strict schemas, min role super, and the prompt + dictionary mention them', () => {
    for (const n of ['get_route_overview', 'get_park_overview', 'get_content_leaderboard']) {
      const t = ADMIN_TOOLS.find((x) => x.name === n)!;
      expect(t.minRole).toBe('super');
      expect(t.dataTool).toBe(true);
      expect(adminToolDefinitions().find((d) => d.name === n)?.input_schema).toMatchObject({ additionalProperties: false });
      expect(adminAssistantSystemPrompt()).toContain(n);
    }
    for (const id of ['route_overview', 'park_overview', 'content_leaderboard']) expect(adminAssistantSystemPrompt()).toContain(`${id} —`);
  });
});
