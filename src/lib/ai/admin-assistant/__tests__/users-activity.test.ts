/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));

import { getSignupsOverview, getWorkoutsOverview, workoutKindOf } from '@/lib/admin-analytics/users-activity.server';
import { getUserLookup, maskEmail } from '@/lib/admin-analytics/user-lookup.server';
import { clearAnalyticsCache } from '@/lib/admin-analytics/cache.server';
import { executeAdminTool, type AdminToolContext } from '../execute.server';
import { ADMIN_TOOLS, validateAdminToolInput } from '../tools';
import { adminAssistantSystemPrompt } from '../prompt';

// Fake Admin SDK storing what the real one RETURNS: Dates come back as Timestamps with no
// .getTime() (axiom §31).
function ts(d: Date) {
  return { toDate: () => new Date(d.getTime()), toMillis: () => d.getTime(), seconds: Math.floor(d.getTime() / 1000), nanoseconds: 0 };
}
function wrap(v: any): any {
  if (v instanceof Date) return ts(v);
  if (Array.isArray(v)) return v.map(wrap);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wrap(x)]));
  return v;
}
const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
const cmpv = (v: any) => (v && typeof v.toMillis === 'function' ? v.toMillis() : v instanceof Date ? v.getTime() : v);

type Store = Record<string, Record<string, any>>;
function fakeDb(raw: Store, opts: { failCollections?: string[]; failCounts?: boolean } = {}) {
  const store: Store = Object.fromEntries(Object.entries(raw).map(([c, docs]) => [c, Object.fromEntries(Object.entries(docs).map(([id, d]) => [id, wrap(d)]))]));
  const query = (coll: string, wheres: Array<[string, string, unknown]>, lim?: number): any => ({
    where: (f: string, op: string, v: unknown) => query(coll, [...wheres, [f, op, v]], lim),
    select: () => query(coll, wheres, lim),
    limit: (n: number) => query(coll, wheres, n),
    count: () => ({
      get: async () => {
        if (opts.failCounts) throw new Error('FAILED_PRECONDITION');
        return { data: () => ({ count: run().length }) };
      },
    }),
    get: async () => {
      const docs = run().slice(0, lim ?? Infinity);
      return { docs, size: docs.length };
    },
  });
  const matches = (d: any, [f, op, v]: [string, string, unknown]) => {
    const x = cmpv(get(d, f));
    const y = cmpv(v);
    if (op === '==') return x === y;
    if (x === undefined || x === null) return false;
    if (op === '>=') return x >= (y as any);
    if (op === '<') return x < (y as any);
    throw new Error(`op ${op}`);
  };
  let run: () => any[] = () => [];
  const mk = (coll: string, wheres: Array<[string, string, unknown]>, lim?: number) => {
    const q = query(coll, wheres, lim);
    const orig = { get: q.get, count: q.count };
    return {
      ...q,
      where: (f: string, op: string, v: unknown) => mk(coll, [...wheres, [f, op, v]], lim),
      limit: (n: number) => mk(coll, wheres, n),
      select: () => mk(coll, wheres, lim),
      get: async () => {
        if (opts.failCollections?.includes(coll)) throw new Error('simulated failure');
        run = () => Object.entries(store[coll] ?? {}).filter(([, d]) => wheres.every((w) => matches(d, w))).map(([id, d]) => ({ id, exists: true, data: () => d }));
        return orig.get();
      },
      count: () => ({
        get: async () => {
          run = () => Object.entries(store[coll] ?? {}).filter(([, d]) => wheres.every((w) => matches(d, w))).map(([id, d]) => ({ id, exists: true, data: () => d }));
          return orig.count().get();
        },
      }),
    };
  };
  return {
    collection: (coll: string) => ({
      ...mk(coll, []),
      doc: (id: string) => ({ get: async () => ({ id, exists: store[coll]?.[id] !== undefined, data: () => store[coll]?.[id] }) }),
    }),
    getAll: async (...refs: any[]) => Promise.all(refs.map((r) => r.get())),
  } as any;
}

