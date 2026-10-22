/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));

import { clearAnalyticsCache } from '@/lib/admin-analytics/cache.server';
import { buildComparisonTable, compareAuthorities } from '@/lib/admin-analytics/authority-compare.server';
import { getAuthoritiesRanking, rankRows } from '@/lib/admin-analytics/authority-ranking.server';
import { buildCrmTimeline, computeCrmTimeline } from '@/lib/admin-analytics/crm-timeline.server';
import { getFinanceOverview, periodBack } from '@/lib/admin-analytics/finance-overview.server';
import { executeAdminTool, type AdminToolContext } from '../execute.server';
import { ADMIN_TOOLS, adminToolDefinitions, validateAdminToolInput } from '../tools';
import { adminAssistantSystemPrompt } from '../prompt';
import { METRIC_DEFS } from '@/lib/admin-analytics/metric-defs';

// A fake Admin SDK that stores what the real one RETURNS: Dates come back as Timestamps
// (.toDate()/.toMillis(), deliberately no .getTime()) — axiom §31.
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
function fakeDb(raw: Store, opts: { failCounts?: string[]; failGets?: string[] } = {}) {
  const store: Store = Object.fromEntries(Object.entries(raw).map(([c, docs]) => [c, Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, wrapDates(d)]))]));
  const reads = { counts: 0, docs: 0, scans: 0 };
  const match = (d: any, wheres: Array<[string, string, unknown]>) =>
    wheres.every(([f, op, v]) => {
      const x = get(d, f);
      if (op === '==') return x === v;
      if (x === undefined || x === null) return false;
      return op === '>=' ? (x as any) >= (v as any) : (x as any) > (v as any);
    });
  const query = (coll: string, wheres: Array<[string, string, unknown]>): any => ({
    where: (f: string, op: string, v: unknown) => query(coll, [...wheres, [f, op, v]]),
    select: () => query(coll, wheres),
    count: () => ({
      get: async () => {
        reads.counts += 1;
        if (opts.failCounts?.includes(coll)) throw new Error('FAILED_PRECONDITION: index');
        return { data: () => ({ count: Object.values(store[coll] ?? {}).filter((d) => match(d, wheres)).length }) };
      },
    }),
    get: async () => {
      reads.scans += 1;
      if (opts.failGets?.includes(coll)) throw new Error('UNAVAILABLE');
      const docs = Object.entries(store[coll] ?? {})
        .filter(([, d]) => match(d, wheres))
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

const NOW = new Date('2026-10-22T10:00:00Z');
const inv = (id: string, score: number, level: string) => ({
  authorityId: id,
  city: id,
  authorityType: 'city',
  areaKm2: 10,
  snapshot: { osmPbfDate: '2026-10-15', builtAt: new Date('2026-10-16T08:00:00Z'), builtBy: 'x', runId: 'r' },
  layers: {},
  readiness: { score, level, missing: [], blockers: [] },
  schemaVersion: 2,
  updatedAt: new Date('2026-10-16T08:01:00Z'),
});

const DATA: Store = {
  authorities: {
    sderot: {
      name: { he: 'שדרות' }, type: 'city', pipelineStatus: 'closing', isActiveClient: true, population: 35000,
      activityLog: [
        { type: 'email', date: new Date('2026-09-01T00:00:00Z'), summary: 'שלחנו הצעת מחיר' },
        { type: 'meeting', date: new Date('2026-10-12T00:00:00Z'), summary: 'פגישה במשרדי העירייה' },
        { type: 'note', createdAt: new Date('2026-10-14T00:00:00Z'), content: 'הערה פנימית' },
        { type: 'call', summary: 'שיחה ללא תאריך' },
        { type: 'email', date: new Date('2026-08-01T00:00:00Z'), summary: 'x'.repeat(400) },
      ],
      tasks: [
        { title: 'לחזור אליהם', status: 'open', createdAt: new Date('2026-10-01T00:00:00Z') },
        { title: 'לשלוח חוזה', status: 'pending', dueDate: new Date('2026-10-30T00:00:00Z'), createdAt: new Date('2026-09-01T00:00:00Z') },
        { title: 'סגור', status: 'done' },
      ],
      contacts: [{ name: 'דניאל', phone: '0501234567', email: 'a@b.gov.il' }],
      financials: { totalQuoteAmount: 10000, installments: [{ id: 'i1', amount: 4000, targetMonth: '2026-08', status: 'paid' }, { id: 'i2', amount: 6000, targetMonth: '2026-12', status: 'pending' }] },
    },
    ofakim: { name: 'אופקים', type: 'local_council', pipelineStatus: 'lead', financials: { totalQuoteAmount: 20000, installments: [] } },
    kfar1: { name: 'כפר סבא', type: 'city', pipelineStatus: 'draft' },
    kfar2: { name: 'כפר יונה', type: 'local_council' },
    shaar: { name: 'מועצה אזורית שער הנגב', type: 'regional_council', pipelineStatus: 'meeting' },
    hood: { name: 'שכונת האחוזה', type: 'neighborhood', pipelineStatus: 'lead' },
    demo: { name: 'דמו', type: 'city', isDemo: true, pipelineStatus: 'demo' },
  },
  city_inventory: { sderot: inv('sderot', 80, 'green'), shaar: inv('shaar', 40, 'yellow') },
  official_routes: {
    r1: { authorityId: 'sderot', published: true }, r2: { authorityId: 'sderot', published: true }, r3: { authorityId: 'sderot', published: false, status: 'pending' },
    r4: { authorityId: 'ofakim', published: true },
  },
  parks: { p1: { authorityId: 'sderot', published: true }, p2: { authorityId: 'ofakim', published: false, contentStatus: 'pending_review' } },
  users: {
    ...Object.fromEntries(Array.from({ length: 7 }, (_, i) => [`s${i}`, { core: { authorityId: 'sderot' } }])),
    o1: { core: { authorityId: 'ofakim' } }, o2: { core: { authorityId: 'ofakim' } },
    h1: { core: { authorityId: 'hood' } }, n1: { core: {} },
  },
  transactions: {
    t1: { type: 'expense', approval: 'approved', category: 'תוכנה/כלים', currency: 'USD', amountGross: 200, period: '2026-10' },
    t2: { type: 'expense', approval: 'approved', category: 'תוכנה/כלים', currency: 'USD', amountGross: 16.13, period: '2026-09' },
    t3: { type: 'expense', approval: 'approved', category: 'פיתוח', currency: 'ILS', amountGross: 1180, period: '2026-09' },
    t4: { type: 'expense', approval: 'approved', category: 'פיתוח', currency: 'ILS', period: '2026-09' },
    t5: { type: 'expense', approval: 'pending', category: 'שיווק', currency: 'ILS', amountGross: 999, period: '2026-10', needsReview: true },
    t6: { type: 'expense', approval: 'rejected', category: 'שיווק', currency: 'ILS', amountGross: 5000, period: '2026-10' },
    t7: { type: 'expense', approval: 'approved', category: 'פיתוח', currency: 'ILS', amountGross: 7777, period: '2026-01' },
  },
};

const ctx = (db: any, role: 'root' | 'super' = 'super'): AdminToolContext => ({ uid: 'u1', role, db, now: NOW });

beforeEach(() => {
  clearAnalyticsCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('compare_authorities', () => {
  it('resolves names and returns one column per authority with the overview numbers', async () => {
    const { db } = fakeDb(DATA);
    const r = await compareAuthorities(db, ['שדרות', 'אופקים'], { now: NOW });
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    const v = r.result.value!;
    expect(v.authorities.map((a) => a.id)).toEqual(['sderot', 'ofakim']);
    const row = (m: string) => v.table.find((t) => t.metric === m)!.values;
    expect(row('crm_status')[0]).toBe('סגירה');
    expect(row('routes_published')).toEqual([2, 1]);
    expect(row('routes_pending')).toEqual([1, 0]);
    expect(row('parks_pending')).toEqual([0, 1]);
    expect(row('users')).toEqual([7, '<5']);
    expect(row('mapping_level')).toEqual(['green', 'not_mapped']);
    expect(row('mapping_score')).toEqual([80, null]);
    expect(row('is_active_client')).toEqual([true, false]);
    expect(Object.values(v.table).every((t) => t.values.length === 2)).toBe(true);
    expect(r.result.meta.definitionId).toBe('authority_compare');
  });

  it('ambiguous name → candidates and ZERO overview reads', async () => {
    const { db, reads } = fakeDb(DATA);
    const r = await compareAuthorities(db, ['כפר', 'שדרות'], { now: NOW });
    expect(r.kind).toBe('unresolved');
    if (r.kind === 'unresolved') {
      expect(r.problems).toHaveLength(1);
      expect(r.problems[0].candidates.map((c) => c.id).sort()).toEqual(['kfar1', 'kfar2']);
    }
    expect(reads.counts).toBe(0);
    const none = await compareAuthorities(db, ['לא קיימת', 'שדרות'], { now: NOW });
    expect(none.kind === 'unresolved' && none.problems[0].problem).toBe('none');
  });

  it('two names for the same authority → too_few; a failed count is null, never 0', async () => {
    const { db } = fakeDb(DATA);
    expect((await compareAuthorities(db, ['שדרות', 'sderot'], { now: NOW })).kind).toBe('too_few');
    const failing = fakeDb(DATA, { failCounts: ['official_routes'] });
    const r = await compareAuthorities(failing.db, ['שדרות', 'אופקים'], { now: NOW });
    expect(r.kind).toBe('resolved');
    if (r.kind === 'resolved') {
      expect(r.result.value!.table.find((t) => t.metric === 'routes_published')!.values).toEqual([null, null]);
      expect(r.result.value!.table.find((t) => t.metric === 'routes_pending')!.values).toEqual([null, null]);
      expect(r.result.meta.caveats.some((c) => c.includes('could not be counted'))).toBe(true);
      expect(r.result.value!.table.find((t) => t.metric === 'parks_published')!.values).toEqual([1, 0]);
    }
  });

  it('buildComparisonTable is pure on overviews', () => {
    expect(buildComparisonTable([]).table.every((t) => t.values.length === 0)).toBe(true);
  });
});

describe('get_authorities_ranking', () => {
  const rank = (db: any, a: Partial<Parameters<typeof getAuthoritiesRanking>[1]> & { by: any }) =>
    getAuthoritiesRanking(db, { kind: null, direction: null, limit: null, ...a }, { now: NOW });

  it('users: top first, only city/local/regional, neighborhoods + demo excluded, small counts masked', async () => {
    const { db } = fakeDb(DATA);
    const r = await rank(db, { by: 'users' });
    const rows = r.value!.rows;
    expect(rows.map((x) => x.id).slice(0, 2)).toEqual(['sderot', 'ofakim']);
    expect(rows).toHaveLength(5);
    expect(rows[0]).toMatchObject({ id: 'sderot', value: 7, rank: 1 });
    expect(rows[1].value).toBe('<5');
    expect(rows.map((x) => x.id)).not.toContain('hood');
    expect(rows.map((x) => x.id)).not.toContain('demo');
    expect(r.value!.ranked).toBe(5);
  });

  it('bottom + kind filters + limit', async () => {
    const { db } = fakeDb(DATA);
    const regional = await rank(db, { by: 'routes', kind: 'regional' });
    expect(regional.value!.rows.map((x) => x.id)).toEqual(['shaar']);
    expect(regional.value!.rows[0].value).toBe(0); // a real zero: the scan succeeded
    const bottom = await rank(db, { by: 'routes', kind: 'city', direction: 'bottom', limit: 2 });
    expect(bottom.value!.rows).toHaveLength(2);
    expect(bottom.value!.rows[0].value).toBe(0);
    const top = await rank(db, { by: 'parks', kind: 'city' });
    expect(top.value!.rows[0]).toMatchObject({ id: 'sderot', value: 1 });
  });

  it('mapping_score ranks only mapped authorities and reports the rest as withoutValue', async () => {
    const { db } = fakeDb(DATA);
    const r = await rank(db, { by: 'mapping_score' });
    expect(r.value!.rows.map((x) => [x.id, x.value, x.label])).toEqual([['sderot', 80, 'green'], ['shaar', 40, 'yellow']]);
    expect(r.value!.withoutValue).toBe(3);
  });

  it('crm_stage: draft is not pipeline; a missing status reads as lead', async () => {
    const { db } = fakeDb(DATA);
    const r = await rank(db, { by: 'crm_stage' });
    const ids = r.value!.rows.map((x) => x.id);
    expect(ids.slice(0, 2)).toEqual(['sderot', 'shaar']);
    expect(ids).not.toContain('kfar1');
    expect(ids).toContain('kfar2');
    expect(r.value!.rows[0]).toMatchObject({ id: 'sderot', label: 'סגירה' });
  });

  it('a failed scan is "could not be computed" (value null), never an empty ranking', async () => {
    const { db } = fakeDb(DATA, { failGets: ['users'] });
    const r = await rank(db, { by: 'users' });
    expect(r.value).toBeNull();
    expect(r.error).toBeTruthy();
    const out = await executeAdminTool(ctx(db), 'get_authorities_ranking', { by: 'users', kind: null, direction: null, limit: null });
    expect(out.isError).toBe(true);
    expect(out.content).toContain('NOT zero');
  });

  it('rankRows is stable on ties', () => {
    const a = (id: string, name: string) => ({ id, name, type: 'city', pipelineStatus: 'lead' });
    const rows = rankRows([{ a: a('b', 'ב'), value: 1 }, { a: a('a', 'א'), value: 1 }], 'top', 5, 'routes');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('get_crm_authority_timeline', () => {
  it('Timestamp dates are normalised; newest first; contact days; next steps from open tasks', async () => {
    const { db } = fakeDb(DATA);
    const res = (await computeCrmTimeline(db, 'sderot', NOW))!;
    const v = res.value!;
    expect(v.pipelineStatus).toBe('closing');
    expect(v.isActiveClient).toBe(true);
    expect(v.activity.total).toBe(5);
    expect(v.activity.recent.map((e) => e.date)).toEqual(['2026-10-14', '2026-10-12', '2026-09-01', '2026-08-01', null]);
    expect(v.activity.lastEmailDate).toBe('2026-09-01');
    expect(v.activity.lastMeetingDate).toBe('2026-10-12');
    expect(v.activity.lastCallDate).toBeNull(); // the only call has no date — never invented
    expect(v.activity.daysSinceLastContact).toBe(10);
    expect(v.activity.recent[3].summary.length).toBeLessThanOrEqual(160);
    expect(v.tasks).toMatchObject({ open: 2, done: 1 });
    expect(v.tasks.nextSteps[0]).toMatchObject({ title: 'לשלוח חוזה', dueDate: '2026-10-30' });
    expect(v.contactsCount).toBe(1);
    expect(JSON.stringify(res)).not.toContain('0501234567');
    expect(res.meta.caveats.join(' ')).toContain('no status history');
  });

  it('missing arrays → honest empties; no status = lead', () => {
    const v = buildCrmTimeline('x', { name: 'x' }, NOW);
    expect(v.pipelineStatus).toBe('lead');
    expect(v.activity).toMatchObject({ total: 0, lastActivityDate: null, lastEmailDate: null, daysSinceLastContact: null });
    expect(v.tasks).toEqual({ open: 0, done: 0, nextSteps: [] });
  });

  it('via the tool: ambiguous → candidates; resolved → CRM button', async () => {
    const { db } = fakeDb(DATA);
    const amb = await executeAdminTool(ctx(db), 'get_crm_authority_timeline', { query: 'כפר' });
    expect(amb.isError).toBe(false);
    expect(amb.content).toContain('candidates');
    expect(amb.evidence).toBeUndefined();
    const ok = await executeAdminTool(ctx(db), 'get_crm_authority_timeline', { query: 'שדרות' });
    expect(ok.isError).toBe(false);
    expect(ok.evidence?.definitionId).toBe('crm_timeline');
    expect(ok.links?.every((l) => l.pageId === 'admin/authorities/[id]')).toBe(true);
  });
});

describe('get_finance_overview', () => {
  it('counts approved rows in the window per currency, never converts, pending apart', async () => {
    const { db } = fakeDb(DATA);
    const r = await getFinanceOverview(db, 6, { now: NOW });
    const v = r.value!;
    expect(v.fromPeriod).toBe('2026-05');
    expect(v.toPeriod).toBe('2026-10');
    expect(v.expenses.totals).toEqual([{ currency: 'ILS', total: 1180 }, { currency: 'USD', total: 216.13 }]);
    expect(v.expenses.count).toBe(3);
    expect(v.rowsWithoutAmount).toBe(1);
    expect(v.expenses.byCategory.map((c) => c.category).sort()).toEqual(['תוכנה/כלים'].concat(['פיתוח']).sort());
    expect(v.expenses.byMonth.map((m) => m.period)).toEqual(['2026-09', '2026-10']);
    expect(v.pendingApproval).toEqual({ count: 1, needsReview: 1 });
    expect(v.income).toMatchObject({ count: 0, totals: [] }); // a genuine 0: the read succeeded
    expect(JSON.stringify(v)).not.toContain('7777'); // Jan 2026 is outside 6 months
  });

  it('a longer window includes older rows; receivables come from authorities.financials', async () => {
    const { db } = fakeDb(DATA);
    const v = (await getFinanceOverview(db, 12, { now: NOW })).value!;
    expect(v.expenses.totals.find((t) => t.currency === 'ILS')!.total).toBe(1180 + 7777);
    expect(v.receivables).toMatchObject({ authoritiesWithQuote: 2, totalQuoted: 30000, paid: 4000, scheduledPending: 6000 });
    expect(v.receivables.rows[0]).toMatchObject({ id: 'ofakim', quoted: 20000, paid: 0 });
  });

  it('a failed read is null + error, not zeros', async () => {
    const { db } = fakeDb(DATA, { failGets: ['transactions'] });
    const r = await getFinanceOverview(db, 6, { now: NOW });
    expect(r.value).toBeNull();
    const out = await executeAdminTool(ctx(db), 'get_finance_overview', { months: null });
    expect(out.isError).toBe(true);
  });

  it('periodBack crosses year boundaries', () => {
    expect(periodBack('2026-02-10', 0)).toBe('2026-02');
    expect(periodBack('2026-02-10', 2)).toBe('2025-12');
    expect(periodBack('2026-01-01', 12)).toBe('2025-01');
  });

  it('via the tool: evidence + a button to the expenses page', async () => {
    const { db } = fakeDb(DATA);
    const out = await executeAdminTool(ctx(db), 'get_finance_overview', { months: 3 });
    expect(out.isError).toBe(false);
    expect(out.evidence?.definitionId).toBe('finance_overview');
    expect(out.links?.[0]?.pageId).toBe('admin/finance/expenses');
  });
});

describe('strict inputs, dictionary and prompt', () => {
  const NAMES = ['compare_authorities', 'get_authorities_ranking', 'get_crm_authority_timeline', 'get_finance_overview'];
  it('registered as strict, super-level data tools', () => {
    for (const n of NAMES) {
      const t = ADMIN_TOOLS.find((x) => x.name === n)!;
      expect(t.minRole).toBe('super');
      expect(t.dataTool).toBe(true);
      expect((t.input_schema as any).additionalProperties).toBe(false);
      expect((t.input_schema as any).required.sort()).toEqual(Object.keys((t.input_schema as any).properties).sort());
    }
    expect(adminToolDefinitions().filter((d) => NAMES.includes(d.name))).toHaveLength(4);
  });
  it('rejects extras, wrong counts and out-of-range values', () => {
    const bad = (n: string, i: unknown) => expect(validateAdminToolInput(n, i).ok).toBe(false);
    bad('compare_authorities', { ids_or_names: ['שדרות'] });
    bad('compare_authorities', { ids_or_names: ['a', 'b', 'c', 'd', 'e', 'f'] });
    bad('compare_authorities', { ids_or_names: ['a', ''] });
    bad('compare_authorities', { ids_or_names: ['a', 'b'], extra: 1 });
    bad('get_authorities_ranking', { by: 'revenue', kind: null, direction: null, limit: null });
    bad('get_authorities_ranking', { by: 'users', kind: 'village', direction: null, limit: null });
    bad('get_authorities_ranking', { by: 'users', kind: null, direction: null, limit: 99 });
    bad('get_crm_authority_timeline', { query: '' });
    bad('get_finance_overview', { months: 0 });
    bad('get_finance_overview', { months: 25 });
    expect(validateAdminToolInput('get_authorities_ranking', { by: 'users', kind: null, direction: 'bottom', limit: 5 }).ok).toBe(true);
    expect(validateAdminToolInput('compare_authorities', { ids_or_names: ['a', 'b'] }).ok).toBe(true);
  });
  it('every definitionId is in the dictionary and every tool has a prompt rule', () => {
    const ids = METRIC_DEFS.map((d) => d.id);
    for (const id of ['authority_compare', 'authorities_ranking', 'crm_timeline', 'finance_overview']) expect(ids).toContain(id);
    const prompt = adminAssistantSystemPrompt();
    for (const n of NAMES) expect(prompt).toContain(n);
  });
  it('compare via the tool: unresolved names are not an error and carry no evidence', async () => {
    const { db } = fakeDb(DATA);
    const out = await executeAdminTool(ctx(db), 'compare_authorities', { ids_or_names: ['כפר', 'שדרות'] });
    expect(out.isError).toBe(false);
    expect(out.evidence).toBeUndefined();
    expect(out.content).toContain('כפר סבא');
  });
});