const NOW = new Date('2026-10-22T10:00:00Z');
const day = (n: number) => new Date(NOW.getTime() - n * 86400000);
const UID1 = 'abcdefghij0123456789ZZ';

const user = (createdDaysAgo: number, extra: any = {}) => ({ createdAt: day(createdDaysAgo), core: { name: 'x', ...(extra.core ?? {}) }, ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'core')) });

const STORE: Store = {
  authorities: { sderot: { name: 'שדרות' }, tlv: { name: { he: 'תל אביב' } } },
  users: {
    a1: user(1, { core: { authorityId: 'sderot' }, marketingAttribution: { source: 'Instagram', campaign: 'oct' } }),
    a2: user(2, { core: { authorityId: 'sderot' }, marketingAttribution: { source: 'instagram', campaign: 'oct' } }),
    a3: user(3, { core: { authorityId: 'tlv' } }),
    a4: user(4, { core: {} }),
    a5: user(5, { core: { authorityId: 'sderot' }, marketingAttribution: { source: 'tiktok' } }),
    a6: user(6, { core: { authorityId: 'sderot' }, marketingAttribution: { source: 'tiktok' } }),
    a7: user(7, { core: { authorityId: 'sderot' }, marketingAttribution: { source: 'tiktok' } }),
    // previous 10-day window
    p1: user(12, { core: { authorityId: 'sderot' } }),
    p2: user(15, { core: { authorityId: 'tlv' } }),
    // never counted: test + demo + mock
    t1: user(1, { core: { isTestData: true, authorityId: 'sderot' } }),
    t2: user(1, { core: { isMockData: true } }),
    demo_x: user(1, { core: {} }),
    // too old
    old: user(100, { core: { authorityId: 'sderot' } }),
  },
  workouts: {
    w1: { userId: 'a1', date: day(1), workoutType: 'strength', setsCompleted: 3 },
    w2: { userId: 'a1', date: day(2), workoutType: 'running', activityType: 'running' },
    w3: { userId: 'a2', date: day(2), workoutType: 'strength', setsCompleted: 0 }, // not real
    w4: { userId: 'a2', date: day(3), workoutType: 'recovery' }, // not real
    w5: { userId: 'a3', date: day(3), workoutType: 'walking' },
    w6: { userId: 'a1', date: day(12), workoutType: 'strength', setsCompleted: 2 }, // previous
    w7: { userId: 't1', date: day(1), workoutType: 'strength', setsCompleted: 5 }, // test user
    w8: { userId: 'ghost', date: day(1), workoutType: 'hybrid' }, // unknown user
    w9: { userId: 'a5', date: day(4), activityType: 'hybrid' },
  },
};

beforeEach(() => {
  clearAnalyticsCache();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('get_signups_overview', () => {
  it('counts real signups in the window vs the previous equal window, excluding test/demo', async () => {
    const r = await getSignupsOverview(fakeDb(STORE), { days: 10, groupBy: 'day', authorityId: null, source: null }, { now: NOW });
    const v = r.value!;
    expect(v.total).toBe(7);
    expect(v.previousTotal).toBe(2);
    expect(v.changePct).toBe(250);
    expect(v.series).toHaveLength(10);
    expect(v.series.reduce((a, s) => a + s.signups, 0)).toBe(7);
    expect(r.meta.definitionId).toBe('signups_overview');
    expect(r.meta.period.to).toBe('2026-10-22');
  });
  it('splits by city (named), source (case-folded, unattributed kept apart) and campaign; cells under 5 masked', async () => {
    const v = (await getSignupsOverview(fakeDb(STORE), { days: 10, groupBy: 'week', authorityId: null, source: null }, { now: NOW })).value!;
    const sderot = v.byCity.find((c) => c.authorityId === 'sderot')!;
    expect(sderot.name).toBe('שדרות');
    expect(sderot.count).toBe(5);
    expect(v.byCity.find((c) => c.authorityId === 'tlv')).toMatchObject({ name: 'תל אביב', count: '<5' });
    expect(v.withoutCity).toBe('<5');
    expect(v.bySource.find((s) => s.source === 'instagram')?.count).toBe('<5');
    expect(v.bySource.find((s) => s.source === 'unattributed')?.count).toBe('<5');
    expect(v.byCampaign).toEqual([{ campaign: 'oct', count: '<5' }]);
    expect(v.unattributedPct).toBe(28.6);
    expect(v.series).toHaveLength(2); // 10 days → 7 + 3
  });
  it('applies authority and source filters', async () => {
    const v = (await getSignupsOverview(fakeDb(STORE), { days: 10, groupBy: 'day', authorityId: 'sderot', source: 'TikTok' }, { now: NOW })).value!;
    expect(v.total).toBe(3);
    expect(v.filters).toEqual({ authorityId: 'sderot', source: 'tiktok' });
  });
  it('a missing previous period gives changePct null, not 0 / Infinity', async () => {
    const v = (await getSignupsOverview(fakeDb({ users: { a: user(1, { core: {} }) } }), { days: 5, groupBy: 'day', authorityId: null, source: null }, { now: NOW })).value!;
    expect(v.previousTotal).toBe(0);
    expect(v.changePct).toBeNull();
  });
  it('daily grouping over >60 days falls back to weeks with a caveat', async () => {
    const r = await getSignupsOverview(fakeDb(STORE), { days: 120, groupBy: 'day', authorityId: null, source: null }, { now: NOW });
    expect(r.value!.groupBy).toBe('week');
    expect(r.meta.caveats.join(' ')).toMatch(/grouped by week/);
  });
  it('a failed users read → value null (never zeros)', async () => {
    const r = await getSignupsOverview(fakeDb(STORE, { failCollections: ['users'] }), { days: 10, groupBy: 'day', authorityId: null, source: null }, { now: NOW });
    expect(r.value).toBeNull();
    expect(r.error).toBeTruthy();
  });
});

describe('get_workouts_overview', () => {
  it('counts only real workouts of real accounts, by type, with per-active-user and previous period', async () => {
    const r = await getWorkoutsOverview(fakeDb(STORE), { days: 10, authorityId: null }, { now: NOW });
    const v = r.value!;
    expect(v.current).toEqual({ workouts: 4, activeUsers: 3, perActiveUser: 1.3 }); // w1,w2,w5,w9
    expect(v.previous.workouts).toBe(1); // w6
    expect(v.changePct).toBe(300);
    expect(Object.fromEntries(v.byType.map((t) => [t.type, t.count]))).toEqual({ strength: 1, running: 1, walking: 1, hybrid: 1 });
    expect(v.notCounted).toBe(2); // w3, w4
    expect(v.completionRate).toBeNull();
    expect(r.meta.caveats.join(' ')).toMatch(/completion rate is not available/);
  });
  it('filters by the user\'s authority', async () => {
    const v = (await getWorkoutsOverview(fakeDb(STORE), { days: 10, authorityId: 'tlv' }, { now: NOW })).value!;
    expect(v.current.workouts).toBe(1);
    expect(v.byType).toEqual([{ type: 'walking', count: 1 }]);
  });
  it('no active users → perActiveUser null, not 0', async () => {
    const v = (await getWorkoutsOverview(fakeDb(STORE), { days: 10, authorityId: 'nobody' }, { now: NOW })).value!;
    expect(v.current).toEqual({ workouts: 0, activeUsers: 0, perActiveUser: null });
    expect(v.changePct).toBeNull();
  });
  it('a failed workouts read → value null', async () => {
    const r = await getWorkoutsOverview(fakeDb(STORE, { failCollections: ['workouts'] }), { days: 10, authorityId: null }, { now: NOW });
    expect(r.value).toBeNull();
  });
  it('workoutKindOf maps legacy names', () => {
    expect(workoutKindOf({ workoutType: 'workout' })).toBe('strength');
    expect(workoutKindOf({ activityType: 'walk' })).toBe('walking');
    expect(workoutKindOf({})).toBe('other');
  });
});

// ── user lookup ──────────────────────────────────────────────────────────
const SENSITIVE_KEYS = ['health', 'birthDate', 'phone', 'weight', 'gender', 'anchorLat', 'anchorLng', 'fcmTokens', 'medical', 'biometric', 'location', 'heartRate', 'injuries'];
const SENSITIVE_VALUES = ['1990-05-05', '+972501234567', 'SECRET-TOKEN-123', 'diabetes', 'dana.cohen@gmail.com', '32.0853'];

const fullUser = (name: string, email: string, extra: any = {}) => ({
  createdAt: day(30),
  lastActive: day(2),
  onboardingStatus: 'completed',
  onboardingStep: 'done',
  onboardingComplete: true,
  marketingAttribution: { source: 'Instagram', campaign: 'oct', landingPage: '/x' },
  progression: { currentStreak: 4, globalXP: 900 },
  core: {
    name,
    email,
    phone: '+972501234567',
    birthDate: new Date('1990-05-05'),
    weight: 70,
    gender: 'female',
    anchorLat: 32.0853,
    anchorLng: 34.78,
    authorityId: 'sderot',
    isApproved: true,
    isTenantOwner: true,
    role: 'tenant_owner',
    ...extra.core,
  },
  health: { conditions: ['diabetes'], heartRate: 61 },
  medical: { injuries: ['knee'] },
  biometric: { bodyFat: 18 },
  fcmTokens: ['SECRET-TOKEN-123'],
  ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'core')),
});

const LOOKUP: Store = {
  authorities: { sderot: { name: 'שדרות' } },
  users: {
    [UID1]: fullUser('דנה כהן', 'dana.cohen@gmail.com'),
    u2: fullUser('דנה לוי', 'dana.levi@gmail.com'),
    u3: fullUser('דני', 'danny@x.co'),
    anon: { createdAt: day(1), core: { name: 'אורח', isTestData: true } },
  },
  workouts: { w1: { userId: UID1 }, w2: { userId: UID1 }, w3: { userId: 'u2' } },
};

describe('get_user_lookup', () => {
  it('resolves by uid, email and exact name', async () => {
    const byUid = await getUserLookup(fakeDb(LOOKUP), UID1, { now: NOW });
    expect(byUid).toMatchObject({ kind: 'resolved', matchedBy: 'uid' });
    const byEmail = await getUserLookup(fakeDb(LOOKUP), 'Dana.Cohen@gmail.com'.toLowerCase(), { now: NOW });
    expect(byEmail).toMatchObject({ kind: 'resolved', matchedBy: 'email' });
    const byName = await getUserLookup(fakeDb(LOOKUP), 'דנה כהן', { now: NOW });
    expect(byName).toMatchObject({ kind: 'resolved', matchedBy: 'name' });
  });
  it('output shape: operational fields only', async () => {
    const r = await getUserLookup(fakeDb(LOOKUP), UID1, { now: NOW });
    const p = r.kind === 'resolved' ? r.result.value! : null;
    expect(p).toMatchObject({
      uid: UID1,
      displayName: 'דנה כהן',
      maskedEmail: 'd***@gmail.com',
      authorityId: 'sderot',
      authorityName: 'שדרות',
      accountKind: 'real',
      roleFlags: ['isTenantOwner', 'isApproved'],
      role: 'tenant_owner',
      signupDate: '2026-09-22',
      signupSource: 'instagram',
      signupCampaign: 'oct',
      lastActive: '2026-10-20',
      workoutsCount: 2,
      currentStreak: 4,
      onboarding: { status: 'completed', step: 'done', complete: true },
    });
  });
  it('ambiguous name → up to 5 masked candidates, no profile details', async () => {
    const r = await getUserLookup(fakeDb(LOOKUP), 'דנ', { now: NOW });
    expect(r.kind).toBe('ambiguous');
    if (r.kind !== 'ambiguous') return;
    expect(r.candidates.length).toBeLessThanOrEqual(5);
    expect(r.candidates.map((c) => c.maskedEmail).sort()).toEqual(['d***@gmail.com', 'd***@gmail.com', 'd***@x.co']);
    expect(Object.keys(r.candidates[0]).sort()).toEqual(['authorityId', 'authorityName', 'displayName', 'maskedEmail', 'uid']);
  });
  it('caps candidates at 5 and says more exist', async () => {
    const users = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`m${i}`, fullUser(`משה ${i}`, `m${i}@x.co`)]));
    const r = await getUserLookup(fakeDb({ users }), 'משה', { now: NOW });
    expect(r.kind === 'ambiguous' && r.candidates.length).toBe(5);
    expect(r.kind === 'ambiguous' && r.more).toBe(true);
  });
  it('no match → none; failed read → unavailable', async () => {
    expect((await getUserLookup(fakeDb(LOOKUP), 'nobody@x.co', { now: NOW })).kind).toBe('none');
    expect((await getUserLookup(fakeDb(LOOKUP, { failCollections: ['users'] }), 'נועה', { now: NOW })).kind).toBe('unavailable');
  });
  it('a failed workouts count is null with a caveat, never 0', async () => {
    const r = await getUserLookup(fakeDb(LOOKUP, { failCounts: true }), UID1, { now: NOW });
    expect(r.kind).toBe('resolved');
    if (r.kind !== 'resolved') return;
    expect(r.result.value!.workoutsCount).toBeNull();
    expect(r.result.meta.caveats.join(' ')).toMatch(/workoutsCount: could not be counted/);
  });
  it('missing optional fields come back null, not invented', async () => {
    const r = await getUserLookup(fakeDb({ users: { [UID1]: { core: { name: 'ריקה' } } } }), UID1, { now: NOW });
    const p = r.kind === 'resolved' ? r.result.value! : null;
    expect(p).toMatchObject({ maskedEmail: null, authorityId: null, signupDate: null, lastActive: null, currentStreak: null, signupSource: 'unattributed', roleFlags: [] });
    expect(p!.onboarding).toEqual({ status: null, step: null, complete: null });
  });
  it('flags test accounts', async () => {
    const r = await getUserLookup(fakeDb(LOOKUP), 'אורח', { now: NOW });
    expect(r.kind === 'resolved' && r.result.value!.accountKind).toBe('test_or_demo');
  });

  it('NEVER outputs health / birth date / phone / location / token data — keys or values', async () => {
    const db = fakeDb(LOOKUP);
    const resolved = await getUserLookup(db, UID1, { now: NOW });
    const ambiguous = await getUserLookup(db, 'דנ', { now: NOW });
    const viaTool = await executeAdminTool({ uid: 'a', role: 'super', db, now: NOW }, 'get_user_lookup', { query: UID1 });
    for (const out of [JSON.stringify(resolved), JSON.stringify(ambiguous), viaTool.content]) {
      for (const k of SENSITIVE_KEYS) expect(out.toLowerCase()).not.toContain(`"${k.toLowerCase()}"`);
      for (const v of SENSITIVE_VALUES) expect(out).not.toContain(v);
    }
    expect(maskEmail('dana.cohen@gmail.com')).toBe('d***@gmail.com');
    expect(maskEmail('nope')).toBeNull();
  });
});

// ── tool wiring ──────────────────────────────────────────────────────────
describe('tool wiring', () => {
  const ctx = (db: any): AdminToolContext => ({ uid: 'u', role: 'super', db, now: NOW });
  it('strict input schemas', () => {
    expect(validateAdminToolInput('get_signups_overview', { days: 30, groupBy: 'week', authorityId: null, source: null }).ok).toBe(true);
    for (const bad of [
      { days: 0, groupBy: 'day', authorityId: null, source: null },
      { days: 181, groupBy: 'day', authorityId: null, source: null },
      { days: 30, groupBy: 'month', authorityId: null, source: null },
      { days: 30, groupBy: 'day', authorityId: null, source: null, extra: 1 },
      { days: 30, groupBy: 'day', authorityId: 'a b', source: null },
      { days: 30, groupBy: 'day' },
    ]) expect(validateAdminToolInput('get_signups_overview', bad).ok).toBe(false);
    expect(validateAdminToolInput('get_workouts_overview', { days: 7, authorityId: null }).ok).toBe(true);
    expect(validateAdminToolInput('get_workouts_overview', { days: 7, authorityId: null, x: 1 }).ok).toBe(false);
    expect(validateAdminToolInput('get_user_lookup', { query: 'a@b.co' }).ok).toBe(true);
    expect(validateAdminToolInput('get_user_lookup', { query: 'x' }).ok).toBe(false);
    expect(validateAdminToolInput('get_user_lookup', { query: 'abc', uid: 'q' }).ok).toBe(false);
  });
  it('registered last-ish, super role, data tools, prompt rules present', () => {
    for (const n of ['get_signups_overview', 'get_workouts_overview', 'get_user_lookup']) {
      const t = ADMIN_TOOLS.find((x) => x.name === n)!;
      expect(t).toMatchObject({ minRole: 'super', dataTool: true });
      expect(adminAssistantSystemPrompt()).toContain(n);
    }
    expect(adminAssistantSystemPrompt()).toContain('signups_overview —');
  });
  it('signups tool: null result becomes an error, not zero', async () => {
    const r = await executeAdminTool(ctx(fakeDb(STORE, { failCollections: ['users'] })), 'get_signups_overview', { days: 7, groupBy: 'day', authorityId: null, source: null });
    expect(r.isError).toBe(true);
    expect(r.content).toContain('NOT zero');
  });
  it('signups tool: ok result carries evidence with the definition id', async () => {
    const r = await executeAdminTool(ctx(fakeDb(STORE)), 'get_signups_overview', { days: 10, groupBy: 'day', authorityId: null, source: null });
    expect(r.isError).toBe(false);
    expect(r.evidence?.definitionId).toBe('signups_overview');
  });
  it('lookup tool: a single hit gives the user-page button; candidates give none', async () => {
    const one = await executeAdminTool(ctx(fakeDb(LOOKUP)), 'get_user_lookup', { query: UID1 });
    expect(one.link?.href).toBe(`/admin/users/${UID1}`);
    const many = await executeAdminTool(ctx(fakeDb(LOOKUP)), 'get_user_lookup', { query: 'דנ' });
    expect(many.link).toBeUndefined();
    expect(many.content).toContain('candidates');
    const none = await executeAdminTool(ctx(fakeDb(LOOKUP)), 'get_user_lookup', { query: 'zzz@x.co' });
    expect(none.isError).toBe(false);
    expect(none.content).toContain('no user found');
  });
});

describe('audit row masking', () => {
  it('get_user_lookup queries are never stored raw', async () => {
    const { auditInput } = await import('../audit-input');
    const email = auditInput('get_user_lookup', { query: 'dana.cohen@gmail.com' });
    expect(email).toBe('{"query":"d***@gmail.com"}');
    const name = auditInput('get_user_lookup', { query: 'דנה כהן' });
    expect(name).toBe('{"query":"ד. כ."}');
    expect(auditInput('get_user_lookup', { query: UID1 })).toContain(UID1);
    expect(auditInput('get_user_lookup', { query: 5 })).toBe('{}');
    expect(auditInput('get_workouts_overview', { days: 7, authorityId: null })).toBe('{"days":7,"authorityId":null}');
    expect(email).not.toContain('dana');
    expect(name).not.toContain('דנה');
  });
  it('turn.ts writes the masked input into the audit tools list', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync(new URL('../turn.ts', import.meta.url), 'utf8'));
    expect(src).toContain('auditInput(tu.name, tu.input)');
    expect(src).not.toContain('JSON.stringify(tu.input');
  });
});
